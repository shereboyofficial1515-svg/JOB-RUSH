const { query } = require('../config/db');
const env = require('../config/env');
const { generateOpaqueToken, sha256Hex } = require('../utils/tokenUtils');

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax',
  domain: env.NODE_ENV === 'production' ? env.COOKIE_DOMAIN : undefined,
  path: '/',
};

/**
 * Creates a new server-side session row and returns the raw token to
 * set as a cookie. Only the hash is ever persisted.
 */
async function createSession({ userId, ipAddress, userAgent }) {
  const rawToken = generateOpaqueToken(48);
  const tokenHash = sha256Hex(rawToken);
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_MINUTES * 60 * 1000);

  const { rows } = await query(
    `INSERT INTO sessions (user_id, token_hash, ip_address, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [userId, tokenHash, ipAddress, userAgent, expiresAt]
  );

  return { rawToken, sessionId: rows[0].id, expiresAt };
}

/**
 * Looks up an active, unexpired, unrevoked session by its raw cookie
 * token. Returns null (never throws) so callers can uniformly treat
 * "no session" as unauthenticated.
 */
async function getActiveSessionByToken(rawToken) {
  if (!rawToken) return null;
  const tokenHash = sha256Hex(rawToken);

  const { rows } = await query(
    `SELECT s.*, u.id AS user_id, u.role, u.account_status, u.email, u.phone, u.full_name
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > now()
      LIMIT 1`,
    [tokenHash]
  );

  if (rows.length === 0) return null;

  // Sliding last-seen timestamp for session hygiene/reporting; not
  // security-critical, so failures here should never block the request.
  query('UPDATE sessions SET last_seen_at = now() WHERE id = $1', [rows[0].id]).catch(() => {});

  return rows[0];
}

/** Revokes a single session (used for logout). */
async function revokeSession(sessionId, reason = 'logout') {
  await query(
    'UPDATE sessions SET revoked_at = now(), revoked_reason = $2 WHERE id = $1',
    [sessionId, reason]
  );
}

/** Revokes every active session for a user (logout-all-devices, password change, suspension). */
async function revokeAllSessionsForUser(userId, reason = 'logout_all') {
  await query(
    `UPDATE sessions SET revoked_at = now(), revoked_reason = $2
      WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId, reason]
  );
}

async function listActiveSessionsForUser(userId) {
  const { rows } = await query(
    `SELECT id, ip_address, user_agent, device_label, created_at, last_seen_at, expires_at
       FROM sessions
      WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
      ORDER BY last_seen_at DESC`,
    [userId]
  );
  return rows;
}

module.exports = {
  COOKIE_OPTIONS,
  createSession,
  getActiveSessionByToken,
  revokeSession,
  revokeAllSessionsForUser,
  listActiveSessionsForUser,
};
