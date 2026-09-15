const { randomUUID } = require('crypto');
const { query, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const paystackService = require('./paystackService');
const walletService = require('./walletService');
const notificationService = require('./notificationService');
const { recordAuditEvent } = require('../security/auditLogger');

const MINIMUM_WITHDRAWAL = 1000; // NGN

/**
 * Worker requests a withdrawal. The raw account number is used only
 * to create a Paystack transfer recipient — it is never persisted;
 * only the last 4 digits and the resulting recipient_code are stored.
 * The requested amount is debited from the wallet immediately
 * (category 'withdrawal_hold') so it can't be double-spent by a
 * second withdrawal request while this one is pending admin review.
 */
async function requestWithdrawal(workerUserId, { amount, bankAccountName, bankAccountNumber, bankCode }) {
  if (amount < MINIMUM_WITHDRAWAL) {
    throw new AppError(`Minimum withdrawal amount is ₦${MINIMUM_WITHDRAWAL}.`, 400, 'AMOUNT_TOO_LOW');
  }

  const recipient = await paystackService.createTransferRecipient({
    name: bankAccountName,
    accountNumber: bankAccountNumber,
    bankCode,
  });

  return withTransaction(async (client) => {
    await walletService.debitWallet(
      {
        userId: workerUserId,
        amount,
        category: 'withdrawal_hold',
        description: 'Withdrawal request pending review',
      },
      client
    );

    const { rows } = await client.query(
      `INSERT INTO withdrawals (
         worker_user_id, amount, bank_account_name, bank_account_number_last4,
         bank_code, paystack_recipient_code
       ) VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [
        workerUserId,
        amount,
        bankAccountName,
        bankAccountNumber.slice(-4),
        bankCode,
        recipient.recipient_code,
      ]
    );

    // Link the wallet hold ledger entry to this withdrawal for traceability.
    await client.query(
      `UPDATE wallet_transactions SET source_id = $2
        WHERE wallet_user_id = $1 AND category = 'withdrawal_hold' AND source_id IS NULL
        ORDER BY created_at DESC LIMIT 1`,
      [workerUserId, rows[0].id]
    );

    notificationService.notifyUser(workerUserId, 'withdrawal_requested', {
      title: 'Withdrawal request received',
      body: `Your withdrawal request for ₦${Number(amount).toLocaleString()} is being processed.`,
      data: { withdrawalId: rows[0].id, amount, reference: rows[0].id, requestedAt: rows[0].created_at },
    }).catch(() => {});

    return rows[0];
  });
}

async function getOwnedWithdrawal(withdrawalId, workerUserId) {
  const { rows } = await query('SELECT * FROM withdrawals WHERE id = $1 AND worker_user_id = $2', [
    withdrawalId,
    workerUserId,
  ]);
  if (rows.length === 0) throw new AppError('Withdrawal not found.', 404, 'NOT_FOUND');
  return rows[0];
}

async function listOwnWithdrawals(workerUserId) {
  const { rows } = await query('SELECT * FROM withdrawals WHERE worker_user_id = $1 ORDER BY requested_at DESC', [
    workerUserId,
  ]);
  return rows;
}

async function listPendingWithdrawals() {
  const { rows } = await query(
    `SELECT w.*, u.full_name FROM withdrawals w JOIN users u ON u.id = w.worker_user_id
      WHERE w.status = 'pending' ORDER BY w.requested_at ASC`
  );
  return rows;
}

/** Admin-only. Initiates the real bank transfer via Paystack. */
async function approveAndPayWithdrawal(withdrawalId, adminUserId) {
  return withTransaction(async (client) => {
    const { rows: locked } = await client.query('SELECT * FROM withdrawals WHERE id = $1 FOR UPDATE', [withdrawalId]);
    const withdrawal = locked[0];
    if (!withdrawal) throw new AppError('Withdrawal not found.', 404, 'NOT_FOUND');
    if (withdrawal.status !== 'pending') {
      throw new AppError(`Cannot approve a withdrawal with status "${withdrawal.status}".`, 400, 'INVALID_STATUS_TRANSITION');
    }

    const reference = `withdrawal_${randomUUID()}`;

    await client.query(
      `UPDATE withdrawals SET status = 'processing', processed_by = $2, processed_at = now(),
              paystack_transfer_reference = $3
        WHERE id = $1`,
      [withdrawalId, adminUserId, reference]
    );

    try {
      const transfer = await paystackService.initiateTransfer({
        amountKobo: paystackService.nairaToKobo(withdrawal.amount),
        recipientCode: withdrawal.paystack_recipient_code,
        reference,
        reason: 'JOB RUSH withdrawal',
      });

      await client.query(
        `UPDATE withdrawals SET status = 'paid', paystack_transfer_code = $2 WHERE id = $1`,
        [withdrawalId, transfer.transfer_code]
      );

      await recordAuditEvent({
        actorUserId: adminUserId,
        action: 'WITHDRAWAL_APPROVED',
        resourceType: 'withdrawal',
        resourceId: withdrawalId,
        result: 'success',
      });

      notificationService.notifyUser(withdrawal.worker_user_id, 'withdrawal_approved', {
        title: 'Withdrawal paid',
        body: `\u20A6${Number(withdrawal.amount).toLocaleString()} has been sent to your bank account.`,
        data: { withdrawalId, amount: withdrawal.amount, reference: withdrawal.id, completedAt: new Date().toISOString() },
      }).catch(() => {});
    } catch (err) {
      // Transfer failed — reverse the wallet hold so the worker isn't
      // out the money, and record the failure for admin follow-up.
      await client.query(`UPDATE withdrawals SET status = 'failed', failure_reason = $2 WHERE id = $1`, [
        withdrawalId,
        err.message,
      ]);
      await walletService.creditWallet(
        {
          userId: withdrawal.worker_user_id,
          amount: withdrawal.amount,
          category: 'withdrawal_reversed',
          sourceId: withdrawal.id,
          description: 'Withdrawal transfer failed — funds returned to wallet',
        },
        client
      );
      throw err;
    }

    const { rows } = await client.query('SELECT * FROM withdrawals WHERE id = $1', [withdrawalId]);
    return rows[0];
  });
}

/** Admin-only. Rejects a pending withdrawal and reverses the wallet hold. */
async function rejectWithdrawal(withdrawalId, adminUserId, reason) {
  return withTransaction(async (client) => {
    const { rows: locked } = await client.query('SELECT * FROM withdrawals WHERE id = $1 FOR UPDATE', [withdrawalId]);
    const withdrawal = locked[0];
    if (!withdrawal) throw new AppError('Withdrawal not found.', 404, 'NOT_FOUND');
    if (withdrawal.status !== 'pending') {
      throw new AppError(`Cannot reject a withdrawal with status "${withdrawal.status}".`, 400, 'INVALID_STATUS_TRANSITION');
    }

    await client.query(
      `UPDATE withdrawals SET status = 'rejected', processed_by = $2, processed_at = now(), rejection_reason = $3 WHERE id = $1`,
      [withdrawalId, adminUserId, reason || null]
    );

    await walletService.creditWallet(
      {
        userId: withdrawal.worker_user_id,
        amount: withdrawal.amount,
        category: 'withdrawal_reversed',
        sourceId: withdrawal.id,
        description: 'Withdrawal rejected — funds returned to wallet',
      },
      client
    );

    await recordAuditEvent({
      actorUserId: adminUserId,
      action: 'WITHDRAWAL_REJECTED',
      resourceType: 'withdrawal',
      resourceId: withdrawalId,
      result: 'success',
      metadata: { reason },
    });

    notificationService.notifyUser(withdrawal.worker_user_id, 'withdrawal_rejected', {
      title: 'Withdrawal rejected',
      body: reason || 'Your withdrawal request was rejected. Funds have been returned to your wallet.',
      data: { withdrawalId, amount: withdrawal.amount, reference: withdrawal.id, reason: reason || 'Not specified.' },
    }).catch(() => {});

    const { rows } = await client.query('SELECT * FROM withdrawals WHERE id = $1', [withdrawalId]);
    return rows[0];
  });
}

module.exports = {
  requestWithdrawal,
  getOwnedWithdrawal,
  listOwnWithdrawals,
  listPendingWithdrawals,
  approveAndPayWithdrawal,
  rejectWithdrawal,
};
