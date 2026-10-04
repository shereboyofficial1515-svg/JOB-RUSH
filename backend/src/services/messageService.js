const { query, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const conversationService = require('./conversationService');
const blockService = require('./blockService');
const notificationService = require('./notificationService');
const storageService = require('./storageService');
const realtimeHub = require('./realtimeHub');
const logger = require('../utils/logger');
const { sanitizeDisplayFileName } = require('../utils/fileValidation');

const EDIT_WINDOW_MINUTES = 20;
const MAX_PINS_PER_CONVERSATION = 10;
const REPLY_PREVIEW_CHARS = 140;
const MAX_VOICE_SECONDS = 900;

const MEDIA_TYPE_BY_MIME_PREFIX = [
  ['image/', 'image'],
  ['audio/', 'voice_note'],
  ['video/', 'video'],
];
function mediaTypeForMime(mime) {
  for (const [prefix, type] of MEDIA_TYPE_BY_MIME_PREFIX) if (String(mime).startsWith(prefix)) return type;
  return 'document';
}

/** Short alert body for a push/in-app notification. */
function notificationPreview(content, messageType) {
  if (content) return content.slice(0, 100);
  return { image: 'Sent a photo', voice_note: 'Sent a voice message', video: 'Sent a video', document: 'Sent a file' }[messageType] || 'Sent an attachment';
}

/** Looks up the sender's first name so the alert reads "New message from John" rather than a generic title. */
async function notifyNewMessage(recipientUserId, senderId, conversationId, content, messageType) {
  // A conversation the recipient muted never raises an alert (the message
  // still arrives and the unread badge still counts it).
  const { rows: muteRows } = await query(
    'SELECT muted_until FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2',
    [conversationId, recipientUserId]
  );
  const mutedUntil = muteRows[0]?.muted_until;
  if (mutedUntil && new Date(mutedUntil).getTime() > Date.now()) return null;

  const { rows } = await query('SELECT full_name FROM users WHERE id = $1', [senderId]);
  const senderFirstName = rows[0]?.full_name?.split(' ')[0];
  return notificationService.notifyUser(recipientUserId, 'new_message', {
    title: senderFirstName ? `New message from ${senderFirstName}` : 'New message',
    body: notificationPreview(content, messageType),
    data: { conversationId },
  });
}

/**
 * Attaches everything a chat bubble needs to render without further
 * requests: media (with display metadata), the replied-to message preview,
 * and whether the message is pinned. Done as a handful of batched queries
 * for the whole page of messages, never per message.
 */
async function hydrateMessages(messages) {
  if (messages.length === 0) return [];
  const ids = messages.map((m) => m.id);
  const replyIds = [...new Set(messages.map((m) => m.reply_to_message_id).filter(Boolean))];
  const conversationIds = [...new Set(messages.map((m) => m.conversation_id))];

  const [mediaRes, replyRes, pinRes] = await Promise.all([
    query('SELECT * FROM message_media WHERE message_id = ANY($1::uuid[]) ORDER BY created_at', [ids]),
    replyIds.length
      ? query(
        `SELECT r.id, r.sender_id, r.content, r.message_type, r.deleted_at, u.full_name AS sender_name
           FROM messages r JOIN users u ON u.id = r.sender_id
          WHERE r.id = ANY($1::uuid[])`,
        [replyIds]
      )
      : Promise.resolve({ rows: [] }),
    query('SELECT message_id FROM message_pins WHERE conversation_id = ANY($1::uuid[]) AND message_id = ANY($2::uuid[])', [conversationIds, ids]),
  ]);

  const mediaByMessage = mediaRes.rows.reduce((acc, m) => {
    (acc[m.message_id] ||= []).push(m);
    return acc;
  }, {});
  const replyById = Object.fromEntries(replyRes.rows.map((r) => [r.id, {
    id: r.id,
    sender_id: r.sender_id,
    sender_name: r.sender_name,
    message_type: r.message_type,
    deleted: !!r.deleted_at,
    content: r.deleted_at ? null : (r.content || '').slice(0, REPLY_PREVIEW_CHARS) || null,
  }]));
  const pinned = new Set(pinRes.rows.map((r) => r.message_id));

  // Call cards: the facts come from the `calls` row, never from anything stored on the message.
  const callIds = [...new Set(messages.map((m) => m.call_id).filter(Boolean))];
  const callById = {};
  if (callIds.length) {
    const { rows: callRows } = await query(
      `SELECT id, call_type, status, caller_user_id, callee_user_id, duration_seconds, connected_at, started_at, ended_at
         FROM calls WHERE id = ANY($1::uuid[])`,
      [callIds]
    );
    for (const c of callRows) callById[c.id] = c;
  }

  return messages.map((m) => ({
    ...m,
    media: m.deleted_at ? [] : (mediaByMessage[m.id] || []),
    reply_to: m.reply_to_message_id ? (replyById[m.reply_to_message_id] || null) : null,
    is_pinned: pinned.has(m.id),
    call: m.call_id ? (callById[m.call_id] || null) : null,
  }));
}

async function hydrateOne(message) {
  return (await hydrateMessages([message]))[0];
}

/** Both people in a conversation, for realtime fan-out (the sender's own other devices included). */
async function participantIds(conversationId) {
  const { rows } = await query('SELECT user_id FROM conversation_participants WHERE conversation_id = $1', [conversationId]);
  return rows.map((r) => r.user_id);
}

const STORAGE_PATH_PATTERN = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]{2,5}$/i;

/**
 * Turns the client's attachment descriptors into trusted rows.
 *
 * The client says WHICH uploaded object it wants attached; everything that
 * matters is checked or taken from the server's own record of that object:
 *  - the path must live under the sender's own folder (a user can only
 *    attach files they uploaded themselves -- previously any path was
 *    accepted, so another user's private object could be referenced);
 *  - the object must exist, and its MIME type / size come from storage
 *    (set from the server-side content detection at upload), not from the
 *    request, which also decides the media type;
 *  - only display-only metadata (file name, duration, waveform) comes from
 *    the client, and it is sanitised and clamped.
 */
async function resolveMediaItems(senderId, mediaItems) {
  const resolved = [];
  for (const item of mediaItems || []) {
    const path = item.storagePath;
    if (!STORAGE_PATH_PATTERN.test(path) || !path.startsWith(`${senderId}/`)) {
      throw new AppError('Attachment does not belong to you.', 403, 'INVALID_ATTACHMENT');
    }
    if (item.thumbnailPath && (!STORAGE_PATH_PATTERN.test(item.thumbnailPath) || !item.thumbnailPath.startsWith(`${senderId}/`))) {
      throw new AppError('Attachment preview does not belong to you.', 403, 'INVALID_ATTACHMENT');
    }
    const meta = await storageService.getObjectMetadata('CHAT_MEDIA', path);
    if (!meta) throw new AppError('Attachment was not found. Upload it again.', 400, 'ATTACHMENT_NOT_FOUND');

    const mediaType = mediaTypeForMime(meta.mimeType);
    resolved.push({
      mediaType,
      storagePath: path,
      thumbnailPath: item.thumbnailPath || null,
      fileSize: meta.size,
      mimeType: meta.mimeType,
      fileName: sanitizeDisplayFileName(item.fileName),
      durationSeconds: mediaType === 'voice_note' && Number.isFinite(item.durationSeconds)
        ? Math.min(Math.max(Math.round(item.durationSeconds), 0), MAX_VOICE_SECONDS) : null,
      waveform: mediaType === 'voice_note' && Array.isArray(item.waveform)
        ? item.waveform.slice(0, 80).map((v) => Math.min(Math.max(Math.round(Number(v) || 0), 0), 100)) : null,
      width: Number.isInteger(item.width) && item.width > 0 && item.width <= 20000 ? item.width : null,
      height: Number.isInteger(item.height) && item.height > 0 && item.height <= 20000 ? item.height : null,
    });
  }
  return resolved;
}

/**
 * Sends a message. Re-checks blocking on every send (not just at
 * conversation creation) — if either party blocks the other after
 * the conversation already exists, sending stops immediately, and
 * there is no client-supplied flag that can bypass this check.
 *
 * `clientMessageId` makes the call idempotent: a retry of the same send
 * (flaky connection, double tap, resend after "Not sent") returns the
 * message that was already stored instead of creating a duplicate.
 */
async function sendMessage(conversationId, senderId, { content, mediaItems, replyToMessageId, clientMessageId }) {
  await conversationService.assertParticipant(conversationId, senderId);

  const otherUserId = await conversationService.getOtherParticipant(conversationId, senderId);
  if (otherUserId && (await blockService.isBlockedEitherWay(senderId, otherUserId))) {
    throw new AppError('You cannot message this user.', 403, 'BLOCKED');
  }

  if (!content && (!mediaItems || mediaItems.length === 0)) {
    throw new AppError('A message needs text content or at least one attachment.', 400, 'EMPTY_MESSAGE');
  }

  if (clientMessageId) {
    const { rows: existing } = await query('SELECT * FROM messages WHERE sender_id = $1 AND client_message_id = $2', [senderId, clientMessageId]);
    if (existing.length > 0) return hydrateOne(existing[0]);
  }

  if (replyToMessageId) {
    const { rows } = await query('SELECT 1 FROM messages WHERE id = $1 AND conversation_id = $2', [replyToMessageId, conversationId]);
    if (rows.length === 0) throw new AppError('The message you are replying to was not found.', 400, 'REPLY_TARGET_NOT_FOUND');
  }

  const media = await resolveMediaItems(senderId, mediaItems);
  if (media.some((m) => m.mediaType === 'voice_note') && media.length > 1) {
    throw new AppError('A voice message is sent on its own.', 400, 'INVALID_ATTACHMENT');
  }
  const messageType = media[0]?.mediaType || 'text';

  const message = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO messages (conversation_id, sender_id, message_type, content, reply_to_message_id, client_message_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (sender_id, client_message_id) WHERE client_message_id IS NOT NULL DO NOTHING
       RETURNING *`,
      [conversationId, senderId, messageType, content || null, replyToMessageId || null, clientMessageId || null]
    );
    if (rows.length === 0) return null; // lost a race with an identical retry

    for (const item of media) {
      await client.query(
        `INSERT INTO message_media (message_id, media_type, storage_path, file_size, file_name, mime_type, duration_seconds, waveform, width, height, thumbnail_path)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [rows[0].id, item.mediaType, item.storagePath, item.fileSize, item.fileName, item.mimeType, item.durationSeconds,
          item.waveform ? JSON.stringify(item.waveform) : null, item.width, item.height, item.thumbnailPath]
      );
    }
    await client.query('UPDATE conversations SET last_message_at = now() WHERE id = $1', [conversationId]);
    return rows[0];
  });

  if (!message) {
    const { rows } = await query('SELECT * FROM messages WHERE sender_id = $1 AND client_message_id = $2', [senderId, clientMessageId]);
    return hydrateOne(rows[0]);
  }

  const hydrated = await hydrateOne(message);

  // Realtime fan-out to both people (the sender's other devices included).
  realtimeHub.publish([senderId, otherUserId], 'message.new', { conversationId, message: hydrated });

  if (otherUserId) {
    notifyNewMessage(otherUserId, senderId, conversationId, content, messageType).catch((err) => logger.warn('New-message notification failed', { error: err.message }));
  }
  return hydrated;
}

async function loadOwnMessage(messageId, userId) {
  const { rows } = await query('SELECT * FROM messages WHERE id = $1 AND sender_id = $2', [messageId, userId]);
  if (!rows[0]) throw new AppError('Message not found.', 404, 'NOT_FOUND');
  return rows[0];
}

/** A message the user can see (they are in its conversation). */
async function loadVisibleMessage(messageId, userId) {
  const { rows } = await query(
    `SELECT m.* FROM messages m
       JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id AND cp.user_id = $2
      WHERE m.id = $1`,
    [messageId, userId]
  );
  if (!rows[0]) throw new AppError('Message not found.', 404, 'NOT_FOUND');
  return rows[0];
}

/**
 * Edits a message. The 20-minute window is computed server-side from
 * `created_at` at request time — never from anything the client
 * sends, and never skippable regardless of what the frontend shows.
 * Only messages that carry text can be edited (a pure voice note or photo
 * has nothing to edit).
 */
async function editMessage(messageId, userId, newContent) {
  const message = await loadOwnMessage(messageId, userId);
  if (message.deleted_at) throw new AppError('Cannot edit a deleted message.', 400, 'MESSAGE_DELETED');
  if (message.message_type === 'voice_note' || (message.message_type !== 'text' && !message.content)) {
    throw new AppError('This message has no text to edit.', 400, 'NOT_EDITABLE');
  }

  const ageMinutes = (Date.now() - new Date(message.created_at).getTime()) / 60000;
  if (ageMinutes > EDIT_WINDOW_MINUTES) {
    throw new AppError(`Messages can only be edited within ${EDIT_WINDOW_MINUTES} minutes of sending.`, 400, 'EDIT_WINDOW_EXPIRED');
  }

  const { rows: updated } = await query(
    `UPDATE messages SET content = $2, is_edited = true, edited_at = now() WHERE id = $1 RETURNING *`,
    [messageId, newContent]
  );
  const hydrated = await hydrateOne(updated[0]);
  realtimeHub.publish(await participantIds(message.conversation_id), 'message.updated', { conversationId: message.conversation_id, message: hydrated });
  return hydrated;
}

/**
 * Two kinds of delete, matching what people expect:
 *  - scope 'everyone' (sender only): the message becomes a tombstone for
 *    both people, its text is erased, its pins are dropped and its files
 *    are removed from private storage;
 *  - scope 'me' (either participant): the message disappears from this
 *    person's view only; the other person's copy is untouched.
 */
async function deleteMessage(messageId, userId, scope = 'everyone') {
  if (scope === 'me') {
    const message = await loadVisibleMessage(messageId, userId);
    await query('INSERT INTO message_hidden (user_id, message_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, messageId]);
    realtimeHub.publish([userId], 'message.hidden', { conversationId: message.conversation_id, messageId });
    return { id: messageId, hidden: true };
  }

  await loadOwnMessage(messageId, userId);
  const { rows: media } = await query('SELECT storage_path, thumbnail_path FROM message_media WHERE message_id = $1', [messageId]);
  const { rows } = await query(
    `UPDATE messages SET deleted_at = now(), content = NULL WHERE id = $1 AND sender_id = $2 RETURNING *`,
    [messageId, userId]
  );
  await query('DELETE FROM message_pins WHERE message_id = $1', [messageId]);
  const paths = media.flatMap((m) => [m.storage_path, m.thumbnail_path]).filter(Boolean);
  if (paths.length) storageService.removeObjects('CHAT_MEDIA', paths).catch((err) => logger.warn('Chat media cleanup failed', { error: err.message }));

  const hydrated = await hydrateOne(rows[0]);
  realtimeHub.publish(await participantIds(rows[0].conversation_id), 'message.deleted', { conversationId: rows[0].conversation_id, message: hydrated });
  return hydrated;
}

/** Pins a message for everyone in the conversation (max 10, like most messengers cap it). */
async function pinMessage(messageId, userId) {
  const message = await loadVisibleMessage(messageId, userId);
  if (message.deleted_at) throw new AppError('Deleted messages cannot be pinned.', 400, 'MESSAGE_DELETED');
  const { rows: count } = await query('SELECT COUNT(*)::int AS n FROM message_pins WHERE conversation_id = $1', [message.conversation_id]);
  if (count[0].n >= MAX_PINS_PER_CONVERSATION) {
    throw new AppError(`You can pin up to ${MAX_PINS_PER_CONVERSATION} messages. Unpin one first.`, 400, 'PIN_LIMIT');
  }
  await query(
    'INSERT INTO message_pins (conversation_id, message_id, pinned_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
    [message.conversation_id, messageId, userId]
  );
  realtimeHub.publish(await participantIds(message.conversation_id), 'message.pinned', { conversationId: message.conversation_id, messageId, pinned: true });
  return { id: messageId, is_pinned: true };
}

async function unpinMessage(messageId, userId) {
  const message = await loadVisibleMessage(messageId, userId);
  await query('DELETE FROM message_pins WHERE message_id = $1', [messageId]);
  realtimeHub.publish(await participantIds(message.conversation_id), 'message.pinned', { conversationId: message.conversation_id, messageId, pinned: false });
  return { id: messageId, is_pinned: false };
}

async function listPinned(conversationId, userId) {
  const participant = await conversationService.assertParticipant(conversationId, userId);
  const params = [conversationId, userId];
  let clear = '';
  if (participant.cleared_before) {
    params.push(participant.cleared_before);
    clear = ` AND m.created_at > $${params.length}`;
  }
  const { rows } = await query(
    `SELECT m.* FROM message_pins p JOIN messages m ON m.id = p.message_id
      WHERE p.conversation_id = $1 AND m.deleted_at IS NULL${clear}
        AND NOT EXISTS (SELECT 1 FROM message_hidden h WHERE h.message_id = m.id AND h.user_id = $2)
      ORDER BY p.pinned_at DESC`,
    params
  );
  return hydrateMessages(rows);
}

/**
 * Pagination, newest page first, in three shapes:
 *  - default / `beforeMessageId`: the page of messages older than a cursor
 *    message (infinite scroll upward). The cursor is a message ID compared
 *    as a (created_at, id) tuple against that message's own stored values:
 *    a client-supplied timestamp round-trips through a JS Date, which
 *    truncates Postgres's microsecond precision to milliseconds and could
 *    silently skip messages sent within the same millisecond;
 *  - `afterMessageId`: what arrived since the last message the client has
 *    (catch-up after reconnect, and the polling safety net), ascending;
 *  - `aroundMessageId`: a window centred on one message (jump to a reply
 *    target, a search hit or a pinned message that is not loaded yet).
 * `before` (a timestamp) is still accepted for older callers.
 *
 * Messages before the caller's own `cleared_before` ("clear chat") and
 * messages they deleted for themselves are excluded; messages deleted for
 * everyone come back as tombstones.
 */
async function listMessages(conversationId, userId, { before, beforeMessageId, afterMessageId, aroundMessageId, limit = 50 } = {}) {
  const participant = await conversationService.assertParticipant(conversationId, userId);
  const cappedLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);

  const params = [conversationId, userId];
  let base = `SELECT m.* FROM messages m
     WHERE m.conversation_id = $1
       AND NOT EXISTS (SELECT 1 FROM message_hidden h WHERE h.message_id = m.id AND h.user_id = $2)`;

  if (participant.cleared_before) {
    params.push(participant.cleared_before);
    base += ` AND m.created_at > $${params.length}`;
  }

  if (aroundMessageId) {
    const half = Math.floor(cappedLimit / 2);
    params.push(aroundMessageId);
    const idx = params.length;
    const olderSql = `${base} AND (m.created_at, m.id) <= (SELECT created_at, id FROM messages WHERE id = $${idx}) ORDER BY m.created_at DESC, m.id DESC LIMIT ${half + 1}`;
    const newerSql = `${base} AND (m.created_at, m.id) > (SELECT created_at, id FROM messages WHERE id = $${idx}) ORDER BY m.created_at ASC, m.id ASC LIMIT ${half}`;
    const [older, newer] = await Promise.all([query(olderSql, params), query(newerSql, params)]);
    return hydrateMessages([...older.rows.reverse(), ...newer.rows]);
  }

  if (afterMessageId) {
    params.push(afterMessageId);
    base += ` AND (m.created_at, m.id) > (SELECT created_at, id FROM messages WHERE id = $${params.length})`;
    params.push(cappedLimit);
    const { rows } = await query(`${base} ORDER BY m.created_at ASC, m.id ASC LIMIT $${params.length}`, params);
    return hydrateMessages(rows);
  }

  if (beforeMessageId) {
    params.push(beforeMessageId);
    base += ` AND (m.created_at, m.id) < (SELECT created_at, id FROM messages WHERE id = $${params.length})`;
  } else if (before) {
    params.push(before);
    base += ` AND m.created_at < $${params.length}`;
  }
  params.push(cappedLimit);
  const { rows } = await query(`${base} ORDER BY m.created_at DESC, m.id DESC LIMIT $${params.length}`, params);
  return (await hydrateMessages(rows)).reverse();
}

/** Search inside ONE conversation (text and attachment file names). */
async function searchConversation(conversationId, userId, keyword) {
  const participant = await conversationService.assertParticipant(conversationId, userId);
  const term = String(keyword || '').trim();
  if (term.length < 2) return [];
  const escaped = term.replace(/[\\%_]/g, (c) => `\\${c}`);
  const params = [conversationId, userId, `%${escaped}%`];
  let clear = '';
  if (participant.cleared_before) {
    params.push(participant.cleared_before);
    clear = ` AND m.created_at > $${params.length}`;
  }
  const { rows } = await query(
    `SELECT m.* FROM messages m
      WHERE m.conversation_id = $1 AND m.deleted_at IS NULL${clear}
        AND NOT EXISTS (SELECT 1 FROM message_hidden h WHERE h.message_id = m.id AND h.user_id = $2)
        AND (m.content ILIKE $3 OR EXISTS (SELECT 1 FROM message_media mm WHERE mm.message_id = m.id AND mm.file_name ILIKE $3))
      ORDER BY m.created_at DESC, m.id DESC LIMIT 30`,
    params
  );
  return hydrateMessages(rows);
}

/**
 * Everything shared in one conversation, newest first, for the chat's
 * "Media & files" view. `kind` is 'image' | 'document' | 'voice_note'.
 * Respects the caller's cleared history, hidden messages and deleted ones.
 */
async function listConversationMedia(conversationId, userId, { kind = 'image', beforeMessageId, limit = 60 } = {}) {
  const participant = await conversationService.assertParticipant(conversationId, userId);
  if (!['image', 'document', 'voice_note'].includes(kind)) throw new AppError('Unsupported media kind.', 400, 'INVALID_KIND');
  const params = [conversationId, userId, kind];
  let sql = `SELECT mm.*, m.sender_id, m.created_at AS message_created_at
               FROM message_media mm JOIN messages m ON m.id = mm.message_id
              WHERE m.conversation_id = $1 AND m.deleted_at IS NULL AND mm.media_type = $3
                AND NOT EXISTS (SELECT 1 FROM message_hidden h WHERE h.message_id = m.id AND h.user_id = $2)`;
  if (participant.cleared_before) {
    params.push(participant.cleared_before);
    sql += ` AND m.created_at > $${params.length}`;
  }
  if (beforeMessageId) {
    params.push(beforeMessageId);
    sql += ` AND (m.created_at, m.id) < (SELECT created_at, id FROM messages WHERE id = $${params.length})`;
  }
  params.push(Math.min(Math.max(Number(limit) || 60, 1), 100));
  sql += ` ORDER BY m.created_at DESC, m.id DESC LIMIT $${params.length}`;
  const { rows } = await query(sql, params);
  return rows;
}

async function searchOwnMessages(userId, keyword) {
  const { rows } = await query(
    `SELECT m.* FROM messages m
       JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id
      WHERE cp.user_id = $1 AND m.deleted_at IS NULL AND m.content ILIKE $2
        AND (cp.cleared_before IS NULL OR m.created_at > cp.cleared_before)
        AND NOT EXISTS (SELECT 1 FROM message_hidden h WHERE h.message_id = m.id AND h.user_id = $1)
      ORDER BY m.created_at DESC LIMIT 50`,
    [userId, `%${String(keyword).replace(/[\\%_]/g, (c) => `\\${c}`)}%`]
  );
  return rows;
}

module.exports = {
  sendMessage,
  editMessage,
  deleteMessage,
  pinMessage,
  unpinMessage,
  listPinned,
  listMessages,
  searchConversation,
  listConversationMedia,
  searchOwnMessages,
  hydrateMessages,
  EDIT_WINDOW_MINUTES,
  MAX_PINS_PER_CONVERSATION,
};
