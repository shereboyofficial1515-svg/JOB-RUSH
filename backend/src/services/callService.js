const { query } = require('../config/db');
const AppError = require('../utils/AppError');
const conversationService = require('./conversationService');
const blockService = require('./blockService');
const livekitService = require('./livekitService');

const TRANSITIONS = {
  calling: ['ringing', 'busy', 'declined', 'missed', 'ended'],
  ringing: ['connecting', 'declined', 'missed', 'ended'],
  connecting: ['connected', 'ended'],
  connected: ['reconnecting', 'ended'],
  reconnecting: ['connected', 'ended'],
};

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
  return rows[0];
}

async function updateCallStatus(callId, userId, newStatus) {
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
  if (['ended', 'declined', 'missed', 'busy'].includes(newStatus)) {
    fields.push('ended_at = now()');
    if (call.connected_at) {
      fields.push(`duration_seconds = EXTRACT(EPOCH FROM (now() - connected_at))::int`);
    }
  }

  const { rows } = await query(`UPDATE calls SET ${fields.join(', ')} WHERE id = $1 RETURNING *`, params);
  return rows[0];
}

/**
 * Security gate for issuing a LiveKit token, mirroring
 * interviewController.getCallToken exactly: participant check, then
 * status check — only 'ringing', 'connecting', or 'connected' allow
 * joining. No timing window here (calls are real-time, not
 * scheduled), but the same "verify first, sign second" order applies.
 */
async function getCallToken(callId, userId, displayName) {
  const call = await assertCallParticipant(callId, userId);
  if (!['ringing', 'connecting', 'connected'].includes(call.status)) {
    throw new AppError(`Cannot join a call with status "${call.status}".`, 400, 'NOT_JOINABLE');
  }
  return livekitService.createCallAccessToken({ callId, userId, displayName });
}

async function listCallsForConversation(conversationId, userId) {
  await conversationService.assertParticipant(conversationId, userId);
  const { rows } = await query('SELECT * FROM calls WHERE conversation_id = $1 ORDER BY started_at DESC', [
    conversationId,
  ]);
  return rows;
}

module.exports = { initiateCall, updateCallStatus, getCallToken, listCallsForConversation };
