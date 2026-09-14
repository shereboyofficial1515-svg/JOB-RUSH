const { query, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const blockService = require('./blockService');

/**
 * Loads a conversation and verifies the given user is a participant
 * — this is the authorization source for every conversation/message
 * operation, checked fresh on every call.
 */
async function assertParticipant(conversationId, userId) {
  const { rows } = await query(
    `SELECT c.*, cp.last_read_at, cp.cleared_before
       FROM conversations c
       JOIN conversation_participants cp ON cp.conversation_id = c.id
      WHERE c.id = $1 AND cp.user_id = $2`,
    [conversationId, userId]
  );
  if (rows.length === 0) throw new AppError('Conversation not found.', 404, 'NOT_FOUND');
  return rows[0];
}

async function getOtherParticipant(conversationId, userId) {
  const { rows } = await query(
    `SELECT user_id FROM conversation_participants WHERE conversation_id = $1 AND user_id != $2`,
    [conversationId, userId]
  );
  return rows[0]?.user_id || null;
}

/**
 * Finds an existing 1-to-1 conversation between two users, or creates
 * one. Refuses if either has blocked the other — a block prevents a
 * *new* conversation from forming, and messageService separately
 * re-checks blocks before every send so an existing conversation
 * can't be used to route around a block either.
 */
async function getOrCreateConversation(userIdA, userIdB, jobId) {
  if (userIdA === userIdB) {
    throw new AppError('Cannot start a conversation with yourself.', 400, 'INVALID_PARTICIPANTS');
  }
  if (await blockService.isBlockedEitherWay(userIdA, userIdB)) {
    throw new AppError('You cannot message this user.', 403, 'BLOCKED');
  }

  const { rows: existing } = await query(
    `SELECT c.* FROM conversations c
      WHERE EXISTS (SELECT 1 FROM conversation_participants WHERE conversation_id = c.id AND user_id = $1)
        AND EXISTS (SELECT 1 FROM conversation_participants WHERE conversation_id = c.id AND user_id = $2)
      LIMIT 1`,
    [userIdA, userIdB]
  );
  if (existing.length > 0) return existing[0];

  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO conversations (job_id) VALUES ($1) RETURNING *`,
      [jobId || null]
    );
    const conversation = rows[0];
    await client.query(
      `INSERT INTO conversation_participants (conversation_id, user_id) VALUES ($1,$2), ($1,$3)`,
      [conversation.id, userIdA, userIdB]
    );
    return conversation;
  });
}

async function listConversationsForUser(userId) {
  const { rows } = await query(
    `SELECT c.*, cp.last_read_at,
            (SELECT m.content FROM messages m WHERE m.conversation_id = c.id AND m.deleted_at IS NULL ORDER BY m.created_at DESC LIMIT 1) AS last_message_preview,
            (SELECT COUNT(*) FROM messages m2
               WHERE m2.conversation_id = c.id AND m2.sender_id != $1 AND m2.deleted_at IS NULL
                 AND (cp.last_read_at IS NULL OR m2.created_at > cp.last_read_at)
            )::int AS unread_count
       FROM conversations c
       JOIN conversation_participants cp ON cp.conversation_id = c.id
      WHERE cp.user_id = $1
      ORDER BY c.last_message_at DESC NULLS LAST`,
    [userId]
  );
  return rows;
}

async function markRead(conversationId, userId) {
  await assertParticipant(conversationId, userId);
  await query('UPDATE conversation_participants SET last_read_at = now() WHERE conversation_id = $1 AND user_id = $2', [
    conversationId,
    userId,
  ]);
}

/** Per-participant "clear chat" — hides prior history for this user only. */
async function clearChat(conversationId, userId) {
  await assertParticipant(conversationId, userId);
  await query(
    'UPDATE conversation_participants SET cleared_before = now() WHERE conversation_id = $1 AND user_id = $2',
    [conversationId, userId]
  );
}

module.exports = {
  assertParticipant,
  getOtherParticipant,
  getOrCreateConversation,
  listConversationsForUser,
  markRead,
  clearChat,
};
