const { randomUUID } = require('crypto');
const { query, withTransaction } = require('../config/db');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const paystackService = require('./paystackService');
const notificationService = require('./notificationService');
const platformSettingsService = require('./platformSettingsService');
const { recordAuditEvent } = require('../security/auditLogger');

function assertPlanConfigured() {
  if (!env.PAYSTACK_PRO_PLAN_CODE) {
    throw new AppError('PRO subscriptions are not configured on this server yet.', 503, 'PRO_NOT_CONFIGURED');
  }
}

/**
 * Starts a PRO purchase. Refuses if the worker already has an active,
 * non-expired subscription — prevents accidentally starting (and
 * paying for) a second concurrent subscription.
 */
async function initiateSubscription(workerUserId, { payerEmail, callbackUrl }) {
  assertPlanConfigured();

  const { rows: activeRows } = await query(
    `SELECT id FROM subscriptions WHERE worker_user_id = $1 AND status = 'active' AND (expiry_date IS NULL OR expiry_date > now())`,
    [workerUserId]
  );
  if (activeRows.length > 0) {
    throw new AppError('You already have an active PRO subscription.', 409, 'ALREADY_SUBSCRIBED');
  }

  const reference = `sub_${randomUUID()}`;
  const amount = await platformSettingsService.getProMonthlyPriceNgn();

  const { rows } = await query(
    `INSERT INTO subscriptions (worker_user_id, plan, amount, paystack_reference, status)
     VALUES ($1, 'pro_monthly', $2, $3, 'pending') RETURNING *`,
    [workerUserId, amount, reference]
  );
  const subscription = rows[0];

  const paystackData = await paystackService.initializeSubscriptionTransaction({
    email: payerEmail,
    planCode: env.PAYSTACK_PRO_PLAN_CODE,
    reference,
    callbackUrl,
    metadata: { workerUserId, subscriptionId: subscription.id },
  });

  return { subscription, authorizationUrl: paystackData.authorization_url, reference };
}

/** Activates PRO on the worker's profile — the only place these two columns are ever written. */
async function activateProOnProfile(workerUserId, expiryDate, client) {
  const runner = client || { query };
  await runner.query('UPDATE worker_profiles SET is_pro = true, pro_expires_at = $2 WHERE user_id = $1', [
    workerUserId,
    expiryDate,
  ]);
}

async function deactivateProOnProfile(workerUserId, client) {
  const runner = client || { query };
  await runner.query('UPDATE worker_profiles SET is_pro = false WHERE user_id = $1', [workerUserId]);
}

/**
 * Idempotent finalization for the *initial* subscription payment,
 * shared by the webhook and a manual verify-by-reference fallback —
 * same pattern as escrowService.finalizeFunding. Guarded by
 * `status = 'pending'` so a second call is a safe no-op.
 */
async function finalizeInitialPayment(reference) {
  const verified = await paystackService.verifyTransaction(reference);
  if (verified.status !== 'success') {
    await query(`UPDATE subscriptions SET status = 'failed' WHERE paystack_reference = $1 AND status = 'pending'`, [
      reference,
    ]);
    throw new AppError('Payment was not successful.', 400, 'PAYMENT_NOT_SUCCESSFUL');
  }

  return withTransaction(async (client) => {
    const { rows: updated } = await client.query(
      `UPDATE subscriptions
          SET status = 'active', start_date = now(), expiry_date = now() + interval '30 days'
        WHERE paystack_reference = $1 AND status = 'pending'
        RETURNING *`,
      [reference]
    );

    if (updated.length === 0) return { alreadyProcessed: true };

    const subscription = updated[0];

    await client.query(
      `INSERT INTO subscription_payments (subscription_id, amount, currency, paystack_reference, paystack_transaction_id, billing_period_start, billing_period_end)
       VALUES ($1, $2, $3, $4, $5, now(), now() + interval '30 days')
       ON CONFLICT (paystack_reference) DO NOTHING`,
      [subscription.id, subscription.amount, subscription.currency, reference, String(verified.id)]
    );

    await activateProOnProfile(subscription.worker_user_id, subscription.expiry_date, client);

    notificationService.notifyUser(subscription.worker_user_id, 'subscription_activated', {
      title: 'JOB RUSH PRO activated',
      body: "You're now PRO! Enjoy priority visibility and advanced analytics.",
      data: {
        subscriptionId: subscription.id,
        planName: subscription.plan,
        amount: subscription.amount,
        currency: subscription.currency,
        billingCycle: 'Monthly',
        nextBillingDate: subscription.expiry_date,
      },
    }).catch(() => {});

    return { alreadyProcessed: false, subscription };
  });
}

/**
 * Handles a renewal charge — a `charge.success` webhook for a
 * reference this platform didn't initiate directly (Paystack billed
 * the card automatically). Matched to the existing subscription via
 * the customer email in the event, since renewal references are new
 * each cycle.
 */
async function recordRenewalPayment(event) {
  const email = event.data?.customer?.email;
  const reference = event.data?.reference;
  if (!email || !reference) return;

  const { rows } = await query(
    `SELECT s.* FROM subscriptions s
       JOIN users u ON u.id = s.worker_user_id
      WHERE u.email = $1 AND s.status IN ('active', 'failed')
      ORDER BY s.created_at DESC LIMIT 1`,
    [email]
  );
  const subscription = rows[0];
  if (!subscription) return;

  const { rows: existingPayment } = await query('SELECT id FROM subscription_payments WHERE paystack_reference = $1', [
    reference,
  ]);
  if (existingPayment.length > 0) return; // already recorded — idempotent

  return withTransaction(async (client) => {
    const newExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await client.query(
      `INSERT INTO subscription_payments (subscription_id, amount, currency, paystack_reference, paystack_transaction_id, billing_period_start, billing_period_end)
       VALUES ($1, $2, $3, $4, $5, now(), $6)`,
      [subscription.id, subscription.amount, subscription.currency, reference, String(event.data.id), newExpiry]
    );

    await client.query(`UPDATE subscriptions SET status = 'active', expiry_date = $2 WHERE id = $1`, [
      subscription.id,
      newExpiry,
    ]);

    await activateProOnProfile(subscription.worker_user_id, newExpiry, client);

    notificationService.notifyUser(subscription.worker_user_id, 'subscription_renewed', {
      title: 'JOB RUSH PRO renewed',
      body: 'Your JOB RUSH PRO membership has been successfully renewed.',
      data: { expiryDate: newExpiry.toISOString(), subscriptionId: subscription.id },
    }).catch(() => {});
  });
}

/** Stores the Paystack subscription_code/email_token once Paystack creates the subscription. */
async function recordSubscriptionCreated(event) {
  const reference = event.data?.most_recent_invoice?.transaction?.reference || event.data?.reference;
  const subscriptionCode = event.data?.subscription_code;
  const emailToken = event.data?.email_token;
  if (!subscriptionCode) return;

  if (reference) {
    await query(
      `UPDATE subscriptions SET paystack_subscription_code = $2, paystack_email_token = $3 WHERE paystack_reference = $1`,
      [reference, subscriptionCode, emailToken]
    );
  }
}

/** Cancellation lands here — PRO benefits continue until the already-paid period ends. */
async function recordSubscriptionDisabled(event) {
  const subscriptionCode = event.data?.subscription_code;
  if (!subscriptionCode) return;
  await query(
    `UPDATE subscriptions SET auto_renew = false, cancelled_at = now() WHERE paystack_subscription_code = $1 AND status = 'active'`,
    [subscriptionCode]
  );
}

async function handleWebhookEvent(event) {
  switch (event.event) {
    case 'charge.success':
      if (event.data?.plan) {
        // Try initial-payment finalization first; if that reference
        // isn't a pending row of ours, treat it as a renewal charge.
        await finalizeInitialPayment(event.data.reference).catch(() => recordRenewalPayment(event));
      }
      break;
    case 'subscription.create':
      await recordSubscriptionCreated(event);
      break;
    case 'subscription.disable':
    case 'subscription.not_renew':
      await recordSubscriptionDisabled(event);
      break;
    default:
      break;
  }
}

/**
 * Lazy expiry check: called whenever a subscription is read. If the
 * paid period has passed and nothing renewed it, PRO is revoked here
 * rather than waiting for a scheduled job that doesn't exist yet in
 * this backend (see README — a real cron/worker should also call
 * this proactively rather than relying only on read-time checks).
 */
async function syncExpiry(workerUserId) {
  const { rows } = await query(
    `SELECT * FROM subscriptions WHERE worker_user_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
    [workerUserId]
  );
  const subscription = rows[0];
  if (subscription && subscription.expiry_date && new Date(subscription.expiry_date) < new Date()) {
    await withTransaction(async (client) => {
      await client.query(`UPDATE subscriptions SET status = 'expired' WHERE id = $1`, [subscription.id]);
      await deactivateProOnProfile(workerUserId, client);
    });
    notificationService.notifyUser(workerUserId, 'subscription_expired', {
      title: 'PRO subscription expired',
      body: 'Your JOB RUSH PRO subscription has expired. Resubscribe to keep your priority visibility.',
      data: { subscriptionId: subscription.id, expiryDate: subscription.expiry_date },
    }).catch(() => {});
  }
}

async function getOwnSubscription(workerUserId) {
  await syncExpiry(workerUserId);
  const { rows } = await query(
    'SELECT * FROM subscriptions WHERE worker_user_id = $1 ORDER BY created_at DESC LIMIT 1',
    [workerUserId]
  );
  return rows[0] || null;
}

async function listOwnPaymentHistory(workerUserId) {
  const { rows } = await query(
    `SELECT sp.* FROM subscription_payments sp
       JOIN subscriptions s ON s.id = sp.subscription_id
      WHERE s.worker_user_id = $1 ORDER BY sp.created_at DESC`,
    [workerUserId]
  );
  return rows;
}

/** Worker-initiated cancellation — stops future renewals; current period's PRO access is untouched. */
async function cancelOwnSubscription(workerUserId) {
  const subscription = await getOwnSubscription(workerUserId);
  if (!subscription || subscription.status !== 'active') {
    throw new AppError('No active subscription to cancel.', 400, 'NO_ACTIVE_SUBSCRIPTION');
  }
  if (!subscription.paystack_subscription_code) {
    throw new AppError('This subscription cannot be cancelled yet — please try again shortly.', 400, 'NOT_READY');
  }

  await paystackService.disableSubscription({
    subscriptionCode: subscription.paystack_subscription_code,
    emailToken: subscription.paystack_email_token,
  });

  const { rows } = await query(
    `UPDATE subscriptions SET auto_renew = false, cancelled_at = now() WHERE id = $1 RETURNING *`,
    [subscription.id]
  );

  notificationService.notifyUser(workerUserId, 'subscription_cancelled', {
    title: 'JOB RUSH PRO cancelled',
    body: 'Your JOB RUSH PRO membership has been cancelled.',
    data: { expiryDate: rows[0].expiry_date, subscriptionId: subscription.id },
  }).catch(() => {});

  return rows[0];
}

// --- Admin ---

async function listSubscriptionsForAdmin(statusFilter) {
  const params = [];
  let sql = `SELECT s.*, u.full_name, u.email FROM subscriptions s JOIN users u ON u.id = s.worker_user_id`;
  if (statusFilter) {
    params.push(statusFilter);
    sql += ` WHERE s.status = $1`;
  }
  sql += ' ORDER BY s.created_at DESC';
  const { rows } = await query(sql, params);
  return rows;
}

async function getRevenueSummary() {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS payment_count, COALESCE(SUM(amount), 0) AS total_revenue
       FROM subscription_payments WHERE status = 'success'`
  );
  return rows[0];
}

/** Admin-only: immediately revokes PRO regardless of paid period — for abuse/policy violations. */
async function suspendSubscription(subscriptionId, adminUserId, reason) {
  const { rows } = await query('SELECT * FROM subscriptions WHERE id = $1', [subscriptionId]);
  const subscription = rows[0];
  if (!subscription) throw new AppError('Subscription not found.', 404, 'NOT_FOUND');

  return withTransaction(async (client) => {
    await client.query(
      `UPDATE subscriptions SET status = 'suspended', suspended_at = now(), suspension_reason = $2 WHERE id = $1`,
      [subscriptionId, reason || null]
    );
    await deactivateProOnProfile(subscription.worker_user_id, client);

    await recordAuditEvent({
      actorUserId: adminUserId,
      action: 'SUBSCRIPTION_SUSPENDED',
      resourceType: 'subscription',
      resourceId: subscriptionId,
      result: 'success',
      metadata: { reason },
    });
  });
}

/**
 * Admin-only: reverses an admin suspension. Only meaningful while the
 * paid period hasn't actually lapsed yet — if expiry_date has already
 * passed, there's nothing to restore to; the worker would need to buy
 * a new subscription, same as any other expiry.
 */
async function restoreSubscription(subscriptionId, adminUserId) {
  const { rows } = await query('SELECT * FROM subscriptions WHERE id = $1', [subscriptionId]);
  const subscription = rows[0];
  if (!subscription) throw new AppError('Subscription not found.', 404, 'NOT_FOUND');
  if (subscription.status !== 'suspended') {
    throw new AppError(`Cannot restore a subscription with status "${subscription.status}".`, 400, 'INVALID_STATUS_TRANSITION');
  }
  if (subscription.expiry_date && new Date(subscription.expiry_date) <= new Date()) {
    throw new AppError('This subscription\'s paid period has already ended — it cannot be restored.', 400, 'ALREADY_EXPIRED');
  }

  return withTransaction(async (client) => {
    const { rows: updated } = await client.query(
      `UPDATE subscriptions SET status = 'active', suspended_at = NULL, suspension_reason = NULL WHERE id = $1 RETURNING *`,
      [subscriptionId]
    );
    await activateProOnProfile(subscription.worker_user_id, subscription.expiry_date, client);

    await recordAuditEvent({
      actorUserId: adminUserId,
      action: 'SUBSCRIPTION_RESTORED',
      resourceType: 'subscription',
      resourceId: subscriptionId,
      result: 'success',
    });

    return updated[0];
  });
}

module.exports = {
  initiateSubscription,
  finalizeInitialPayment,
  handleWebhookEvent,
  getOwnSubscription,
  listOwnPaymentHistory,
  cancelOwnSubscription,
  listSubscriptionsForAdmin,
  getRevenueSummary,
  suspendSubscription,
  restoreSubscription,
};
