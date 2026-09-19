const { query } = require('../config/db');
const AppError = require('../utils/AppError');
const conversationService = require('./conversationService');
const blockService = require('./blockService');
const livekitService = require('./livekitService');
const userSummaryService = require('./userSummaryService');
const pushService = require('./pushService');
const logger = require('../utils/logger');

// 'cancelled' (the caller backs out before the other side ever picks
// up) and 'failed' (a real connection error, e.g. LiveKit couldn't
// establish the session) are distinct from 'ended', which is reserved
// for a call that actually reached 'connecting' or later and was then
// hung up normally — see call-room.html for where each is sent.
const TRANSITIONS = {
  // call-room.html doesn't track a separate "ringing" UI phase — it
  // goes straight from creating the call row (status: calling) to
  // attempting the LiveKit connection, so 'calling' must be able to
  // reach 'connecting' directly, not just through 'ringing'.
  calling: ['ringing', 'connecting', 'busy', 'declined', 'missed', 'cancelled', 'failed', 'ended'],
  ringing: ['connecting', 'declined', 'missed', 'cancelled', 'failed', 'ended'],
  connecting: ['connected', 'failed', 'cancelled', 'ended'],
  connected: ['reconnecting', 'ended'],
  reconnecting: ['connected', 'ended'],
};

const TERMINAL_STATUSES = ['ended', 'declined', 'missed', 'busy', 'failed', 'cancelled'];

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

  const { rows } = await query(
    `INSERT INTO calls (conversation_id, caller_user_id, callee_user_id, call_type)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [conversationId, callerUserId, calleeUserId, callType]
  );
  const call = rows[0];

  // Best-effort only: the callee's device(s) still discover the call
  // for certain via the existing 3s incoming-call poll
  // (incomingCallWatcher.js) even if this push never arrives (no
  // subscription, permission denied, delivery failure). This just
  // shortens that discovery time and can reach a backgrounded tab.
  // Tagged by call id so a device that already surfaced this ring
  // doesn't show a second, duplicate OS notification for it.
  userSummaryService
    .getCallDisplaySummary(callerUserId)
    .then((caller) =>
      pushService.sendPushToUser(calleeUserId, {
        title: `Incoming ${callType === 'video' ? 'video' : 'audio'} call`,
        body: caller?.fullName ? `${caller.fullName} is calling you` : 'Someone is calling you',
        data: { type: 'incoming_call', callId: call.id, callType },
        tag: `call-${call.id}`,
        requireInteraction: true,
      })
    )
    .catch((err) => logger.error('Call push notification failed', { callId: call.id, error: err.message }));

  return call;
}

async function updateCallStatus(callId, userId, newStatus, failureReason) {
  const call = await assertCallParticipant(callId, userId);
  const allowed = TRANSITIONS[call.status] || [];
  if (!allowed.includes(newStatus)) {
    throw new AppError(`Cannot move a call from "${call.status}" to "${newStatus}".`, 400, 'INVALID_STATUS_TRANSITION');
  }

  const fields = ['status = $2'];
  const params = [callId, newStatus];
  if (newStatus === 'connected' && call.status !== 'connected') {
    fields.push('connected_at = now()');
  }
  if (TERMINAL_STATUSES.includes(newStatus)) {
    fields.push('ended_at = now()');
    if (call.connected_at) {
      fields.push(`duration_seconds = EXTRACT(EPOCH FROM (now() - connected_at))::int`);
    }
  }
  if (newStatus === 'failed' && failureReason) {
    params.push(failureReason.slice(0, 300));
    fields.push(`failure_reason = $${params.length}`);
  }

  const { rows } = await query(`UPDATE calls SET ${fields.join(', ')} WHERE id = $1 RETURNING *`, params);
  return rows[0];
}

/**
 * Security gate for issuing a LiveKit token: participant check, then
 * status check. 'calling' must be included here -- every call row is
 * created with that status (see 025_create_calls.sql's DEFAULT), and
 * call-room.html doesn't track a separate "ringing" UI phase: it goes
 * straight from creating the call row to fetching a token and
 * attempting the LiveKit connection, only moving the status to
 * 'connecting' after the token comes back (see TRANSITIONS above,
 * which already allows 'calling' -> 'connecting' directly). Excluding
 * 'calling' here meant every call's very first token request was
 * rejected as NOT_JOINABLE before either side could ever connect.
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
  return { ...token, callType: call.call_type, otherParticipant, isCaller: call.caller_user_id === userId };
}

/**
 * Polled by the callee's browser (there is no push/WebSocket in this
 * app -- see incomingCallWatcher.js) to discover a call ringing for
 * them right now. Scoped to the last 45s so an abandoned 'calling'
 * row (the caller's tab crashed, network dropped, etc.) doesn't ring
 * forever on the callee's side; the caller's own side independently
 * gives up and marks the call failed/cancelled well before that.
 */
async function getIncomingCall(userId) {
  const { rows } = await query(
    `SELECT * FROM calls
      WHERE callee_user_id = $1 AND status IN ('calling', 'ringing')
        AND started_at > now() - interval '45 seconds'
      ORDER BY started_at DESC
      LIMIT 1`,
    [userId]
  );
  if (rows.length === 0) return null;
  const call = rows[0];
  const caller = await userSummaryService.getCallDisplaySummary(call.caller_user_id);
  return { id: call.id, status: call.status, callType: call.call_type, caller };
}

/** Lightweight status poll for the caller's side, waiting to learn if/when the callee answers, declines, or the call times out -- see call-room.html's ringback logic. */
async function getCallStatus(callId, userId) {
  const call = await assertCallParticipant(callId, userId);
  return { id: call.id, status: call.status };
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

module.exports = { initiateCall, updateCallStatus, getCallToken, listCallsForConversation, getIncomingCall, getCallStatus };
