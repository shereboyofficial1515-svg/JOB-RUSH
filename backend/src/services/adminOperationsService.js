const { query } = require('../config/db');
const AppError = require('../utils/AppError');

/**
 * Read-only admin visibility across applications, interviews,
 * contracts, and calls — none of these had any admin-facing surface
 * before; support staff could only see them indirectly through a
 * dispute or a support ticket. Every list is paginated and filterable
 * by status; nothing here mutates state, so it needs no audit-log
 * writes of its own.
 */

async function listApplicationsForAdmin({ status, jobId, workerUserId, page = 1, pageSize = 25 }) {
  const conditions = [];
  const params = [];
  if (status) { params.push(status); conditions.push(`a.status = $${params.length}`); }
  if (jobId) { params.push(jobId); conditions.push(`a.job_id = $${params.length}`); }
  if (workerUserId) { params.push(workerUserId); conditions.push(`a.worker_user_id = $${params.length}`); }

  const limit = Math.min(Math.max(parseInt(pageSize, 10) || 25, 1), 100);
  const offset = (Math.max(parseInt(page, 10) || 1, 1) - 1) * limit;
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const listParams = [...params, limit, offset];

  const { rows } = await query(
    `SELECT a.id, a.job_id, a.worker_user_id, a.status, a.source, a.applied_at, a.responded_at,
            j.title AS job_title, wu.full_name AS worker_name, hu.full_name AS hirer_name
       FROM applications a
       JOIN jobs j ON j.id = a.job_id
       JOIN users wu ON wu.id = a.worker_user_id
       JOIN users hu ON hu.id = j.hirer_user_id
       ${whereClause}
      ORDER BY a.applied_at DESC
      LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );
  return rows;
}

async function getApplicationForAdmin(applicationId) {
  const { rows } = await query(
    `SELECT a.*, j.title AS job_title, wu.full_name AS worker_name, hu.full_name AS hirer_name,
            i.id AS interview_id, i.status AS interview_status,
            c.id AS contract_id, c.status AS contract_status
       FROM applications a
       JOIN jobs j ON j.id = a.job_id
       JOIN users wu ON wu.id = a.worker_user_id
       JOIN users hu ON hu.id = j.hirer_user_id
       LEFT JOIN interviews i ON i.application_id = a.id
       LEFT JOIN contracts c ON c.application_id = a.id
      WHERE a.id = $1`,
    [applicationId]
  );
  if (rows.length === 0) throw new AppError('Application not found.', 404, 'NOT_FOUND');
  return rows[0];
}

async function listInterviewsForAdmin({ status, page = 1, pageSize = 25 }) {
  const conditions = [];
  const params = [];
  if (status) { params.push(status); conditions.push(`i.status = $${params.length}`); }

  const limit = Math.min(Math.max(parseInt(pageSize, 10) || 25, 1), 100);
  const offset = (Math.max(parseInt(page, 10) || 1, 1) - 1) * limit;
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const listParams = [...params, limit, offset];

  const { rows } = await query(
    `SELECT i.id, i.job_id, i.interview_type, i.status, i.scheduled_start_at, i.duration_minutes,
            j.title AS job_title, wu.full_name AS worker_name, hu.full_name AS hirer_name
       FROM interviews i
       JOIN jobs j ON j.id = i.job_id
       JOIN users wu ON wu.id = i.worker_user_id
       JOIN users hu ON hu.id = i.hirer_user_id
       ${whereClause}
      ORDER BY i.scheduled_start_at DESC NULLS LAST
      LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );
  return rows;
}

async function getInterviewForAdmin(interviewId) {
  const { rows } = await query(
    `SELECT i.*, j.title AS job_title, wu.full_name AS worker_name, hu.full_name AS hirer_name
       FROM interviews i
       JOIN jobs j ON j.id = i.job_id
       JOIN users wu ON wu.id = i.worker_user_id
       JOIN users hu ON hu.id = i.hirer_user_id
      WHERE i.id = $1`,
    [interviewId]
  );
  if (rows.length === 0) throw new AppError('Interview not found.', 404, 'NOT_FOUND');
  return rows[0];
}

async function listContractsForAdmin({ status, page = 1, pageSize = 25 }) {
  const conditions = [];
  const params = [];
  if (status) { params.push(status); conditions.push(`c.status = $${params.length}`); }

  const limit = Math.min(Math.max(parseInt(pageSize, 10) || 25, 1), 100);
  const offset = (Math.max(parseInt(page, 10) || 1, 1) - 1) * limit;
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const listParams = [...params, limit, offset];

  const { rows } = await query(
    `SELECT c.id, c.job_id, c.agreed_amount, c.currency, c.status, c.created_at,
            j.title AS job_title, wu.full_name AS worker_name, hu.full_name AS hirer_name
       FROM contracts c
       JOIN jobs j ON j.id = c.job_id
       JOIN users wu ON wu.id = c.worker_user_id
       JOIN users hu ON hu.id = c.hirer_user_id
       ${whereClause}
      ORDER BY c.created_at DESC
      LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );
  return rows;
}

async function getContractForAdmin(contractId) {
  const { rows } = await query(
    `SELECT c.*, j.title AS job_title, wu.full_name AS worker_name, hu.full_name AS hirer_name
       FROM contracts c
       JOIN jobs j ON j.id = c.job_id
       JOIN users wu ON wu.id = c.worker_user_id
       JOIN users hu ON hu.id = c.hirer_user_id
      WHERE c.id = $1`,
    [contractId]
  );
  if (rows.length === 0) throw new AppError('Contract not found.', 404, 'NOT_FOUND');

  const { rows: milestones } = await query(
    'SELECT * FROM milestones WHERE contract_id = $1 ORDER BY sequence',
    [contractId]
  );
  const { rows: escrow } = await query(
    'SELECT * FROM escrow_transactions WHERE contract_id = $1 ORDER BY created_at',
    [contractId]
  );

  return { ...rows[0], milestones, escrowTransactions: escrow };
}

async function listCallsForAdmin({ status, page = 1, pageSize = 25 }) {
  const conditions = [];
  const params = [];
  if (status) { params.push(status); conditions.push(`c.status = $${params.length}`); }

  const limit = Math.min(Math.max(parseInt(pageSize, 10) || 25, 1), 100);
  const offset = (Math.max(parseInt(page, 10) || 1, 1) - 1) * limit;
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const listParams = [...params, limit, offset];

  const { rows } = await query(
    `SELECT c.id, c.call_type, c.status, c.started_at, c.connected_at, c.ended_at,
            c.duration_seconds, c.failure_reason,
            caller.full_name AS caller_name, callee.full_name AS callee_name
       FROM calls c
       JOIN users caller ON caller.id = c.caller_user_id
       JOIN users callee ON callee.id = c.callee_user_id
       ${whereClause}
      ORDER BY c.started_at DESC
      LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );
  return rows;
}

module.exports = {
  listApplicationsForAdmin,
  getApplicationForAdmin,
  listInterviewsForAdmin,
  getInterviewForAdmin,
  listContractsForAdmin,
  getContractForAdmin,
  listCallsForAdmin,
};
