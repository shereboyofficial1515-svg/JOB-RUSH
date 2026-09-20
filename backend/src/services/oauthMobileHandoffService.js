const crypto = require('crypto');
const { query } = require('../config/db');

const HANDOFF_TTL_MS = 2 * 60 * 1000; // 2 minutes — just long enough for the Custom Tab -> app hand-off to happen

/** Issues a one-time code for `userId`, to be redeemed exactly once by consume(). */
async function issue(userId) {
  const code = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + HANDOFF_TTL_MS);
  await query('INSERT INTO oauth_mobile_handoffs (code, user_id, expires_at) VALUES ($1, $2, $3)', [code, userId, expiresAt]);
  return code;
}

/**
 * Redeems a code exactly once: unexpired and not already used ->
 * returns the user id and marks it used in the same statement (so two
 * concurrent redemption attempts can't both succeed). Anything else
 * (unknown code, expired, already used) returns null.
 */
async function consume(code) {
  if (!code) return null;
  const { rows } = await query(
    `UPDATE oauth_mobile_handoffs
        SET used_at = now()
      WHERE code = $1 AND used_at IS NULL AND expires_at > now()
      RETURNING user_id`,
    [code]
  );
  return rows[0]?.user_id || null;
}

module.exports = { issue, consume };
