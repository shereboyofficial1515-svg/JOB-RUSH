const { query } = require('../config/db');

async function blockUser(blockerUserId, blockedUserId) {
  await query(
    `INSERT INTO blocked_users (blocker_user_id, blocked_user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [blockerUserId, blockedUserId]
  );
}

async function unblockUser(blockerUserId, blockedUserId) {
  await query('DELETE FROM blocked_users WHERE blocker_user_id = $1 AND blocked_user_id = $2', [
    blockerUserId,
    blockedUserId,
  ]);
}

/** True if either user has blocked the other — checked before allowing any new messaging. */
async function isBlockedEitherWay(userIdA, userIdB) {
  const { rows } = await query(
    `SELECT 1 FROM blocked_users
      WHERE (blocker_user_id = $1 AND blocked_user_id = $2)
         OR (blocker_user_id = $2 AND blocked_user_id = $1)
      LIMIT 1`,
    [userIdA, userIdB]
  );
  return rows.length > 0;
}

async function listBlocked(userId) {
  const { rows } = await query(
    `SELECT bu.blocked_user_id, u.full_name, bu.created_at
       FROM blocked_users bu JOIN users u ON u.id = bu.blocked_user_id
      WHERE bu.blocker_user_id = $1 ORDER BY bu.created_at DESC`,
    [userId]
  );
  return rows;
}

module.exports = { blockUser, unblockUser, isBlockedEitherWay, listBlocked };
