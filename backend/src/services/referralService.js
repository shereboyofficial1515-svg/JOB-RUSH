const crypto = require('crypto');
const { query, withTransaction } = require('../config/db');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const notificationService = require('./notificationService');
const walletService = require('./walletService');
const { recordAuditEvent } = require('../security/auditLogger');
const logger = require('../utils/logger');

const MILESTONE = 12;
const REWARD_AMOUNT = 15000;

// Excludes 0/O/1/I so a code read aloud or hand-typed is never ambiguous.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateCode() {
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)];
  }
  return `JR-${code}`;
}

/** Same one-origin convention authController.getOAuthRedirectBase() already uses. */
function getAppBaseUrl() {
  return env.APP_BASE_URL.split(',')[0].trim();
}

function buildReferralLink(code) {
  return `${getAppBaseUrl()}/pages/register.html?ref=${encodeURIComponent(code)}`;
}

/**
 * Every user has exactly one referral code, generated lazily on first
 * access rather than at registration -- same pattern user_settings
 * already uses (ensureSettingsRow). Retries on the astronomically
 * unlikely event of a collision; the column's UNIQUE constraint is
 * the actual safety net.
 */
async function getOrCreateReferralCode(userId) {
  const { rows } = await query('SELECT referral_code FROM users WHERE id = $1', [userId]);
  if (rows[0]?.referral_code) return rows[0].referral_code;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateCode();
    try {
      const { rows: updated } = await query(
        'UPDATE users SET referral_code = $1 WHERE id = $2 AND referral_code IS NULL RETURNING referral_code',
        [code, userId]
      );
      if (updated[0]) return updated[0].referral_code;
      // Someone else concurrently set it first (or it raced with this
      // same function elsewhere) -- read back whatever won.
      const { rows: reread } = await query('SELECT referral_code FROM users WHERE id = $1', [userId]);
      if (reread[0]?.referral_code) return reread[0].referral_code;
    } catch (err) {
      if (err.code !== '23505') throw err; // unique_violation -- retry with a new code
    }
  }
  throw new AppError('Could not generate a referral code. Please try again.', 500, 'REFERRAL_CODE_GENERATION_FAILED');
}

/**
 * Called from inside authService.registerUser's transaction, after the
 * new user row is inserted. Never throws for an invalid/missing/self
 * code -- a referral code is optional metadata, not a required field,
 * so a bad one should never block registration. Self-referral (using
 * your OWN code) is impossible by construction here since the
 * referred user has just been created and cannot already own a code
 * matching itself; the real abuse case (one person's second account
 * using their first account's code) is instead soft-flagged below via
 * an IP match, for admin review -- not hard-blocked, to avoid
 * penalizing shared-household/office signups.
 */
async function attributeReferral(client, { referredUserId, referralCode, registrationIp }) {
  if (!referralCode) return null;

  const { rows: referrerRows } = await client.query(
    'SELECT id, last_login_ip FROM users WHERE referral_code = $1',
    [referralCode.trim().toUpperCase()]
  );
  const referrer = referrerRows[0];
  if (!referrer) return null; // unknown/expired code -- silently ignored, not an error
  if (referrer.id === referredUserId) return null; // defensive; not reachable in practice

  const flagged = !!(registrationIp && referrer.last_login_ip && String(referrer.last_login_ip) === String(registrationIp));

  const { rows } = await client.query(
    `INSERT INTO referrals (referrer_user_id, referred_user_id, referral_code_used, registration_ip, flagged_for_review, flagged_reason)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [referrer.id, referredUserId, referralCode.trim().toUpperCase(), registrationIp || null, flagged, flagged ? 'Registration IP matches referrer\'s last known IP' : null]
  );

  notificationService
    .notifyUser(referrer.id, 'referral_new_signup', {
      title: 'Someone joined through your referral link',
      body: 'They still need to complete a Job Rush activity and share feedback before this counts toward your reward.',
      data: { referralId: rows[0].id },
    })
    .catch(() => {});

  notificationService
    .notifyUser(referredUserId, 'referred_welcome', {
      title: 'You joined Job Rush through a referral',
      body: 'Complete your profile and share your experience to help the person who referred you.',
      data: { referralId: rows[0].id },
    })
    .catch(() => {});

  return rows[0].id;
}

/** The row for the account that WAS referred (i.e. where they are the referred_user_id), if any. */
async function getOwnReferralRow(userId) {
  const { rows } = await query('SELECT * FROM referrals WHERE referred_user_id = $1', [userId]);
  return rows[0] || null;
}

/**
 * Flips a referral to `qualified` the instant BOTH the activity and
 * feedback requirements are met, in whichever order they happened to
 * be completed in -- then checks whether the referrer just crossed
 * the 12-qualified-referrals milestone.
 */
async function tryQualify(client, referralId) {
  const { rows } = await client.query('SELECT * FROM referrals WHERE id = $1 FOR UPDATE', [referralId]);
  const referral = rows[0];
  if (!referral || referral.status === 'qualified' || referral.status === 'disqualified') return;
  if (!referral.activity_completed_at || !referral.feedback_submitted_at) return;

  await client.query(
    `UPDATE referrals SET status = 'qualified', qualified_at = now() WHERE id = $1`,
    [referralId]
  );

  await recordAuditEvent({
    actorUserId: referral.referred_user_id,
    action: 'REFERRAL_QUALIFIED',
    resourceType: 'referral',
    resourceId: referralId,
    result: 'success',
  });

  notificationService
    .notifyUser(referral.referrer_user_id, 'referral_qualified', {
      title: 'One of your referrals just qualified',
      body: 'They completed the required activity and shared their feedback.',
      data: { referralId },
    })
    .catch(() => {});

  await checkMilestone(client, referral.referrer_user_id);
}

/**
 * Race-safe by construction: the UNIQUE (referrer_user_id, milestone)
 * constraint on referral_rewards -- not this function's own logic --
 * is what actually prevents two simultaneous qualifications from both
 * creating a reward row. `INSERT ... ON CONFLICT DO NOTHING` means
 * only the call that genuinely wins gets a row back, so only it sends
 * the "you're eligible" notification.
 */
async function checkMilestone(client, referrerUserId) {
  const { rows: countRows } = await client.query(
    `SELECT COUNT(*)::int AS qualified_count FROM referrals WHERE referrer_user_id = $1 AND status = 'qualified'`,
    [referrerUserId]
  );
  if (countRows[0].qualified_count < MILESTONE) return;

  const { rows: rewardRows } = await client.query(
    `INSERT INTO referral_rewards (referrer_user_id, milestone, amount)
     VALUES ($1, $2, $3)
     ON CONFLICT (referrer_user_id, milestone) DO NOTHING
     RETURNING id`,
    [referrerUserId, MILESTONE, REWARD_AMOUNT]
  );
  if (rewardRows.length === 0) return; // already eligible from a prior check -- nothing new to announce

  await recordAuditEvent({
    actorUserId: referrerUserId,
    action: 'REFERRAL_REWARD_ELIGIBLE',
    resourceType: 'referral_reward',
    resourceId: rewardRows[0].id,
    result: 'success',
    metadata: { milestone: MILESTONE, amount: REWARD_AMOUNT },
  });

  notificationService
    .notifyUser(referrerUserId, 'referral_milestone_reached', {
      title: `You've reached ${MILESTONE} qualified referrals`,
      body: `Your ₦${REWARD_AMOUNT.toLocaleString()} referral reward is now eligible for admin review.`,
      data: { rewardId: rewardRows[0].id },
    })
    .catch(() => {});
}

/**
 * Marks the qualifying activity for whichever referral (if any) has
 * this user as the referred party. Called from the four existing
 * "publish something real" service functions -- never invoked
 * standalone by an endpoint, so it can't be spoofed from the client.
 * A no-op if this user wasn't referred, or already has an activity
 * recorded (first real activity wins; doesn't reset on later ones).
 */
async function markActivityCompleted(userId, activityType) {
  try {
    await withTransaction(async (client) => {
      const { rows } = await client.query(
        `UPDATE referrals
            SET activity_type = $2, activity_completed_at = now()
          WHERE referred_user_id = $1 AND activity_completed_at IS NULL AND status <> 'disqualified'
          RETURNING id`,
        [userId, activityType]
      );
      if (rows.length === 0) return;
      await tryQualify(client, rows[0].id);
    });
  } catch (err) {
    // Never let referral bookkeeping break the real action (publishing
    // a portfolio item, posting a job, ...) that triggered it.
    logger.error('markActivityCompleted failed', { userId, activityType, error: err.message });
  }
}

/**
 * Submitted by the referred user about their OWN experience --
 * enforced by scoping strictly to `referred_user_id = userId`, so
 * there is no id parameter a referrer could pass to submit on someone
 * else's behalf. Rejects if there's no referral to attach to, or if
 * feedback was already submitted (prevents overwriting/duplicating).
 */
async function submitFeedback(userId, { rating, feedbackText }) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM referrals WHERE referred_user_id = $1 FOR UPDATE`,
      [userId]
    );
    const referral = rows[0];
    if (!referral) {
      throw new AppError('You were not referred to Job Rush, so there is no referral feedback to submit.', 404, 'NOT_REFERRED');
    }
    if (referral.feedback_submitted_at) {
      throw new AppError('You have already submitted your referral feedback.', 409, 'FEEDBACK_ALREADY_SUBMITTED');
    }

    await client.query(
      `UPDATE referrals SET feedback_rating = $2, feedback_text = $3, feedback_submitted_at = now() WHERE id = $1`,
      [referral.id, rating, feedbackText]
    );

    await tryQualify(client, referral.id);
    return { referralId: referral.id };
  });
}

/** Dashboard summary + the referrer's own referral list, for the referral.html page. */
async function getReferrerDashboard(userId) {
  const code = await getOrCreateReferralCode(userId);

  const { rows: referrals } = await query(
    `SELECT r.id, r.status, r.activity_type, r.activity_completed_at, r.feedback_submitted_at,
            r.feedback_rating, r.created_at, u.full_name
       FROM referrals r
       JOIN users u ON u.id = r.referred_user_id
      WHERE r.referrer_user_id = $1
      ORDER BY r.created_at DESC`,
    [userId]
  );

  const qualifiedCount = referrals.filter((r) => r.status === 'qualified').length;
  const pendingCount = referrals.filter((r) => r.status === 'registered' || r.status === 'activity_completed').length;
  const disqualifiedCount = referrals.filter((r) => r.status === 'disqualified').length;

  const { rows: rewards } = await query(
    `SELECT id, milestone, amount, status, eligible_at, reviewed_at, rejection_reason, paid_at
       FROM referral_rewards WHERE referrer_user_id = $1 ORDER BY eligible_at DESC`,
    [userId]
  );

  return {
    referralCode: code,
    referralLink: buildReferralLink(code),
    milestone: MILESTONE,
    rewardAmount: REWARD_AMOUNT,
    qualifiedCount,
    pendingCount,
    disqualifiedCount,
    remainingForNextReward: Math.max(0, MILESTONE - qualifiedCount),
    totalReferrals: referrals.length,
    referrals: referrals.map((r) => ({
      id: r.id,
      referredName: r.full_name,
      status: r.status,
      activityType: r.activity_type,
      activityCompletedAt: r.activity_completed_at,
      feedbackSubmitted: !!r.feedback_submitted_at,
      rating: r.feedback_rating,
      createdAt: r.created_at,
    })),
    rewards,
  };
}

// ---------------- Admin ----------------

async function adminListReferrers({ page = 1, pageSize = 25 } = {}) {
  const offset = (Math.max(1, page) - 1) * pageSize;
  const { rows } = await query(
    `SELECT u.id AS referrer_user_id, u.full_name, u.email, u.referral_code,
            COUNT(r.id)::int AS total_referrals,
            COUNT(*) FILTER (WHERE r.status = 'qualified')::int AS qualified_count,
            COUNT(*) FILTER (WHERE r.status IN ('registered','activity_completed'))::int AS pending_count,
            COUNT(*) FILTER (WHERE r.status = 'disqualified')::int AS disqualified_count,
            COUNT(*) FILTER (WHERE r.flagged_for_review)::int AS flagged_count
       FROM users u
       JOIN referrals r ON r.referrer_user_id = u.id
      GROUP BY u.id, u.full_name, u.email, u.referral_code
      ORDER BY qualified_count DESC, total_referrals DESC
      LIMIT $1 OFFSET $2`,
    [pageSize, offset]
  );
  return rows;
}

/** "Who referred whom" -- the full detail view for one referrer. */
async function adminGetReferrerDetail(referrerUserId) {
  const { rows: referrerRows } = await query(
    'SELECT id, full_name, email, referral_code, created_at FROM users WHERE id = $1',
    [referrerUserId]
  );
  if (!referrerRows[0]) throw new AppError('Referrer not found.', 404, 'NOT_FOUND');

  const { rows: referrals } = await query(
    `SELECT r.*, u.full_name AS referred_full_name, u.email AS referred_email, u.created_at AS referred_registered_at
       FROM referrals r
       JOIN users u ON u.id = r.referred_user_id
      WHERE r.referrer_user_id = $1
      ORDER BY r.created_at DESC`,
    [referrerUserId]
  );

  return { referrer: referrerRows[0], referrals };
}

async function adminListRewards({ status } = {}) {
  const conditions = [];
  const params = [];
  if (status) {
    params.push(status);
    conditions.push(`rr.status = $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await query(
    `SELECT rr.*, u.full_name AS referrer_full_name, u.email AS referrer_email
       FROM referral_rewards rr
       JOIN users u ON u.id = rr.referrer_user_id
       ${where}
      ORDER BY rr.eligible_at DESC`,
    params
  );
  return rows;
}

async function adminApproveReward(rewardId, adminUserId) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(`SELECT * FROM referral_rewards WHERE id = $1 FOR UPDATE`, [rewardId]);
    const reward = rows[0];
    if (!reward) throw new AppError('Reward not found.', 404, 'NOT_FOUND');
    if (reward.status !== 'eligible') throw new AppError(`Reward is already ${reward.status}.`, 409, 'INVALID_STATE');

    await client.query(
      `UPDATE referral_rewards SET status = 'approved', reviewed_by = $2, reviewed_at = now() WHERE id = $1`,
      [rewardId, adminUserId]
    );
    await recordAuditEvent({
      actorUserId: adminUserId, action: 'REFERRAL_REWARD_APPROVED',
      resourceType: 'referral_reward', resourceId: rewardId, result: 'success',
    });
    notificationService
      .notifyUser(reward.referrer_user_id, 'referral_reward_approved', {
        title: 'Your referral reward has been approved',
        body: `Your ₦${Number(reward.amount).toLocaleString()} referral reward was approved and will be credited to your wallet.`,
        data: { rewardId },
      })
      .catch(() => {});
  });
}

async function adminRejectReward(rewardId, adminUserId, reason) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(`SELECT * FROM referral_rewards WHERE id = $1 FOR UPDATE`, [rewardId]);
    const reward = rows[0];
    if (!reward) throw new AppError('Reward not found.', 404, 'NOT_FOUND');
    if (reward.status !== 'eligible') throw new AppError(`Reward is already ${reward.status}.`, 409, 'INVALID_STATE');

    await client.query(
      `UPDATE referral_rewards SET status = 'rejected', reviewed_by = $2, reviewed_at = now(), rejection_reason = $3 WHERE id = $1`,
      [rewardId, adminUserId, reason]
    );
    await recordAuditEvent({
      actorUserId: adminUserId, action: 'REFERRAL_REWARD_REJECTED',
      resourceType: 'referral_reward', resourceId: rewardId, result: 'success', metadata: { reason },
    });
  });
}

/** Actually moves the money -- credits the referrer's existing Job Rush wallet, reusing walletService as-is. */
async function adminMarkRewardPaid(rewardId, adminUserId) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(`SELECT * FROM referral_rewards WHERE id = $1 FOR UPDATE`, [rewardId]);
    const reward = rows[0];
    if (!reward) throw new AppError('Reward not found.', 404, 'NOT_FOUND');
    if (reward.status !== 'approved') throw new AppError('Only an approved reward can be marked as paid.', 409, 'INVALID_STATE');

    // creditWallet returns the new balance, not the inserted ledger
    // row's id -- look it up by the (wallet_user_id, category,
    // source_id) it was just written with, inside the same
    // transaction, so this is the exact row this call created.
    await walletService.creditWallet(
      {
        userId: reward.referrer_user_id,
        amount: Number(reward.amount),
        category: 'referral_reward',
        sourceId: rewardId,
        description: `Referral program reward — ${reward.milestone} qualified referrals`,
      },
      client
    );
    const { rows: txnRows } = await client.query(
      `SELECT id FROM wallet_transactions
        WHERE wallet_user_id = $1 AND category = 'referral_reward' AND source_id = $2
        ORDER BY created_at DESC LIMIT 1`,
      [reward.referrer_user_id, rewardId]
    );

    await client.query(
      `UPDATE referral_rewards SET status = 'paid', paid_at = now(), paid_by = $2, wallet_transaction_id = $3 WHERE id = $1`,
      [rewardId, adminUserId, txnRows[0]?.id || null]
    );
    await recordAuditEvent({
      actorUserId: adminUserId, action: 'REFERRAL_REWARD_PAID',
      resourceType: 'referral_reward', resourceId: rewardId, result: 'success',
      metadata: { walletTransactionId: txnRows[0]?.id || null },
    });
    notificationService
      .notifyUser(reward.referrer_user_id, 'referral_reward_paid', {
        title: 'Your referral reward has been paid',
        body: `₦${Number(reward.amount).toLocaleString()} has been credited to your Job Rush wallet.`,
        data: { rewardId },
      })
      .catch(() => {});
  });
}

module.exports = {
  MILESTONE,
  REWARD_AMOUNT,
  getOrCreateReferralCode,
  buildReferralLink,
  attributeReferral,
  getOwnReferralRow,
  markActivityCompleted,
  submitFeedback,
  getReferrerDashboard,
  adminListReferrers,
  adminGetReferrerDetail,
  adminListRewards,
  adminApproveReward,
  adminRejectReward,
  adminMarkRewardPaid,
};
