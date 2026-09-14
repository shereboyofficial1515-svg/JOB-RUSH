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

module.exports = { reportJob, listReportedJobs, getReportsForJob, adminRemoveJob };
