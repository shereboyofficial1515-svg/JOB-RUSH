const { randomUUID } = require('crypto');
const { query, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const paystackService = require('./paystackService');
const walletService = require('./walletService');
const contractService = require('./contractService');
const notificationService = require('./notificationService');
const { recordAuditEvent } = require('../security/auditLogger');

async function getPlatformFeePercent() {
  const { rows } = await query('SELECT platform_fee_percent FROM platform_settings WHERE id = 1');
  return Number(rows[0]?.platform_fee_percent ?? 10);
}

function computeSplit(amount, feePercent) {
  const platformFeeAmount = Math.round(amount * (feePercent / 100) * 100) / 100;
  const workerPayoutAmount = Math.round((amount - platformFeeAmount) * 100) / 100;
  return { platformFeeAmount, workerPayoutAmount };
}

/**
 * Starts the funding flow: creates a `payments` row (status pending)
 * and a matching `escrow_transactions` row (status pending_funding),
 * then asks Paystack to initialize a transaction. Nothing here marks
 * the escrow funded — that only happens once Paystack independently
 * confirms the charge (via webhook or the verify-by-reference
 * endpoint), both of which call `finalizeFunding` below.
 */
async function initiateEscrowFunding(hirerUserId, { contractId, payerEmail, callbackUrl }) {
  const contract = await contractService.getOwnedContract(contractId, hirerUserId);
  if (contract.hirer_user_id !== hirerUserId) {
    throw new AppError('Only the hirer on this contract can fund it.', 403, 'FORBIDDEN');
  }

  const existing = await query(
    `SELECT * FROM escrow_transactions WHERE contract_id = $1 AND milestone_id IS NULL AND status != 'refunded'`,
    [contractId]
  );
  if (existing.rows.length > 0) {
    throw new AppError('This contract already has an escrow transaction.', 409, 'ESCROW_EXISTS');
  }

  const feePercent = await getPlatformFeePercent();
  const { platformFeeAmount, workerPayoutAmount } = computeSplit(Number(contract.agreed_amount), feePercent);
  const reference = `escrow_${randomUUID()}`;

  return withTransaction(async (client) => {
    const { rows: paymentRows } = await client.query(
      `INSERT INTO payments (payer_user_id, purpose, target_id, amount, currency, paystack_reference, status)
       VALUES ($1, 'escrow_funding', $2, $3, $4, $5, 'pending')
       RETURNING *`,
      [hirerUserId, contractId, contract.agreed_amount, contract.currency, reference]
    );
    const payment = paymentRows[0];

    const { rows: escrowRows } = await client.query(
      `INSERT INTO escrow_transactions (
         contract_id, hirer_user_id, worker_user_id, amount, platform_fee_percent,
         platform_fee_amount, worker_payout_amount, currency, status, payment_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending_funding',$9)
       RETURNING *`,
      [
        contractId,
        contract.hirer_user_id,
        contract.worker_user_id,
        contract.agreed_amount,
        feePercent,
        platformFeeAmount,
        workerPayoutAmount,
        contract.currency,
        payment.id,
      ]
    );

    const paystackData = await paystackService.initializeTransaction({
      email: payerEmail,
      amountKobo: paystackService.nairaToKobo(contract.agreed_amount),
      reference,
      callbackUrl,
      metadata: { contractId, escrowTransactionId: escrowRows[0].id },
    });

    return {
      payment,
      escrowTransaction: escrowRows[0],
      authorizationUrl: paystackData.authorization_url,
      reference,
    };
  });
}

/**
 * Idempotent finalization shared by the webhook handler and the
 * manual verify-by-reference endpoint. Safe to call twice for the
 * same reference — the `payments.status = 'pending'` guard in the
 * WHERE clause means a second call finds zero rows and does nothing.
 */
async function finalizeFunding(reference) {
  const verified = await paystackService.verifyTransaction(reference);
  if (verified.status !== 'success') {
    await query(`UPDATE payments SET status = 'failed' WHERE paystack_reference = $1 AND status = 'pending'`, [reference]);
    throw new AppError('Payment was not successful.', 400, 'PAYMENT_NOT_SUCCESSFUL');
  }

  return withTransaction(async (client) => {
    const { rows: updatedPayments } = await client.query(
      `UPDATE payments
          SET status = 'success', paystack_transaction_id = $2, verified_at = now()
        WHERE paystack_reference = $1 AND status = 'pending'
        RETURNING *`,
      [reference, String(verified.id)]
    );

    if (updatedPayments.length === 0) {
      // Already processed (webhook + manual verify both fired) or
      // reference unknown — either way, nothing further to do.
      return { alreadyProcessed: true };
    }

    const payment = updatedPayments[0];
    const { rows: escrowRows } = await client.query(
      `UPDATE escrow_transactions
          SET status = 'funded', funded_at = now()
        WHERE payment_id = $1 AND status = 'pending_funding'
        RETURNING *`,
      [payment.id]
    );

    if (escrowRows[0]) {
      notificationService.notifyUser(escrowRows[0].worker_user_id, 'escrow_funded', {
        title: 'Contract funded',
        body: 'The hirer has funded escrow for your contract.',
        data: { contractId: escrowRows[0].contract_id, escrowTransactionId: escrowRows[0].id },
      }).catch(() => {});
    }

    return { alreadyProcessed: false, payment, escrowTransaction: escrowRows[0] };
  });
}

/**
 * Handles a Paystack webhook event. Signature verification happens
 * in the controller (needs the raw body); this function assumes the
 * caller has already confirmed authenticity.
 */
async function handleWebhookEvent(event) {
  if (event.event === 'charge.success') {
    await finalizeFunding(event.data.reference).catch(() => {
      // A webhook retry for an already-finalized or failed reference
      // is not an error condition worth surfacing — Paystack expects
      // a 200 regardless, and finalizeFunding's own guard makes this safe.
    });
  }
  // Other event types (transfer.success, transfer.failed, etc.) are
  // handled by withdrawalService's webhook hook — see that module.
}

/**
 * Hirer approves completed work: releases escrow to the worker's
 * wallet, deducting the platform fee. Only possible from `funded`.
 */
async function releaseEscrow(escrowTransactionId, hirerUserId) {
  return withTransaction(async (client) => {
    const { rows: locked } = await client.query(
      'SELECT * FROM escrow_transactions WHERE id = $1 FOR UPDATE',
      [escrowTransactionId]
    );
    const escrow = locked[0];
    if (!escrow) throw new AppError('Escrow transaction not found.', 404, 'NOT_FOUND');
    if (escrow.hirer_user_id !== hirerUserId) {
      throw new AppError('Only the hirer on this contract can release funds.', 403, 'FORBIDDEN');
    }
    if (escrow.status !== 'funded') {
      throw new AppError(`Cannot release escrow with status "${escrow.status}".`, 400, 'INVALID_STATUS_TRANSITION');
    }

    await client.query(`UPDATE escrow_transactions SET status = 'released', released_at = now() WHERE id = $1`, [
      escrowTransactionId,
    ]);

    await walletService.creditWallet(
      {
        userId: escrow.worker_user_id,
        amount: escrow.worker_payout_amount,
        category: 'escrow_release',
        sourceId: escrow.id,
        description: `Escrow release for contract ${escrow.contract_id}`,
      },
      client
    );

    await contractService.markContractCompleted(escrow.contract_id);

    await recordAuditEvent({
      actorUserId: hirerUserId,
      action: 'ESCROW_RELEASED',
      resourceType: 'escrow_transaction',
      resourceId: escrowTransactionId,
      result: 'success',
      metadata: { workerPayoutAmount: escrow.worker_payout_amount },
    });

    notificationService.notifyUser(escrow.worker_user_id, 'escrow_released', {
      title: 'Payment released',
      body: `\u20A6${Number(escrow.worker_payout_amount).toLocaleString()} has been added to your wallet.`,
      data: { contractId: escrow.contract_id, escrowTransactionId },
    }).catch(() => {});

    const { rows } = await client.query('SELECT * FROM escrow_transactions WHERE id = $1', [escrowTransactionId]);
    return rows[0];
  });
}

/**
 * Admin-only refund back to the hirer's original payment method via
 * Paystack. Real money movement, so this is deliberately not
 * reachable by either party directly — see routes/escrowRoutes.js.
 */
async function refundEscrow(escrowTransactionId, adminUserId, reason) {
  return withTransaction(async (client) => {
    const { rows: locked } = await client.query(
      'SELECT * FROM escrow_transactions WHERE id = $1 FOR UPDATE',
      [escrowTransactionId]
    );
    const escrow = locked[0];
    if (!escrow) throw new AppError('Escrow transaction not found.', 404, 'NOT_FOUND');
    if (!['funded', 'disputed'].includes(escrow.status)) {
      throw new AppError(`Cannot refund escrow with status "${escrow.status}".`, 400, 'INVALID_STATUS_TRANSITION');
    }

    const { rows: paymentRows } = await client.query('SELECT * FROM payments WHERE id = $1', [escrow.payment_id]);
    const payment = paymentRows[0];

    await paystackService.initiateRefund({
      transactionReference: payment.paystack_reference,
      amountKobo: paystackService.nairaToKobo(escrow.amount),
      reason,
    });

    await client.query(`UPDATE escrow_transactions SET status = 'refunded', refunded_at = now() WHERE id = $1`, [
      escrowTransactionId,
    ]);

    await recordAuditEvent({
      actorUserId: adminUserId,
      action: 'ESCROW_REFUNDED',
      resourceType: 'escrow_transaction',
      resourceId: escrowTransactionId,
      result: 'success',
      metadata: { reason },
    });

    const { rows } = await client.query('SELECT * FROM escrow_transactions WHERE id = $1', [escrowTransactionId]);
    return rows[0];
  });
}

/**
 * Admin-forced release, used only by disputeService when a dispute is
 * resolved in the worker's favor. Distinct from the hirer-initiated
 * `releaseEscrow` — this path does not check hirer ownership, since
 * the whole point is an admin overriding the hirer's decision after
 * reviewing a dispute. Only reachable through the dispute resolution
 * flow, never a direct route.
 */
async function adminForceRelease(escrowTransactionId, adminUserId, reason) {
  return withTransaction(async (client) => {
    const { rows: locked } = await client.query(
      'SELECT * FROM escrow_transactions WHERE id = $1 FOR UPDATE',
      [escrowTransactionId]
    );
    const escrow = locked[0];
    if (!escrow) throw new AppError('Escrow transaction not found.', 404, 'NOT_FOUND');
    if (!['funded', 'disputed'].includes(escrow.status)) {
      throw new AppError(`Cannot release escrow with status "${escrow.status}".`, 400, 'INVALID_STATUS_TRANSITION');
    }

    await client.query(`UPDATE escrow_transactions SET status = 'released', released_at = now() WHERE id = $1`, [
      escrowTransactionId,
    ]);

    await walletService.creditWallet(
      {
        userId: escrow.worker_user_id,
        amount: escrow.worker_payout_amount,
        category: 'escrow_release',
        sourceId: escrow.id,
        description: `Admin-resolved dispute release for contract ${escrow.contract_id}`,
      },
      client
    );

    await contractService.markContractCompleted(escrow.contract_id);

    await recordAuditEvent({
      actorUserId: adminUserId,
      action: 'ESCROW_RELEASED_BY_ADMIN',
      resourceType: 'escrow_transaction',
      resourceId: escrowTransactionId,
      result: 'success',
      metadata: { reason, workerPayoutAmount: escrow.worker_payout_amount },
    });

    const { rows } = await client.query('SELECT * FROM escrow_transactions WHERE id = $1', [escrowTransactionId]);
    return rows[0];
  });
}

/** Marks an escrow as disputed — called when a dispute opens against a funded contract. */
async function markDisputed(escrowTransactionId) {
  await query(`UPDATE escrow_transactions SET status = 'disputed' WHERE id = $1 AND status = 'funded'`, [
    escrowTransactionId,
  ]);
}

async function getEscrowForContract(contractId, userId) {
  await contractService.getOwnedContract(contractId, userId); // authorization check
  const { rows } = await query(
    `SELECT * FROM escrow_transactions WHERE contract_id = $1 ORDER BY created_at DESC`,
    [contractId]
  );
  return rows;
}

module.exports = {
  initiateEscrowFunding,
  finalizeFunding,
  handleWebhookEvent,
  releaseEscrow,
  refundEscrow,
  adminForceRelease,
  markDisputed,
  getEscrowForContract,
  getPlatformFeePercent,
};
