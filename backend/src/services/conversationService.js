const { query, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const blockService = require('./blockService');
const realtimeHub = require('./realtimeHub');

/**
 * "Connection" for the purposes of the connections_only messaging
 * permission: the two people have an existing application (in either
 * direction — worker applied, or hirer invited) on a job, or an
 * existing contract together. There's no separate "follow"/"connect"
 * feature in this app to point at, so this is defined from the real
 * relationships that already exist rather than inventing a new one.
 */
async function haveExistingRelationship(userIdA, userIdB) {
  const { rows } = await query(
    `SELECT 1
       FROM applications a
       JOIN jobs j ON j.id = a.job_id
      WHERE (j.hirer_user_id = $1 AND a.worker_user_id = $2)
         OR (j.hirer_user_id = $2 AND a.worker_user_id = $1)
      UNION
     SELECT 1 FROM contracts c
      WHERE (c.hirer_user_id = $1 AND c.worker_user_id = $2)
         OR (c.hirer_user_id = $2 AND c.worker_user_id = $1)
      LIMIT 1`,
    [userIdA, userIdB]
  );
  return rows.length > 0;
}

/**
 * Checks the *recipient's* messaging_permission before a new
 * conversation is created. 'everyone' behaves as before; 'no_one'
 * refuses any new conversation; 'connections_only' requires an
 * existing application/contract relationship. This only gates
 * *starting* a conversation — it never affects one that already
 * exists, the same scoping as the block check right below it.
 */
async function assertMessagingAllowed(senderUserId, recipientUserId) {
  const { rows } = await query(
    `SELECT COALESCE(us.messaging_permission, 'everyone') AS messaging_permission
       FROM user_settings us WHERE us.user_id = $1`,
    [recipientUserId]
  );
  const permission = rows[0]?.messaging_permission || 'everyone';

  if (permission === 'no_one') {
    throw new AppError('This user is not accepting new messages.', 403, 'MESSAGING_NOT_ALLOWED');
  }
  if (permission === 'connections_only') {
    const connected = await haveExistingRelationship(senderUserId, recipientUserId);
    if (!connected) {
      throw new AppError(
        'This user only accepts messages from people they have an existing job or application with.',
        403,
        'MESSAGING_NOT_ALLOWED'
      );
    }
  }
}

/**
 * Loads a conversation and verifies the given user is a participant
 * — this is the authorization source for every conversation/message
 * operation, checked fresh on every call.
 */
async function assertParticipant(conversationId, userId) {
  const { rows } = await query(
    `SELECT c.*, cp.last_read_at, cp.cleared_before, cp.muted_until, cp.archived_at
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

  await assertMessagingAllowed(userIdA, userIdB);

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

/**
 * `archived` filters the list: false (default) is the normal inbox
 * and excludes archived chats, true returns only the archived ones —
 * mirroring how the Chat Settings "Archived chats" screen and the
 * main conversation list both read from the same endpoint.
 */
/**
 * The conversation list used to return nothing about who was on the
 * other end — no name, no picture — so every row rendered as the
 * literal word "Conversation" client-side. `other` here is always the
 * one other participant (these are 1-to-1 conversations only), joined
 * through to `users` for the name and to whichever profile table
 * (worker or hirer) actually has their picture.
 */
async function listConversationsForUser(userId, { archived = false } = {}) {
  const { rows } = await query(
    `SELECT c.*, cp.last_read_at, cp.archived_at, cp.muted_until,
            (cp.muted_until IS NOT NULL AND cp.muted_until > now()) AS is_muted,
            other.last_read_at AS other_last_read_at,
            CASE WHEN lm.id IS NULL THEN NULL
                 ELSE COALESCE(NULLIF(lm.content, ''),
                      CASE lm.message_type WHEN 'image' THEN 'Photo' WHEN 'voice_note' THEN 'Voice message'
                                           WHEN 'document' THEN 'File' WHEN 'video' THEN 'Video'
                                           WHEN 'call' THEN 'Call' END)
            END AS last_message_preview,
            lm.message_type AS last_message_type,
            lm.sender_id AS last_message_sender_id,
            lm.created_at AS last_message_created_at,
            (SELECT COUNT(*) FROM messages m2
               WHERE m2.conversation_id = c.id AND m2.sender_id != $1 AND m2.deleted_at IS NULL
                 AND (cp.last_read_at IS NULL OR m2.created_at > cp.last_read_at)
                 AND (cp.cleared_before IS NULL OR m2.created_at > cp.cleared_before)
                 AND NOT EXISTS (SELECT 1 FROM message_hidden h WHERE h.message_id = m2.id AND h.user_id = $1)
            )::int AS unread_count,
            other_user.id AS other_user_id,
            other_user.full_name AS other_full_name,
            other_user.role AS other_role,
            COALESCE(owp.profile_picture_url, ohp.profile_picture_url) AS other_profile_picture_url,
            (owp.verification_status = 'approved') AS other_is_verified,
            COALESCE(owp.is_pro, false) AS other_is_pro
       FROM conversations c
       JOIN conversation_participants cp ON cp.conversation_id = c.id
       JOIN conversation_participants other ON other.conversation_id = c.id AND other.user_id != $1
       JOIN users other_user ON other_user.id = other.user_id
       LEFT JOIN worker_profiles owp ON owp.user_id = other.user_id
       LEFT JOIN hirer_profiles ohp ON ohp.user_id = other.user_id
       LEFT JOIN LATERAL (
         SELECT m.id, m.content, m.message_type, m.sender_id, m.created_at
           FROM messages m
          WHERE m.conversation_id = c.id AND m.deleted_at IS NULL
            AND (cp.cleared_before IS NULL OR m.created_at > cp.cleared_before)
            AND NOT EXISTS (SELECT 1 FROM message_hidden h WHERE h.message_id = m.id AND h.user_id = $1)
          ORDER BY m.created_at DESC, m.id DESC LIMIT 1
       ) lm ON true
      WHERE cp.user_id = $1 AND cp.archived_at IS ${archived ? 'NOT NULL' : 'NULL'}
      ORDER BY c.last_message_at DESC NULLS LAST`,
    [userId]
  );
  return rows;
}

/**
 * One conversation's header data: who the other person is, their badges,
 * whether they are online right now, plus this user's own mute/block
 * state. Online = an open realtime stream, or any authenticated request
 * in the last two minutes (sessions.last_seen_at, which is throttled to
 * one write a minute). Only "online / offline" is exposed -- there is no
 * per-user "hide last seen" setting, so exact last-seen times are not
 * shared.
 */
async function getConversationDetail(conversationId, userId) {
  const participant = await assertParticipant(conversationId, userId);
  const { rows } = await query(
    `SELECT other_user.id AS user_id, other_user.full_name, other_user.role,
            COALESCE(owp.profile_picture_url, ohp.profile_picture_url) AS profile_picture_url,
            owp.professional_title,
            (owp.verification_status = 'approved') AS is_verified,
            COALESCE(owp.is_pro, false) AS is_pro,
            other.last_read_at AS other_last_read_at,
            (SELECT MAX(s.last_seen_at) FROM sessions s WHERE s.user_id = other_user.id AND s.revoked_at IS NULL AND s.expires_at > now()) AS last_active_at,
            EXISTS (SELECT 1 FROM blocked_users b WHERE b.blocker_user_id = $2 AND b.blocked_user_id = other_user.id) AS blocked_by_me,
            EXISTS (SELECT 1 FROM blocked_users b WHERE b.blocker_user_id = other_user.id AND b.blocked_user_id = $2) AS blocked_me
       FROM conversation_participants other
       JOIN users other_user ON other_user.id = other.user_id
       LEFT JOIN worker_profiles owp ON owp.user_id = other.user_id
       LEFT JOIN hirer_profiles ohp ON ohp.user_id = other.user_id
      WHERE other.conversation_id = $1 AND other.user_id != $2`,
    [conversationId, userId]
  );
  const other = rows[0];
  if (!other) throw new AppError('Conversation not found.', 404, 'NOT_FOUND');

  const recentlyActive = other.last_active_at && Date.now() - new Date(other.last_active_at).getTime() < 2 * 60 * 1000;
  const online = !other.blocked_me && !other.blocked_by_me && (realtimeHub.isOnline(other.user_id) || !!recentlyActive);
  const mutedUntil = participant.muted_until && new Date(participant.muted_until).getTime() > Date.now() ? participant.muted_until : null;

  return {
    id: conversationId,
    other: {
      user_id: other.user_id,
      full_name: other.full_name,
      role: other.role,
      profile_picture_url: other.profile_picture_url,
      professional_title: other.professional_title,
      is_verified: !!other.is_verified,
      is_pro: other.is_pro,
      online,
    },
    other_last_read_at: other.other_last_read_at,
    blocked_by_me: other.blocked_by_me,
    blocked_me: other.blocked_me,
    muted_until: mutedUntil,
    archived: !!participant.archived_at,
  };
}

const MUTE_PRESETS = { '8h': 8 * 3600e3, '1w': 7 * 24 * 3600e3, forever: null };

/** Mutes (or unmutes, with `duration: null`) new-message alerts for this participant only. */
async function setMuted(conversationId, userId, duration) {
  await assertParticipant(conversationId, userId);
  let until = null;
  if (duration) {
    if (!(duration in MUTE_PRESETS)) throw new AppError('Unsupported mute duration.', 400, 'INVALID_DURATION');
    until = MUTE_PRESETS[duration] === null ? new Date('9999-12-31T00:00:00Z') : new Date(Date.now() + MUTE_PRESETS[duration]);
  }
  await query('UPDATE conversation_participants SET muted_until = $3 WHERE conversation_id = $1 AND user_id = $2', [conversationId, userId, until]);
  return { muted_until: until };
}

/**
 * Total unread incoming messages across the user's non-archived chats
 * — the same per-conversation rule listConversationsForUser applies
 * (not sent by them, not deleted, newer than their last_read_at),
 * summed in one query so a nav badge doesn't have to fetch every
 * conversation just to add up a number.
 */
async function countUnreadForUser(userId) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS count
       FROM messages m
       JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id AND cp.user_id = $1
      WHERE cp.archived_at IS NULL
        AND m.sender_id != $1
        AND m.deleted_at IS NULL
        AND (cp.last_read_at IS NULL OR m.created_at > cp.last_read_at)
        AND (cp.cleared_before IS NULL OR m.created_at > cp.cleared_before)
        AND NOT EXISTS (SELECT 1 FROM message_hidden h WHERE h.message_id = m.id AND h.user_id = $1)`,
    [userId]
  );
  return rows[0].count;
}

/** Archives/unarchives a conversation for this participant only. */
async function setArchived(conversationId, userId, archived) {
  await assertParticipant(conversationId, userId);
  await query(
    `UPDATE conversation_participants SET archived_at = $3 WHERE conversation_id = $1 AND user_id = $2`,
    [conversationId, userId, archived ? new Date() : null]
  );
}

async function markRead(conversationId, userId) {
  await assertParticipant(conversationId, userId);
  const { rows } = await query(
    'UPDATE conversation_participants SET last_read_at = now() WHERE conversation_id = $1 AND user_id = $2 RETURNING last_read_at',
    [conversationId, userId]
  );
  // Read receipt: the other person's open chat flips its ticks immediately.
  const otherUserId = await getOtherParticipant(conversationId, userId);
  realtimeHub.publish([otherUserId, userId], 'conversation.read', { conversationId, userId, readAt: rows[0].last_read_at });
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
  countUnreadForUser,
  markRead,
  clearChat,
  setArchived,
  getConversationDetail,
  setMuted,
};
