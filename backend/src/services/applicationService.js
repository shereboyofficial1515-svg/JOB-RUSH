const { query } = require('../config/db');
const AppError = require('../utils/AppError');
const jobService = require('./jobService');
const notificationService = require('./notificationService');

/**
 * Allowed status transitions, keyed by who may perform them. This is
 * the single source of truth for what's legal — controllers never
 * write a status directly, they call the specific action functions
 * below, each of which checks this table before updating anything.
 */
const WORKER_TRANSITIONS = {
  invited: ['accepted', 'declined'],
  applied: ['withdrawn'],
  shortlisted: ['withdrawn'],
  accepted: ['withdrawn'],
};

const HIRER_TRANSITIONS = {
  applied: ['shortlisted', 'rejected'],
  accepted: ['shortlisted', 'rejected'],
  shortlisted: ['hired', 'rejected'],
};

async function getApplicationById(applicationId) {
  const { rows } = await query('SELECT * FROM applications WHERE id = $1', [applicationId]);
  return rows[0] || null;
}

/** Loads an application the worker must own, or throws. */
async function getOwnedApplicationForWorker(applicationId, workerUserId) {
  const { rows } = await query(
    'SELECT * FROM applications WHERE id = $1 AND worker_user_id = $2',
    [applicationId, workerUserId]
  );
  if (rows.length === 0) throw new AppError('Application not found.', 404, 'NOT_FOUND');
  return rows[0];
}

/**
 * Loads an application belonging to a job the hirer must own, or
 * throws. This is the check that matters for every hirer-side action
 * — role alone ('hirer') never implies rights over *this*
 * application; ownership of the underlying job does.
 */
async function getApplicationForHirerJob(applicationId, hirerUserId) {
  const { rows } = await query(
    `SELECT a.* FROM applications a
       JOIN jobs j ON j.id = a.job_id
      WHERE a.id = $1 AND j.hirer_user_id = $2`,
    [applicationId, hirerUserId]
  );
  if (rows.length === 0) throw new AppError('Application not found.', 404, 'NOT_FOUND');
  return rows[0];
}

/**
 * Worker applies to an open job. Fails clearly on duplicate
 * application (unique constraint) and on non-open jobs, rather than
 * silently succeeding or producing a confusing DB error.
 */
async function applyToJob(workerUserId, jobId, { coverNote, proposedRate }) {
  const job = await jobService.getJobById(jobId);
  if (!job) throw new AppError('Job not found.', 404, 'NOT_FOUND');
  if (job.status !== 'open') {
    throw new AppError('This job is no longer accepting applications.', 400, 'JOB_NOT_OPEN');
  }

  const { rows: settingsRows } = await query(
    `SELECT COALESCE(us.require_cover_note, false) AS require_cover_note
       FROM user_settings us WHERE us.user_id = $1`,
    [job.hirer_user_id]
  );
  if (settingsRows[0]?.require_cover_note && !coverNote?.trim()) {
    throw new AppError('This hirer requires a cover note with applications.', 400, 'COVER_NOTE_REQUIRED');
  }

  try {
    const { rows } = await query(
      `INSERT INTO applications (job_id, worker_user_id, source, status, cover_note, proposed_rate)
       VALUES ($1, $2, 'worker_applied', 'applied', $3, $4)
       RETURNING *`,
      [jobId, workerUserId, coverNote || null, proposedRate ?? null]
    );
    notificationService.notifyUser(job.hirer_user_id, 'application_received', {
      title: 'New application received',
      body: `Someone applied to "${job.title}".`,
      data: { jobId, applicationId: rows[0].id, jobTitle: job.title, submittedAt: rows[0].applied_at },
    }).catch(() => {});
    notificationService.notifyUser(workerUserId, 'application_submitted', {
      title: 'Application submitted',
      body: `Your application for "${job.title}" has been successfully submitted.`,
      data: { jobId, applicationId: rows[0].id, jobTitle: job.title, submittedAt: rows[0].applied_at },
    }).catch(() => {});
    return rows[0];
  } catch (err) {
    if (err.code === '23505') {
      // unique_violation on (job_id, worker_user_id)
      throw new AppError('You have already applied to this job.', 409, 'ALREADY_APPLIED');
    }
    throw err;
  }
}

/** Hirer invites a specific worker to a job they own. */
async function inviteWorkerToJob(hirerUserId, jobId, workerUserId) {
  const job = await jobService.getOwnedJob(jobId, hirerUserId); // throws if not owned

  const { rows: workerRows } = await query('SELECT user_id FROM worker_profiles WHERE user_id = $1', [workerUserId]);
  if (workerRows.length === 0) {
    throw new AppError('Worker profile not found.', 404, 'NOT_FOUND');
  }

  try {
    const { rows } = await query(
      `INSERT INTO applications (job_id, worker_user_id, source, status)
       VALUES ($1, $2, 'hirer_invited', 'invited')
       RETURNING *`,
      [jobId, workerUserId]
    );
    notificationService.notifyUser(workerUserId, 'job_invitation', {
      title: 'You were invited to apply',
      body: `A hirer invited you to "${job.title}".`,
      data: { jobId, applicationId: rows[0].id, jobTitle: job.title },
    }).catch(() => {});
    return rows[0];
  } catch (err) {
    if (err.code === '23505') {
      throw new AppError('This worker already has an application or invitation for this job.', 409, 'ALREADY_EXISTS');
    }
    throw err;
  }
}

async function withdrawApplication(applicationId, workerUserId) {
  const application = await getOwnedApplicationForWorker(applicationId, workerUserId);
  return transition(application, 'withdrawn', WORKER_TRANSITIONS);
}

async function respondToInvitation(applicationId, workerUserId, accept) {
  const application = await getOwnedApplicationForWorker(applicationId, workerUserId);
  if (application.status !== 'invited') {
    throw new AppError('This invitation is no longer pending.', 400, 'INVALID_STATUS_TRANSITION');
  }
  const updated = await transition(application, accept ? 'accepted' : 'declined', WORKER_TRANSITIONS);
  const job = await jobService.getJobById(application.job_id);
  if (job) {
    notificationService.notifyUser(job.hirer_user_id, 'application_status_changed', {
      title: accept ? 'Invitation accepted' : 'Invitation declined',
      body: `A worker ${accept ? 'accepted' : 'declined'} your invitation for "${job.title}".`,
      data: { jobId: application.job_id, applicationId, jobTitle: job.title, applicationStatus: accept ? 'accepted' : 'declined' },
    }).catch(() => {});
  }
  return updated;
}

async function shortlistApplication(applicationId, hirerUserId) {
  const application = await getApplicationForHirerJob(applicationId, hirerUserId);
  const updated = await transition(application, 'shortlisted', HIRER_TRANSITIONS);
  const job = await jobService.getJobById(application.job_id);
  notificationService.notifyUser(application.worker_user_id, 'application_status_changed', {
    title: 'You were shortlisted',
    body: 'A hirer shortlisted your application.',
    data: { applicationId, jobTitle: job?.title, applicationStatus: 'shortlisted' },
  }).catch(() => {});
  return updated;
}

async function rejectApplication(applicationId, hirerUserId) {
  const application = await getApplicationForHirerJob(applicationId, hirerUserId);
  const updated = await transition(application, 'rejected', HIRER_TRANSITIONS);
  const job = await jobService.getJobById(application.job_id);
  notificationService.notifyUser(application.worker_user_id, 'application_status_changed', {
    title: 'Application update',
    body: 'Your application was not successful this time.',
    data: { applicationId, jobTitle: job?.title, applicationStatus: 'rejected' },
  }).catch(() => {});
  return updated;
}

async function hireApplication(applicationId, hirerUserId) {
  const application = await getApplicationForHirerJob(applicationId, hirerUserId);
  const updated = await transition(application, 'hired', HIRER_TRANSITIONS);
  // Marking the job filled is a reasonable default; a hirer running
  // multiple simultaneous hires from one posting can reopen it via
  // the job status endpoint if that's not what they want.
  await jobService.setJobStatus(application.job_id, hirerUserId, 'filled').catch(() => {});
  const hiredJob = await jobService.getJobById(application.job_id);
  notificationService.notifyUser(application.worker_user_id, 'application_status_changed', {
    title: "You've been hired!",
    body: 'Congratulations — set up your contract to get started.',
    data: { applicationId, jobTitle: hiredJob?.title, applicationStatus: 'hired' },
  }).catch(() => {});
  return updated;
}

async function transition(application, newStatus, transitionTable) {
  const allowed = transitionTable[application.status] || [];
  if (!allowed.includes(newStatus)) {
    throw new AppError(
      `Cannot move an application from "${application.status}" to "${newStatus}".`,
      400,
      'INVALID_STATUS_TRANSITION'
    );
  }
  const { rows } = await query(
    `UPDATE applications SET status = $2, responded_at = now() WHERE id = $1 RETURNING *`,
    [application.id, newStatus]
  );
  return rows[0];
}

/** For a hirer reviewing applicants to their own job. */
async function listApplicationsForJob(jobId, hirerUserId) {
  await jobService.getOwnedJob(jobId, hirerUserId);
  const { rows } = await query(
    `SELECT a.*, u.full_name, wp.professional_title, wp.rating_avg, wp.verification_status, wp.is_pro
       FROM applications a
       JOIN worker_profiles wp ON wp.user_id = a.worker_user_id
       JOIN users u ON u.id = a.worker_user_id
      WHERE a.job_id = $1
      ORDER BY a.applied_at DESC`,
    [jobId]
  );
  return rows;
}

/** For a worker's own applications/invitations dashboard. */
async function listApplicationsForWorker(workerUserId) {
  const { rows } = await query(
    `SELECT a.*, j.title AS job_title, j.status AS job_status, hp.display_name AS hirer_display_name
       FROM applications a
       JOIN jobs j ON j.id = a.job_id
       JOIN hirer_profiles hp ON hp.user_id = j.hirer_user_id
      WHERE a.worker_user_id = $1
      ORDER BY a.applied_at DESC`,
    [workerUserId]
  );
  return rows;
}

module.exports = {
  getApplicationById,
  applyToJob,
  inviteWorkerToJob,
  withdrawApplication,
  respondToInvitation,
  shortlistApplication,
  rejectApplication,
  hireApplication,
  listApplicationsForJob,
  listApplicationsForWorker,
};
