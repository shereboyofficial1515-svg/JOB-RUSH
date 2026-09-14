const crypto = require('crypto');
const { query } = require('../config/db');

function fingerprintFor(userAgent) {
  return crypto.createHash('sha256').update(userAgent || 'unknown').digest('hex');
}

/**
 * Records this login's device fingerprint for the user and reports
 * whether it's the first time this exact User-Agent has been seen
 * for this account. Never throws — device tracking is a nice-to-have
 * alert, not something that should ever block a login.
 */
async function checkAndRecordDevice(userId, userAgent, ipAddress) {
  try {
    const fingerprintHash = fingerprintFor(userAgent);

    const { rows: existing } = await query(
      'SELECT id FROM known_devices WHERE user_id = $1 AND fingerprint_hash = $2',
      [userId, fingerprintHash]
    );

    if (existing.length > 0) {
      await query('UPDATE known_devices SET last_seen_at = now(), last_ip = $2 WHERE id = $1', [
        existing[0].id,
        ipAddress || null,
      ]);
      return { isNewDevice: false };
    }

    const { rows: countRows } = await query('SELECT COUNT(*)::int AS n FROM known_devices WHERE user_id = $1', [userId]);
    const isFirstDeviceEver = countRows[0].n === 0;

    await query(
      `INSERT INTO known_devices (user_id, fingerprint_hash, user_agent, last_ip) VALUES ($1, $2, $3, $4)`,
      [userId, fingerprintHash, userAgent || null, ipAddress || null]
    );

    // A brand-new account's very first login isn't "suspicious" — only
    // alert once there's an established device history to diverge from.
    return { isNewDevice: !isFirstDeviceEver };
  } catch {
    return { isNewDevice: false };
  }
}

async function listDevicesForUser(userId) {
  const { rows } = await query(
    'SELECT id, user_agent, last_ip, first_seen_at, last_seen_at FROM known_devices WHERE user_id = $1 ORDER BY last_seen_at DESC',
    [userId]
  );
  return rows;
}

module.exports = { checkAndRecordDevice, listDevicesForUser };
