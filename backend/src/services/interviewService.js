const { query, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const applicationService = require('./applicationService');
const jobService = require('./jobService');
const notificationService = require('./notificationService');

async function logEvent(client, interviewId, actorUserId, eventType, metadata = {}) {
  const runner = client || { query };
  await runner.query(
    `INSERT INTO interview_events (interview_id, actor_user_id, event_type, metadata)
     VALUES ($1, $2, $3, $4)`,
    [interviewId, actorUserId, eventType, JSON.stringify(metadata)]
  );
}

/**
 * Loads an interview and verifies the given user is a participant
 * (hirer or worker on it) via interview_participants — the actual
 * authorization source, checked fresh on every call. This is what
 * stands between "you have a valid session" and "you may view/join/
 * act on this specific interview."
 */
async function assertParticipant(interviewId, userId) {
  const { rows } = await query(
    `SELECT i.*, ip.role AS caller_role
       FROM interviews i
       JOIN interview_participants ip ON ip.interview_id = i.id
      WHERE i.id = $1 AND ip.user_id = $2`,
    [interviewId, userId]
  );
  if (rows.length === 0) {
    throw new AppError('Interview not found.', 404, 'NOT_FOUND');
  }
  return rows[0];
}

/**
 * Schedules a new interview. The hirer must own the underlying job
 * (checked via jobService.getOwnedJob) — role alone never suffices.
 * If an applicationId is given, the worker is taken from that
 * application rather than trusted directly from the request, so a
 * hirer can't schedule an interview against a worker who never
 * applied/was invited to that job.
 */
async function scheduleInterview(hirerUserId, input) {
  let workerUserId = input.workerUserId;
  let jobId = input.jobId || null;

  if (input.applicationId) {
    const application = await applicationService.getApplicationById(input.applicationId);
    if (!application) throw new AppError('Application not found.', 404, 'NOT_FOUND');
    await jobService.getOwnedJob(application.job_id, hirerUserId); // throws if hirer doesn't own the job
    workerUserId = application.worker_user_id;
    jobId = application.job_id;
  } else if (jobId) {
    await jobService.getOwnedJob(jobId, hirerUserId);
  }

  if (!workerUserId) {
    throw new AppError('A worker or application must be specified.', 400, 'MISSING_WORKER');
  }

  if (input.interviewType === 'in_person' && !input.locationAddress) {
    throw new AppError('An address is required for in-person interviews.', 400, 'MISSING_LOCATION');
  }

  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO interviews (
         application_id, job_id, hirer_user_id, worker_user_id, interview_type,
         status, scheduled_start_at, duration_minutes, timezone,
         location_address, location_instructions, notes, created_by
       ) VALUES ($1,$2,$3,$4,$5,'pending',$6,$7,$8,$9,$10,$11,$3)
       RETURNING *`,
      [
        input.applicationId || null,
        jobId,
        hirerUserId,
        workerUserId,
        input.interviewType,
        input.scheduledStartAt,
        input.durationMinutes || 30,
        input.timezone || 'Africa/Lagos',
        input.locationAddress || null,
        input.locationInstructions || null,
        input.notes || null,
      ]
    );
    const interview = rows[0];

    await client.query(
      `INSERT INTO interview_participants (interview_id, user_id, role) VALUES ($1,$2,'hirer'), ($1,$3,'worker')`,
      [interview.id, hirerUserId, workerUserId]
    );

    await logEvent(client, interview.id, hirerUserId, 'created', { interviewType: input.interviewType });

    const scheduledJob = jobId ? await jobService.getJobById(jobId) : null;
    const scheduledAt = interview.scheduled_start_at ? new Date(interview.scheduled_start_at) : null;
    notificationService.notifyUser(workerUserId, 'interview_scheduled', {
      title: 'Interview scheduled',
      body: `You have a ${input.interviewType} interview scheduled.`,
      data: {
        interviewId: interview.id,
        jobTitle: scheduledJob?.title,
        interviewType: input.interviewType,
        interviewDate: scheduledAt ? scheduledAt.toLocaleDateString('en-NG', { dateStyle: 'medium' }) : undefined,
        interviewTime: scheduledAt ? scheduledAt.toLocaleTimeString('en-NG', { timeStyle: 'short' }) : undefined,
      },
    }).catch(() => {});

    return interview;
  });
}

const WORKER_RESPONSE_TRANSITIONS = { pending: ['accepted', 'declined'] };

async function respondToInvitation(interviewId, workerUserId, accept) {
  const interview = await assertParticipant(interviewId, workerUserId);
  if (interview.caller_role !== 'worker') {
    throw new AppError('Only the invited worker can respond to this interview.', 403, 'FORBIDDEN');
  }
  const newStatus = accept ? 'accepted' : 'declined';
  const allowed = WORKER_RESPONSE_TRANSITIONS[interview.status] || [];
  if (!allowed.includes(newStatus)) {
    throw new AppError(`Cannot respond while interview status is "${interview.status}".`, 400, 'INVALID_STATUS_TRANSITION');
  }

  return withTransaction(async (client) => {
    const finalStatus = accept ? 'scheduled' : 'declined';
    const { rows } = await client.query(
      'UPDATE interviews SET status = $2 WHERE id = $1 RETURNING *',
      [interviewId, finalStatus]
    );
    await logEvent(client, interviewId, workerUserId, accept ? 'accepted' : 'declined');
    notificationService.notifyUser(interview.hirer_user_id, 'interview_response', {
      title: accept ? 'Interview accepted' : 'Interview declined',
      body: `The worker ${accept ? 'accepted' : 'declined'} the interview.`,
      data: { interviewId },
    }).catch(() => {});
    return rows[0];
  });
}

async function requestReschedule(interviewId, userId, proposedStartAt) {
  const interview = await assertParticipant(interviewId, userId);
  if (!['scheduled', 'accepted', 'pending'].includes(interview.status)) {
    throw new AppError(`Cannot request a reschedule while status is "${interview.status}".`, 400, 'INVALID_STATUS_TRANSITION');
  }
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE interviews SET status = 'reschedule_requested' WHERE id = $1 RETURNING *`,
      [interviewId]
    );
    await logEvent(client, interviewId, userId, 'reschedule_requested', { proposedStartAt });
    return rows[0];
  });
}

/** Only the hirer confirms a new time — keeps scheduling authority with the job owner. */
async function confirmReschedule(interviewId, hirerUserId, newStartAt) {
  const interview = await assertParticipant(interviewId, hirerUserId);
  if (interview.caller_role !== 'hirer') {
    throw new AppError('Only the hirer can confirm a reschedule.', 403, 'FORBIDDEN');
  }
  if (interview.status !== 'reschedule_requested') {
    throw new AppError('This interview has no pending reschedule request.', 400, 'INVALID_STATUS_TRANSITION');
  }
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE interviews SET status = 'scheduled', scheduled_start_at = $2 WHERE id = $1 RETURNING *`,
      [interviewId, newStartAt]
    );
    await logEvent(client, interviewId, hirerUserId, 'rescheduled', { newStartAt });
    return rows[0];
  });
}

async function cancelInterview(interviewId, userId, reason) {
  const interview = await assertParticipant(interviewId, userId);
  if (['completed', 'cancelled', 'no_show'].includes(interview.status)) {
    throw new AppError(`Cannot cancel an interview that is already "${interview.status}".`, 400, 'INVALID_STATUS_TRANSITION');
  }
  return withTransaction(async (client) => {
    const { rows } = await client.query(`UPDATE interviews SET status = 'cancelled' WHERE id = $1 RETURNING *`, [interviewId]);
    await logEvent(client, interviewId, userId, 'cancelled', { reason: reason || null });
    const otherUserId = interview.caller_role === 'hirer' ? interview.worker_user_id : interview.hirer_user_id;
    notificationService.notifyUser(otherUserId, 'interview_cancelled', {
      title: 'Interview cancelled',
      body: reason || 'The interview was cancelled.',
      data: { interviewId },
    }).catch(() => {});
    return rows[0];
  });
}

/** Called by the hirer after the interview took place. */
async function markCompleted(interviewId, hirerUserId) {
  const interview = await assertParticipant(interviewId, hirerUserId);
  if (interview.caller_role !== 'hirer') {
    throw new AppError('Only the hirer can mark an interview completed.', 403, 'FORBIDDEN');
  }
  if (!['scheduled', 'in_progress'].includes(interview.status)) {
    throw new AppError(`Cannot complete an interview with status "${interview.status}".`, 400, 'INVALID_STATUS_TRANSITION');
  }
  return withTransaction(async (client) => {
    const { rows } = await client.query(`UPDATE interviews SET status = 'completed' WHERE id = $1 RETURNING *`, [interviewId]);
    await logEvent(client, interviewId, hirerUserId, 'completed');
    return rows[0];
  });
}

async function markNoShow(interviewId, hirerUserId) {
  const interview = await assertParticipant(interviewId, hirerUserId);
  if (interview.caller_role !== 'hirer') {
    throw new AppError('Only the hirer can mark a no-show.', 403, 'FORBIDDEN');
  }
  if (interview.status !== 'scheduled') {
    throw new AppError(`Cannot mark no-show with status "${interview.status}".`, 400, 'INVALID_STATUS_TRANSITION');
  }
  return withTransaction(async (client) => {
    const { rows } = await client.query(`UPDATE interviews SET status = 'no_show' WHERE id = $1 RETURNING *`, [interviewId]);
    await logEvent(client, interviewId, hirerUserId, 'no_show');
    return rows[0];
  });
}

/**
 * Marks in_progress on first join and logs the join event. Called
 * only from the call-token endpoint, after assertParticipant and the
 * timing-window check have already passed.
 */
async function recordJoin(interviewId, userId) {
  await query(`UPDATE interviews SET status = 'in_progress' WHERE id = $1 AND status = 'scheduled'`, [interviewId]);
  await logEvent(null, interviewId, userId, 'joined');
}

async function recordLeave(interviewId, userId) {
  await logEvent(null, interviewId, userId, 'left');
}

async function listUpcomingForUser(userId) {
  const { rows } = await query(
    `SELECT i.* FROM interviews i
       JOIN interview_participants ip ON ip.interview_id = i.id
      WHERE ip.user_id = $1
        AND i.status IN ('pending', 'accepted', 'scheduled', 'reschedule_requested')
      ORDER BY i.scheduled_start_at ASC`,
    [userId]
  );
  return rows;
}

async function listPastForUser(userId) {
  const { rows } = await query(
    `SELECT i.* FROM interviews i
       JOIN interview_participants ip ON ip.interview_id = i.id
      WHERE ip.user_id = $1
        AND i.status IN ('completed', 'cancelled', 'declined', 'no_show', 'passed', 'failed')
      ORDER BY i.scheduled_start_at DESC`,
    [userId]
  );
  return rows;
}

async function getEventsForInterview(interviewId, userId) {
  await assertParticipant(interviewId, userId); // authorization check
  const { rows } = await query(
    'SELECT id, event_type, metadata, created_at FROM interview_events WHERE interview_id = $1 ORDER BY created_at ASC',
    [interviewId]
  );
  return rows;
}

module.exports = {
  assertParticipant,
  scheduleInterview,
  respondToInvitation,
  requestReschedule,
  confirmReschedule,
  cancelInterview,
  markCompleted,
  markNoShow,
  recordJoin,
  recordLeave,
  listUpcomingForUser,
  listPastForUser,
  getEventsForInterview,
};
