const { query, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const notificationService = require('./notificationService');
const { recordAuditEvent } = require('../security/auditLogger');

const SUBMITTABLE_STATUSES = ['not_submitted', 'rejected', 'resubmission_required'];

/**
 * Worker submits (or resubmits) verification documents. `documents`
 * is a list of { documentType, storagePath } where storagePath must
 * already reference an object in the PRIVATE verification-documents
 * bucket, uploaded via the storage module (which enforces MIME/size/
 * signature checks and private ACLs) — this service never receives
 * or trusts a raw file upload directly.
 */
async function submitVerification(workerUserId, documents) {
  if (!Array.isArray(documents) || documents.length === 0) {
    throw new AppError('At least one verification document is required.', 400, 'MISSING_DOCUMENTS');
  }

  const { rows: profileRows } = await query(
    'SELECT verification_status FROM worker_profiles WHERE user_id = $1',
    [workerUserId]
  );
  if (profileRows.length === 0) {
    throw new AppError('Complete your worker profile before requesting verification.', 400, 'PROFILE_INCOMPLETE');
  }
  const currentStatus = profileRows[0].verification_status;
  if (!SUBMITTABLE_STATUSES.includes(currentStatus)) {
    throw new AppError(
      `Verification cannot be submitted while status is "${currentStatus}".`,
      400,
      'INVALID_STATUS_TRANSITION'
    );
  }

  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO verification_requests (worker_user_id, status)
       VALUES ($1, 'submitted')
       RETURNING *`,
      [workerUserId]
    );
    const request = rows[0];

    for (const doc of documents) {
      await client.query(
        `INSERT INTO verification_documents (verification_request_id, document_type, storage_path, file_size)
         VALUES ($1, $2, $3, $4)`,
        [request.id, doc.documentType, doc.storagePath, doc.fileSize || null]
      );
    }

    await client.query(
      `UPDATE worker_profiles SET verification_status = 'submitted' WHERE user_id = $1`,
      [workerUserId]
    );

    return request;
  });
}

async function getOwnLatestVerification(workerUserId) {
  const { rows } = await query(
    `SELECT * FROM verification_requests WHERE worker_user_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [workerUserId]
  );
  return rows[0] || null;
}

/** Admin-only. `adminUserId` is the reviewing admin, from req.user.id after requireAdmin passed. */
async function approveVerification(requestId, adminUserId) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE verification_requests
          SET status = 'approved', reviewed_at = now(), reviewed_by = $2
        WHERE id = $1
        RETURNING *`,
      [requestId, adminUserId]
    );
    const request = rows[0];
    if (!request) throw new AppError('Verification request not found.', 404, 'NOT_FOUND');

    await client.query(
      `UPDATE worker_profiles SET verification_status = 'approved' WHERE user_id = $1`,
      [request.worker_user_id]
    );

    await recordAuditEvent({
      actorUserId: adminUserId,
      action: 'VERIFICATION_APPROVED',
      resourceType: 'verification_request',
      resourceId: requestId,
      result: 'success',
      metadata: { workerUserId: request.worker_user_id },
    });

    notificationService.notifyUser(request.worker_user_id, 'verification_approved', {
      title: "You're verified!",
      body: 'Your Verified Professional badge is now live on your profile.',
      data: { verificationRequestId: requestId },
    }).catch(() => {});

    return request;
  });
}

/** Admin-only. */
async function rejectVerification(requestId, adminUserId, { reason, requiresResubmission }) {
  const newProfileStatus = requiresResubmission ? 'resubmission_required' : 'rejected';
  const newRequestStatus = requiresResubmission ? 'resubmission_required' : 'rejected';

  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE verification_requests
          SET status = $2, reviewed_at = now(), reviewed_by = $3, rejection_reason = $4
        WHERE id = $1
        RETURNING *`,
      [requestId, newRequestStatus, adminUserId, reason || null]
    );
    const request = rows[0];
    if (!request) throw new AppError('Verification request not found.', 404, 'NOT_FOUND');

    await client.query(
      `UPDATE worker_profiles SET verification_status = $2 WHERE user_id = $1`,
      [request.worker_user_id, newProfileStatus]
    );

    await recordAuditEvent({
      actorUserId: adminUserId,
      action: 'VERIFICATION_REJECTED',
      resourceType: 'verification_request',
      resourceId: requestId,
      result: 'success',
      metadata: { workerUserId: request.worker_user_id, reason, requiresResubmission },
    });

    notificationService.notifyUser(request.worker_user_id, 'verification_rejected', {
      title: requiresResubmission ? 'Verification needs another look' : 'Verification not approved',
      body: reason || 'Please review and resubmit your documents.',
      data: { verificationRequestId: requestId },
    }).catch(() => {});

    return request;
  });
}

/** Admin-only. Pulls documents for review — these are never exposed via a worker-facing endpoint. */
async function getVerificationDocuments(requestId) {
  const { rows } = await query(
    'SELECT id, document_type, storage_path, uploaded_at FROM verification_documents WHERE verification_request_id = $1',
    [requestId]
  );
  return rows;
}

async function listPendingVerifications() {
  const { rows } = await query(
    `SELECT vr.*, u.full_name, u.email
       FROM verification_requests vr
       JOIN users u ON u.id = vr.worker_user_id
      WHERE vr.status IN ('submitted', 'under_review')
      ORDER BY vr.submitted_at ASC`
  );
  return rows;
}

module.exports = {
  submitVerification,
  getOwnLatestVerification,
  approveVerification,
  rejectVerification,
  getVerificationDocuments,
  listPendingVerifications,
};
