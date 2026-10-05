const realtimeHub = require('./realtimeHub');
const { query } = require('../config/db');
const AppError = require('../utils/AppError');
const conversationService = require('./conversationService');
const blockService = require('./blockService');
const livekitService = require('./livekitService');
const userSummaryService = require('./userSummaryService');
const pushService = require('./pushService');
const notificationService = require('./notificationService');
const { resolveCategoryPrefs } = require('./notificationCategories');
const logger = require('../utils/logger');

/**
 * ONE authoritative call state machine. The `calls` row is the truth; every screen (caller,
 * callee, a second device, the Android ringer) only renders it. Any change is pushed to both
 * people over the realtime stream the moment it is saved, so nobody has to refresh, press
 * "read" or wait for a poll to see that a call is over.
 *
 *   calling -> ringing -> connecting -> connected -> ended
 *                 |            |
 *                 +-> declined (callee) / cancelled (caller) / missed (timeout) / busy / failed
 *
 * 'cancelled' = the caller backed out before the call was answered; 'failed' = a real connection
 * error; 'ended' is for a call that was answered and then hung up.
 */
const TRANSITIONS = {
  // call-room.html goes straight from creating the call to connecting, so 'calling' can reach
  // 'connecting' / 'connected' directly, not only through 'ringing'.
  calling: ['ringing', 'connecting', 'connected', 'busy', 'declined', 'missed', 'cancelled', 'failed', 'ended'],
  ringing: ['connecting', 'connected', 'declined', 'missed', 'cancelled', 'failed', 'ended'],
  connecting: ['connected', 'failed', 'cancelled', 'ended'],
  connected: ['reconnecting', 'ended'],
  reconnecting: ['connected', 'ended'],
};

const TERMINAL_STATUSES = ['ended', 'declined', 'missed', 'busy', 'failed', 'cancelled'];

// Who may report which outcome. The server, not the screen, decides: a caller cannot "decline" their
// own call, and only the caller can cancel it. 'missed' is normally written by the server's own
// timeout (below); the callee's device may also report it when its ring timer runs out.
const CALLEE_ONLY = ['ringing', 'declined', 'busy', 'missed'];
const CALLER_ONLY = ['cancelled'];

// How long an unanswered call rings. The Android ringer and the web pages use the same 45 s,
// so every side gives up together; the server enforces it even if no client is open.
const RING_TIMEOUT_SECONDS = 45;
// A call stuck in 'connecting' (someone accepted, the media never came up) is failed after this.
const CONNECT_TIMEOUT_SECONDS = 120;

async function assertCallParticipant(callId, userId) {
  const { rows } = await query(
    'SELECT * FROM calls WHERE id = $1 AND (caller_user_id = $2 OR callee_user_id = $2)',
    [callId, userId]
  );
  if (rows.length === 0) throw new AppError('Call not found.', 404, 'NOT_FOUND');
  return rows[0];
}

async function initiateCall(callerUserId, conversationId, callType) {
  await conversationService.assertParticipant(conversationId, callerUserId);
  const calleeUserId = await conversationService.getOtherParticipant(conversationId, callerUserId);
  if (!calleeUserId) throw new AppError('No other participant in this conversation.', 400, 'NO_CALLEE');

  if (await blockService.isBlockedEitherWay(callerUserId, calleeUserId)) {
    throw new AppError('You cannot call this user.', 403, 'BLOCKED');
  }

  // A call this person left hanging earlier (closed the tab, lost signal) must not keep ringing the
  // other side when they ring again: close it as cancelled first.
  const { rows: stale } = await query(
    `UPDATE calls SET status = 'cancelled', ended_at = now()
      WHERE caller_user_id = $1 AND conversation_id = $2 AND status IN ('calling', 'ringing') RETURNING *`,
    [callerUserId, conversationId]
  );
  for (const old of stale) {
    publishCallState(old, callerUserId);
    afterTerminal(old, callerUserId);
  }

  const { rows } = await query(
    `INSERT INTO calls (conversation_id, caller_user_id, callee_user_id, call_type)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [conversationId, callerUserId, calleeUserId, callType]
  );
  const call = rows[0];

  // The call row is saved: the call exists whatever happens to delivery below. An open page on the
  // callee's side learns about it over the realtime stream at once.
  realtimeHub.publish([calleeUserId], 'call.incoming', { callId: call.id, callType, conversationId });

  // Alerting a backgrounded / closed device is secondary and runs off the request: the API answers
  // now, the push goes out in the background, and a failing push provider can never fail the call.
  setImmediate(() => pushIncomingCall(call).catch((err) => logger.error('Call push notification failed', { callId: call.id, error: err.message })));

  return call;
}

/** Push an "incoming call" alert to the callee's devices, if their notification settings allow it. */
async function pushIncomingCall(call) {
  const { rows } = await query('SELECT push_enabled, category_prefs FROM notification_preferences WHERE user_id = $1', [call.callee_user_id]);
  const pushOn = rows[0] ? rows[0].push_enabled !== false : true;
  const prefs = resolveCategoryPrefs(rows[0] && rows[0].category_prefs);
  if (!pushOn || !(call.call_type === 'video' ? prefs.video_calls : prefs.audio_calls)) return;

  const caller = await userSummaryService.getCallDisplaySummary(call.caller_user_id);
  // Re-check: the caller may have hung up while this job was queued, and a stale "incoming call" must never appear.
  const { rows: current } = await query('SELECT status FROM calls WHERE id = $1', [call.id]);
  if (!current[0] || !['calling', 'ringing'].includes(current[0].status)) return;

  await pushService.sendPushToUser(call.callee_user_id, {
    title: `Incoming ${call.call_type === 'video' ? 'video' : 'audio'} call`,
    body: caller && caller.fullName ? `${caller.fullName} is calling you` : 'Someone is calling you',
    data: { type: 'incoming_call', callId: call.id, callType: call.call_type, conversationId: call.conversation_id },
    tag: `call-${call.id}`,
    requireInteraction: true,
  });
}

/**
 * Moves a call to a new status. Safe to call twice with the same outcome and safe against races:
 *  - the same status again is a no-op;
 *  - once a call is over, the FIRST outcome wins (A cancels while B declines -> whichever the
 *    database saw first), and later terminal reports just return it;
 *  - trying to move a finished call back to "connecting" answers 409 CALL_ALREADY_ENDED, which is how
 *    a callee who taps Accept a moment after the caller hung up learns the call is gone.
 */
async function updateCallStatus(callId, userId, newStatus, failureReason) {
  const call = await assertCallParticipant(callId, userId);
  const isCaller = call.caller_user_id === userId;
  if (isCaller && CALLEE_ONLY.includes(newStatus)) {
    throw new AppError('Only the person being called can do that.', 403, 'FORBIDDEN');
  }
  if (!isCaller && CALLER_ONLY.includes(newStatus)) {
    throw new AppError('Only the person who placed the call can cancel it.', 403, 'FORBIDDEN');
  }
  return applyTransition(call, newStatus, { failureReason, actorUserId: userId });
}

async function applyTransition(call, newStatus, { failureReason, actorUserId, attempt = 0 } = {}) {
  if (call.status === newStatus) return call;
  if (TERMINAL_STATUSES.includes(call.status)) {
    if (TERMINAL_STATUSES.includes(newStatus)) return call;
    throw new AppError('This call has already ended.', 409, 'CALL_ALREADY_ENDED');
  }
  const allowed = TRANSITIONS[call.status] || [];
  if (!allowed.includes(newStatus)) {
    throw new AppError(`Cannot move a call from "${call.status}" to "${newStatus}".`, 400, 'INVALID_STATUS_TRANSITION');
  }

  const fields = ['status = $3'];
  const params = [call.id, call.status, newStatus];
  if (newStatus === 'connected' && !call.connected_at) fields.push('connected_at = now()');
  if (TERMINAL_STATUSES.includes(newStatus)) {
    fields.push('ended_at = now()');
    if (call.connected_at) fields.push('duration_seconds = EXTRACT(EPOCH FROM (now() - connected_at))::int');
  }
  if (newStatus === 'failed' && failureReason) {
    params.push(String(failureReason).slice(0, 300));
    fields.push(`failure_reason = $${params.length}`);
  }

  // Compare-and-set on the old status, so two reports arriving together cannot both win.
  const { rows } = await query(`UPDATE calls SET ${fields.join(', ')} WHERE id = $1 AND status = $2 RETURNING *`, params);
  if (rows.length === 0) {
    if (attempt >= 2) throw new AppError('The call changed. Please try again.', 409, 'CALL_STATE_CHANGED');
    const { rows: fresh } = await query('SELECT * FROM calls WHERE id = $1', [call.id]);
    return applyTransition(fresh[0], newStatus, { failureReason, actorUserId, attempt: attempt + 1 });
  }
  const updated = rows[0];
  publishCallState(updated, actorUserId);
  if (TERMINAL_STATUSES.includes(newStatus)) afterTerminal(updated, actorUserId);
  return updated;
}

/** Tells both people (and every one of their devices) the call's new state. Carries enough for a screen to act without asking again. */
function publishCallState(call, actorUserId) {
  realtimeHub.publish([call.caller_user_id, call.callee_user_id], 'call.updated', {
    callId: call.id,
    status: call.status,
    callType: call.call_type,
    conversationId: call.conversation_id,
    endedBy: TERMINAL_STATUSES.includes(call.status) ? actorUserId || null : null,
    version: new Date(call.ended_at || call.connected_at || call.started_at).getTime(),
  });
}

/** Everything that follows a call being over, off the request: the chat card, the notification and clearing the ringing alert. */
function afterTerminal(call, actorUserId) {
  setImmediate(() => finalizeCall(call, actorUserId).catch((err) => logger.error('Finalising call failed', { callId: call.id, error: err.message })));
}

async function finalizeCall(call) {
  const answered = !!call.connected_at;
  // What the conversation records: an answered call (with its length), a declined call, or a call that
  // was never answered (timed out, or cancelled by the caller) which the callee sees as "Missed".
  let eventKind = null;
  if (answered && call.status === 'ended') eventKind = 'ended';
  else if (call.status === 'declined') eventKind = 'declined';
  else if (!answered && (call.status === 'missed' || call.status === 'cancelled')) eventKind = 'missed';
  if (eventKind) await createCallEventMessage(call);

  const caller = await userSummaryService.getCallDisplaySummary(call.caller_user_id);
  const callerName = (caller && caller.fullName) || 'Someone';
  const label = call.call_type === 'video' ? 'video' : 'audio';

  if (eventKind === 'missed') {
    // Notification centre entry (the OS alert is the replacement push below, so this stays in-app only).
    notificationService
      .notifyUser(call.callee_user_id, 'call_missed', {
        title: `Missed ${label} call`,
        body: `${callerName} called you`,
        data: { callId: call.id, callType: call.call_type, conversationId: call.conversation_id, callerUserId: call.caller_user_id },
      })
      .catch((err) => logger.warn('Missed-call notification failed', { callId: call.id, error: err.message }));
  }

  // Clear the ringing alert on the callee's devices (same tag replaces it). For a missed call the
  // replacement IS the missed-call notification; for a call declined or answered elsewhere it is a
  // quiet "Call ended". Skipped when the call was answered and ended normally: nothing is ringing.
  if (!answered) await pushCallEnded(call, eventKind === 'missed', callerName, label);
}

async function pushCallEnded(call, missed, callerName, label) {
  const { rows } = await query('SELECT push_enabled, category_prefs FROM notification_preferences WHERE user_id = $1', [call.callee_user_id]);
  const pushOn = rows[0] ? rows[0].push_enabled !== false : true;
  const prefs = resolveCategoryPrefs(rows[0] && rows[0].category_prefs);
  // Even if the person switched call alerts off, an alert that already went out must still be cleared.
  const showMissed = missed && pushOn && prefs.missed_calls;
  await pushService.sendPushToUser(call.callee_user_id, {
    title: showMissed ? `Missed ${label} call` : 'Call ended',
    body: showMissed ? `${callerName} called you` : '',
    data: { type: showMissed ? 'missed_call' : 'call_ended', callId: call.id, callType: call.call_type, conversationId: call.conversation_id, quiet: !showMissed },
    tag: `call-${call.id}`,
    requireInteraction: false,
  });
}

/** One card per call in the conversation, created from the call row itself (never from the browser). */
async function createCallEventMessage(call) {
  const { rows } = await query(
    `INSERT INTO messages (conversation_id, sender_id, message_type, call_id)
     VALUES ($1, $2, 'call', $3)
     ON CONFLICT (call_id) WHERE call_id IS NOT NULL DO NOTHING
     RETURNING *`,
    [call.conversation_id, call.caller_user_id, call.id]
  );
  if (rows.length === 0) return null; // already recorded
  await query('UPDATE conversations SET last_message_at = now() WHERE id = $1', [call.conversation_id]);
  // Required here, not at the top: messageService is loaded by modules that load this one.
  const messageService = require('./messageService');
  const hydrated = (await messageService.hydrateMessages(rows))[0];
  realtimeHub.publish([call.caller_user_id, call.callee_user_id], 'message.new', { conversationId: call.conversation_id, message: hydrated });
  return hydrated;
}

/**
 * Server-side timeout, so a call never depends on a browser staying open: an unanswered call is
 * marked missed after RING_TIMEOUT_SECONDS, and one that never finished connecting is failed. Runs
 * on a timer (see server.js); each row is claimed by an atomic UPDATE, so it is safe if two
 * instances ever run it.
 */
async function sweepStaleCalls() {
  const { rows: missed } = await query(
    `UPDATE calls SET status = 'missed', ended_at = now()
      WHERE status IN ('calling', 'ringing') AND started_at < now() - ($1 || ' seconds')::interval
      RETURNING *`,
    [RING_TIMEOUT_SECONDS]
  );
  for (const call of missed) {
    publishCallState(call, null);
    afterTerminal(call, null);
  }
  const { rows: failed } = await query(
    `UPDATE calls SET status = 'failed', ended_at = now(), failure_reason = 'Connection timed out'
      WHERE status = 'connecting' AND started_at < now() - ($1 || ' seconds')::interval
      RETURNING *`,
    [RING_TIMEOUT_SECONDS + CONNECT_TIMEOUT_SECONDS]
  );
  for (const call of failed) {
    publishCallState(call, null);
    afterTerminal(call, null);
  }
  return missed.length + failed.length;
}

let sweeperTimer = null;
function startCallSweeper(intervalMs = 10000) {
  if (sweeperTimer) return;
  sweeperTimer = setInterval(() => {
    sweepStaleCalls().catch((err) => logger.error('Call sweeper failed', { error: err.message }));
  }, intervalMs);
  sweeperTimer.unref();
}

/**
 * Security gate for issuing a LiveKit token: participant check, then
 * status check. 'calling' must be included here -- every call row is
 * created with that status (see 025_create_calls.sql's DEFAULT), and
 * call-room.html doesn't track a separate "ringing" UI phase: it goes
 * straight from creating the call row to fetching a token and
 * attempting the LiveKit connection, only moving the status to
 * 'connecting' after the token comes back (see TRANSITIONS above,
 * which already allows 'calling' -> 'connecting' directly).
 */
async function getCallToken(callId, userId, displayName) {
  const call = await assertCallParticipant(callId, userId);
  if (!['calling', 'ringing', 'connecting', 'connected'].includes(call.status)) {
    throw new AppError(`Cannot join a call with status "${call.status}".`, 400, 'NOT_JOINABLE');
  }
  const token = await livekitService.createCallAccessToken({ callId, userId, displayName });
  const otherUserId = call.caller_user_id === userId ? call.callee_user_id : call.caller_user_id;
  const otherParticipant = await userSummaryService.getCallDisplaySummary(otherUserId);
  // callType tells the frontend whether to request camera media at
  // all -- an audio call must never publish video, so this has to be
  // authoritative from the row the call was actually created with,
  // not re-derived or trusted from the client. isCaller tells it
  // whether to run outgoing-ringback logic (only the side that placed
  // the call waits/rings back for the other to join).
  return { ...token, callType: call.call_type, otherParticipant, isCaller: call.caller_user_id === userId, conversationId: call.conversation_id };
}

/**
 * The call ringing for this person right now (the page loads it on start and when the realtime
 * stream reconnects). Scoped to the ring window so an abandoned row can never ring forever.
 */
async function getIncomingCall(userId) {
  const { rows } = await query(
    `SELECT * FROM calls
      WHERE callee_user_id = $1 AND status IN ('calling', 'ringing')
        AND started_at > now() - ($2 || ' seconds')::interval
      ORDER BY started_at DESC
      LIMIT 1`,
    [userId, RING_TIMEOUT_SECONDS]
  );
  if (rows.length === 0) return null;
  const call = rows[0];
  const caller = await userSummaryService.getCallDisplaySummary(call.caller_user_id);
  return { id: call.id, status: call.status, callType: call.call_type, conversationId: call.conversation_id, caller };
}

/** The call's current state, for a screen that just opened or just reconnected and needs to catch up. */
async function getCallStatus(callId, userId) {
  const call = await assertCallParticipant(callId, userId);
  return { id: call.id, status: call.status, callType: call.call_type, conversationId: call.conversation_id };
}

/**
 * Call history for a conversation — every attempt, not just the ones
 * that connected, so a failed/declined/missed/cancelled call still
 * shows up. `direction` is relative to `userId` so the frontend can
 * render "Outgoing"/"Incoming" without recomputing it against whoever
 * happens to be logged in.
 */
async function listCallsForConversation(conversationId, userId) {
  await conversationService.assertParticipant(conversationId, userId);
  const { rows } = await query(
    `SELECT c.*,
            CASE WHEN c.caller_user_id = $2 THEN 'outgoing' ELSE 'incoming' END AS direction
       FROM calls c
      WHERE c.conversation_id = $1
      ORDER BY c.started_at DESC`,
    [conversationId, userId]
  );
  return rows;
}

module.exports = {
  initiateCall,
  updateCallStatus,
  getCallToken,
  listCallsForConversation,
  getIncomingCall,
  getCallStatus,
  sweepStaleCalls,
  startCallSweeper,
  RING_TIMEOUT_SECONDS,
  TERMINAL_STATUSES,
};
