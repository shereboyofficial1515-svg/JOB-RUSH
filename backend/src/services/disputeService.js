const { query, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const contractService = require('./contractService');
const escrowService = require('./escrowService');
const notificationService = require('./notificationService');
const { recordAuditEvent } = require('../security/auditLogger');

/** Loads a dispute the caller must be a party to (either side), or throws. */
async function getOwnedDispute(disputeId, userId) {
  const { rows } = await query(
    'SELECT * FROM disputes WHERE id = $1 AND (opened_by_user_id = $2 OR against_user_id = $2)',
    [disputeId, userId]
  );
  if (rows.length === 0) throw new AppError('Dispute not found.', 404, 'NOT_FOUND');
  return rows[0];
}

/**
 * Opens a dispute against a contract. The caller must actually be a
 * party to the contract; the other side is derived from the contract
 * record, not trusted from the request. If the contract's escrow is
 * currently funded, it's flipped to 'disputed' — freezing release and
 * refund until an admin resolves this.
 */
async function openDispute(userId, { contractId, reason, description }) {
  const contract = await contractService.getOwnedContract(contractId, userId);
  const againstUserId = contract.hirer_user_id === userId ? contract.worker_user_id : contract.hirer_user_id;

  const { rows: escrowRows } = await query(
    `SELECT id FROM escrow_transactions WHERE contract_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [contractId]
  );
  const escrowTransactionId = escrowRows[0]?.id || null;

  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO disputes (contract_id, escrow_transaction_id, opened_by_user_id, against_user_id, reason, description)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [contractId, escrowTransactionId, userId, againstUserId, reason, description]
    );

    await client.query(`UPDATE contracts SET status = 'disputed' WHERE id = $1 AND status = 'active'`, [contractId]);

    if (escrowTransactionId) {
      await escrowService.markDisputed(escrowTransactionId);
    }

    notificationService.notifyUser(againstUserId, 'dispute_opened', {
      title: 'A dispute was opened',
      body: reason,
      data: {
        contractId,
        disputeId: rows[0].id,
        disputeReference: `DSP-${rows[0].id.replace(/-/g, '').slice(0, 8).toUpperCase()}`,
        status: 'Open',
        message: description,
      },
    }).catch(() => {});

    return rows[0];
  });
}

async function addEvidence(disputeId, userId, { fileType, storagePath, description }) {
  await getOwnedDispute(disputeId, userId); // authorization check

  const { rows } = await query(
    `INSERT INTO dispute_evidence (dispute_id, uploaded_by, file_type, storage_path, description)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [disputeId, userId, fileType, storagePath, description || null]
  );
  return rows[0];
}

async function listEvidence(disputeId, userId) {
  await getOwnedDispute(disputeId, userId);
  const { rows } = await query('SELECT * FROM dispute_evidence WHERE dispute_id = $1 ORDER BY created_at', [
    disputeId,
  ]);
  return rows;
}

async function listOwnDisputes(userId) {
  const { rows } = await query(
    'SELECT * FROM disputes WHERE opened_by_user_id = $1 OR against_user_id = $1 ORDER BY created_at DESC',
    [userId]
  );
  return rows;
}

// --- Admin ---

async function listDisputesForAdmin(statusFilter) {
  const params = [];
  let sql = 'SELECT * FROM disputes';
  if (statusFilter) {
    params.push(statusFilter);
    sql += ' WHERE status = $1';
  }
  sql += ' ORDER BY created_at ASC';
  const { rows } = await query(sql, params);
  return rows;
}

async function getDisputeForAdmin(disputeId) {
  const { rows } = await query('SELECT * FROM disputes WHERE id = $1', [disputeId]);
  if (rows.length === 0) throw new AppError('Dispute not found.', 404, 'NOT_FOUND');
  return rows[0];
}

/** Admin updates status without resolving (e.g. moving to under_review, requesting more info). */
async function updateDisputeStatus(disputeId, adminUserId, newStatus) {
  const nonTerminal = ['open', 'under_review', 'awaiting_information'];
  const dispute = await getDisputeForAdmin(disputeId);
  if (!nonTerminal.includes(dispute.status)) {
    throw new AppError(`Cannot update a dispute with status "${dispute.status}".`, 400, 'INVALID_STATUS_TRANSITION');
  }
  const { rows } = await query('UPDATE disputes SET status = $2 WHERE id = $1 RETURNING *', [disputeId, newStatus]);
  await recordAuditEvent({
    actorUserId: adminUserId,
    action: 'DISPUTE_STATUS_UPDATED',
    resourceType: 'dispute',
    resourceId: disputeId,
    result: 'success',
    metadata: { newStatus },
  });
  return rows[0];
}

/**
 * Resolves a dispute with a real financial outcome: releases the
 * escrowed funds to the worker, or refunds them to the hirer via
 * Paystack. This is the only place either of those admin-only escrow
 * actions gets triggered as a *consequence* of a dispute decision,
 * rather than a direct hirer/admin action on the escrow itself.
 */
async function resolveDispute(disputeId, adminUserId, { decision, action, reason }) {
  const dispute = await getDisputeForAdmin(disputeId);
  if (!['open', 'under_review', 'awaiting_information'].includes(dispute.status)) {
    throw new AppError(`Cannot resolve a dispute with status "${dispute.status}".`, 400, 'INVALID_STATUS_TRANSITION');
  }
  if (!dispute.escrow_transaction_id) {
    throw new AppError('This dispute has no associated escrow transaction to resolve financially.', 400, 'NO_ESCROW');
  }

  if (action === 'release_to_worker') {
    await escrowService.adminForceRelease(dispute.escrow_transaction_id, adminUserId, reason);
  } else if (action === 'refund_to_hirer') {
    await escrowService.refundEscrow(dispute.escrow_transaction_id, adminUserId, reason);
  } else {
    throw new AppError('Invalid resolution action.', 400, 'INVALID_ACTION');
  }

  const { rows } = await query(
    `UPDATE disputes SET status = 'resolved', admin_decision = $2, resolution_action = $3,
            resolved_by = $4, resolved_at = now()
      WHERE id = $1 RETURNING *`,
    [disputeId, decision, action, adminUserId]
  );

  await recordAuditEvent({
    actorUserId: adminUserId,
    action: 'DISPUTE_RESOLVED',
    resourceType: 'dispute',
    resourceId: disputeId,
    result: 'success',
    metadata: { action, decision },
  });

  for (const userId of [dispute.opened_by_user_id, dispute.against_user_id]) {
    notificationService.notifyUser(userId, 'dispute_resolved', {
      title: 'Dispute resolved',
      body: decision,
      data: {
        disputeId,
        disputeReference: `DSP-${disputeId.replace(/-/g, '').slice(0, 8).toUpperCase()}`,
        status: 'Resolved',
        message: decision,
      },
    }).catch(() => {});
  }

  return rows[0];
}

async function rejectDispute(disputeId, adminUserId, reason) {
  const dispute = await getDisputeForAdmin(disputeId);
  if (!['open', 'under_review', 'awaiting_information'].includes(dispute.status)) {
    throw new AppError(`Cannot reject a dispute with status "${dispute.status}".`, 400, 'INVALID_STATUS_TRANSITION');
  }
  const { rows } = await query(
    `UPDATE disputes SET status = 'rejected', admin_decision = $2, resolved_by = $3, resolved_at = now()
      WHERE id = $1 RETURNING *`,
    [disputeId, reason || null, adminUserId]
  );
  await recordAuditEvent({
    actorUserId: adminUserId,
    action: 'DISPUTE_REJECTED',
    resourceType: 'dispute',
    resourceId: disputeId,
    result: 'success',
  });
  return rows[0];
}

module.exports = {
  openDispute,
  addEvidence,
  listEvidence,
  listOwnDisputes,
  getOwnedDispute,
  listDisputesForAdmin,
  getDisputeForAdmin,
  updateDisputeStatus,
  resolveDispute,
  rejectDispute,
};
