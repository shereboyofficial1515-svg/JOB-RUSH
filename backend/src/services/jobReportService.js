const { query } = require('../config/db');
const AppError = require('../utils/AppError');
const jobService = require('./jobService');
const { recordAuditEvent } = require('../security/auditLogger');

async function reportJob(reporterUserId, jobId, reason) {
  const job = await jobService.getJobById(jobId);
  if (!job) throw new AppError('Job not found.', 404, 'NOT_FOUND');

  const { rows } = await query(
    `INSERT INTO job_reports (job_id, reporter_user_id, reason) VALUES ($1, $2, $3) RETURNING *`,
    [jobId, reporterUserId, reason]
  );
  return rows[0];
}

async function listReportedJobs() {
  const { rows } = await query(
    `SELECT j.id AS job_id, j.title, j.status, COUNT(jr.id)::int AS report_count,
            MAX(jr.created_at) AS last_reported_at
       FROM job_reports jr JOIN jobs j ON j.id = jr.job_id
      GROUP BY j.id, j.title, j.status
      ORDER BY last_reported_at DESC`
  );
  return rows;
}

async function getReportsForJob(jobId) {
  const { rows } = await query(
    `SELECT jr.*, u.full_name AS reporter_name FROM job_reports jr
       JOIN users u ON u.id = jr.reporter_user_id
      WHERE jr.job_id = $1 ORDER BY jr.created_at DESC`,
    [jobId]
  );
  return rows;
}

/** Admin-only. Removes a job from listing (sets it cancelled) regardless of who owns it. */
async function adminRemoveJob(jobId, adminUserId, reason) {
  const job = await jobService.adminSetJobStatus(jobId, 'cancelled');

  await recordAuditEvent({
    actorUserId: adminUserId,
    action: 'JOB_REMOVED_BY_ADMIN',
    resourceType: 'job',
    resourceId: jobId,
    result: 'success',
    metadata: { reason },
  });

  return job;
}

/**
 * Admin browse/search across every job regardless of status — the
 * public searchJobs() in jobService only ever returns status='open'
 * jobs, so admins need their own query to see draft/closed/hidden
 * jobs too when investigating a problem.
 */
async function listJobsForAdmin({ keyword, categoryId, stateId, status, page = 1, pageSize = 25 }) {
  const conditions = [];
  const params = [];

  if (keyword) {
    params.push(`%${keyword}%`);
    conditions.push(`j.title ILIKE $${params.length}`);
  }
  if (categoryId) {
    params.push(categoryId);
    conditions.push(`j.category_id = $${params.length}`);
  }
  if (stateId) {
    params.push(stateId);
    conditions.push(`j.state_id = $${params.length}`);
  }
  if (status) {
    params.push(status);
    conditions.push(`j.status = $${params.length}`);
  }

  const limit = Math.min(Math.max(parseInt(pageSize, 10) || 25, 1), 100);
  const offset = (Math.max(parseInt(page, 10) || 1, 1) - 1) * limit;
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const listParams = [...params, limit, offset];

  const { rows } = await query(
    `SELECT j.id, j.title, j.status, j.hidden, j.category_id, j.state_id, j.created_at,
            hp.display_name AS hirer_display_name, j.hirer_user_id
       FROM jobs j
       JOIN hirer_profiles hp ON hp.user_id = j.hirer_user_id
       ${whereClause}
      ORDER BY j.created_at DESC
      LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );
  return rows;
}

/** Full admin detail view: the job itself, its applicants, and the hired worker if any. */
async function getJobDetailForAdmin(jobId) {
  const job = await jobService.getJobById(jobId);
  if (!job) throw new AppError('Job not found.', 404, 'NOT_FOUND');

  const { rows: applicants } = await query(
    `SELECT a.id, a.worker_user_id, a.status, a.applied_at, u.full_name, wp.professional_title
       FROM applications a
       JOIN users u ON u.id = a.worker_user_id
       JOIN worker_profiles wp ON wp.user_id = a.worker_user_id
      WHERE a.job_id = $1
      ORDER BY a.applied_at DESC`,
    [jobId]
  );

  return { ...job, applicants, hiredWorker: applicants.find((a) => a.status === 'hired') || null };
}

/** Reversibly pulls a job out of public search while under review — see adminRemoveJob for the permanent alternative. */
async function hideJob(jobId, adminUserId, reason) {
  const { rows } = await query(
    `UPDATE jobs SET hidden = true, hidden_reason = $2, hidden_by = $3, hidden_at = now()
      WHERE id = $1 RETURNING *`,
    [jobId, reason || null, adminUserId]
  );
  if (rows.length === 0) throw new AppError('Job not found.', 404, 'NOT_FOUND');

  await recordAuditEvent({
    actorUserId: adminUserId,
    action: 'JOB_HIDDEN',
    resourceType: 'job',
    resourceId: jobId,
    result: 'success',
    metadata: { reason },
  });
  return rows[0];
}

async function restoreJob(jobId, adminUserId) {
  const { rows } = await query(
    `UPDATE jobs SET hidden = false, hidden_reason = NULL, hidden_by = NULL, hidden_at = NULL
      WHERE id = $1 RETURNING *`,
    [jobId]
  );
  if (rows.length === 0) throw new AppError('Job not found.', 404, 'NOT_FOUND');

  await recordAuditEvent({
    actorUserId: adminUserId,
    action: 'JOB_RESTORED',
    resourceType: 'job',
    resourceId: jobId,
    result: 'success',
  });
  return rows[0];
}

module.exports = {
  reportJob,
  listReportedJobs,
  getReportsForJob,
  adminRemoveJob,
  listJobsForAdmin,
  getJobDetailForAdmin,
  hideJob,
  restoreJob,
};
