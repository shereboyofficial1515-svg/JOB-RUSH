const { query, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const conversationService = require('./conversationService');
const blockService = require('./blockService');
const notificationService = require('./notificationService');

const EDIT_WINDOW_MINUTES = 20;

/**
 * Sends a message. Re-checks blocking on every send (not just at
 * conversation creation) — if either party blocks the other after
 * the conversation already exists, sending stops immediately, and
 * there is no client-supplied flag that can bypass this check.
 */
async function sendMessage(conversationId, senderId, { content, messageType = 'text', mediaItems }) {
  await conversationService.assertParticipant(conversationId, senderId);

  const otherUserId = await conversationService.getOtherParticipant(conversationId, senderId);
  if (otherUserId && (await blockService.isBlockedEitherWay(senderId, otherUserId))) {
    throw new AppError('You cannot message this user.', 403, 'BLOCKED');
  }

  if (!content && (!mediaItems || mediaItems.length === 0)) {
    throw new AppError('A message needs text content or at least one attachment.', 400, 'EMPTY_MESSAGE');
  }

  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO messages (conversation_id, sender_id, message_type, content)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [conversationId, senderId, messageType, content || null]
    );
    const message = rows[0];

    for (const item of mediaItems || []) {
      await client.query(
        `INSERT INTO message_media (message_id, media_type, storage_path, file_size)
         VALUES ($1, $2, $3, $4)`,
        [message.id, item.mediaType, item.storagePath, item.fileSize || null]
      );
    }

    await client.query('UPDATE conversations SET last_message_at = now() WHERE id = $1', [conversationId]);

    if (otherUserId) {
      const preview = content ? content.slice(0, 100) : 'Sent an attachment';
      notificationService.notifyUser(otherUserId, 'new_message', {
        title: 'New message',
        body: preview,
        data: { conversationId },
      }).catch(() => {});
    }

    return message;
  });
}

/**
 * Edits a message. The 20-minute window is computed server-side from
 * `created_at` at request time — never from anything the client
 * sends, and never skippable regardless of what the frontend shows.
 */
async function editMessage(messageId, userId, newContent) {
  const { rows } = await query('SELECT * FROM messages WHERE id = $1 AND sender_id = $2', [messageId, userId]);
  const message = rows[0];
  if (!message) throw new AppError('Message not found.', 404, 'NOT_FOUND');
  if (message.deleted_at) throw new AppError('Cannot edit a deleted message.', 400, 'MESSAGE_DELETED');

  const ageMinutes = (Date.now() - new Date(message.created_at).getTime()) / 60000;
  if (ageMinutes > EDIT_WINDOW_MINUTES) {
    throw new AppError(`Messages can only be edited within ${EDIT_WINDOW_MINUTES} minutes of sending.`, 400, 'EDIT_WINDOW_EXPIRED');
  }

  const { rows: updated } = await query(
    `UPDATE messages SET content = $2, is_edited = true, edited_at = now() WHERE id = $1 RETURNING *`,
    [messageId, newContent]
  );
  return updated[0];
}

/** Sender-only soft delete. */
async function deleteMessage(messageId, userId) {
  const { rows } = await query(
    `UPDATE messages SET deleted_at = now(), content = NULL WHERE id = $1 AND sender_id = $2 RETURNING *`,
    [messageId, userId]
  );
  if (rows.length === 0) throw new AppError('Message not found.', 404, 'NOT_FOUND');
  return rows[0];
}

/**
 * Lists messages in a conversation, newest-first internally then
 * reversed for display order. Messages before the caller's own
 * `cleared_before` timestamp (per-participant "clear chat") are
 * excluded — deleted messages are shown as tombstones (content
 * already nulled by deleteMessage) rather than hidden entirely.
 */
async function attachMedia(messages) {
  if (messages.length === 0) return [];
  const ids = messages.map((m) => m.id);
  const { rows: media } = await query('SELECT * FROM message_media WHERE message_id = ANY($1::uuid[])', [ids]);
  const mediaByMessage = media.reduce((acc, m) => {
    (acc[m.message_id] ||= []).push(m);
    return acc;
  }, {});
  return messages.map((m) => ({ ...m, media: mediaByMessage[m.id] || [] }));
}

/**
 * `afterMessageId` is the incremental-polling path — "just what
 * arrived since the last message I already have," ascending order,
 * so the client can append rather than re-fetch-and-rebuild the last
 * 50 on every poll tick. Takes a message ID, not a client-supplied
 * timestamp: comparing the row-value tuple (created_at, id) against
 * that message's OWN stored values (looked up server-side) avoids two
 * real correctness bugs a plain `created_at > $timestamp` cursor has
 * — a JS Date/toISOString() round trip truncates Postgres's
 * microsecond precision to milliseconds (confirmed empirically: it
 * re-included the cursor message itself), and two messages landing in
 * the same millisecond would be ambiguous on timestamp alone. The
 * tuple comparison is exact and gap-free either way.
 *
 * `before` is the older-history/backward-pagination path, unchanged.
 * The two are mutually exclusive; a caller doing infinite-scroll-up
 * never also wants "since my last poll."
 */
async function listMessages(conversationId, userId, { before, afterMessageId, limit = 50 } = {}) {
  const participant = await conversationService.assertParticipant(conversationId, userId);
  const cappedLimit = Math.min(Math.max(limit, 1), 100);

  const params = [conversationId];
  let sql = 'SELECT * FROM messages WHERE conversation_id = $1';

  if (participant.cleared_before) {
    params.push(participant.cleared_before);
    sql += ` AND created_at > $${params.length}`;
  }

  if (afterMessageId) {
    params.push(afterMessageId);
    sql += ` AND (created_at, id) > (SELECT created_at, id FROM messages WHERE id = $${params.length})`;
    params.push(cappedLimit);
    sql += ` ORDER BY created_at ASC LIMIT $${params.length}`;
    const { rows: messages } = await query(sql, params);
    return attachMedia(messages);
  }

  if (before) {
    params.push(before);
    sql += ` AND created_at < $${params.length}`;
  }
  params.push(cappedLimit);
  sql += ` ORDER BY created_at DESC LIMIT $${params.length}`;

  const { rows: messages } = await query(sql, params);
  const withMedia = await attachMedia(messages);
  return withMedia.reverse();
}

async function searchOwnMessages(userId, keyword) {
  const { rows } = await query(
    `SELECT m.* FROM messages m
       JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id
      WHERE cp.user_id = $1 AND m.deleted_at IS NULL AND m.content ILIKE $2
      ORDER BY m.created_at DESC LIMIT 50`,
    [userId, `%${keyword}%`]
  );
  return rows;
}

module.exports = { sendMessage, editMessage, deleteMessage, listMessages, searchOwnMessages, EDIT_WINDOW_MINUTES };
