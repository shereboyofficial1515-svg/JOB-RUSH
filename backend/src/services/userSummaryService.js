const { query } = require('../config/db');

/**
 * Minimal public-safe summary for "who you're calling" in the call
 * UI -- name, avatar, and (for workers) their professional title.
 * Mirrors the same join conversationService.listConversationsForUser
 * already uses to resolve a chat participant's picture, so the call
 * screen shows the same identity a user already sees in Messages.
 */
async function getCallDisplaySummary(userId) {
  const { rows } = await query(
    `SELECT u.id, u.full_name AS "fullName", u.role,
            COALESCE(wp.profile_picture_url, hp.profile_picture_url) AS "profilePictureUrl",
            wp.professional_title AS "professionalTitle"
       FROM users u
       LEFT JOIN worker_profiles wp ON wp.user_id = u.id
       LEFT JOIN hirer_profiles hp ON hp.user_id = u.id
      WHERE u.id = $1`,
    [userId]
  );
  return rows[0] || null;
}

module.exports = { getCallDisplaySummary };
