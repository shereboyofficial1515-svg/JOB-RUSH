const { authenticator } = require('otplib');
const { randomBytes } = require('crypto');
const { query } = require('../config/db');
const AppError = require('../utils/AppError');
const { generateOpaqueToken, sha256Hex } = require('../utils/tokenUtils');
const { recordAuditEvent } = require('../security/auditLogger');

const CHALLENGE_TTL_MINUTES = 5;
const BACKUP_CODE_COUNT = 10;

authenticator.options = { window: 1 }; // allow one 30s step of clock drift, no more

function generateBackupCodes() {
  const codes = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    const raw = randomBytes(5).toString('hex').toUpperCase().slice(0, 8);
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4)}`);
  }
  return codes;
}

/**
 * Starts (or restarts) enrollment: generates a new secret, stored
 * unconfirmed (enabled = false) until confirmSetup verifies the user
 * actually has it loaded in an authenticator app. Calling this again
 * before confirming just replaces the pending secret.
 */
async function startSetup(userId, accountLabel) {
  const secret = authenticator.generateSecret();
  await query(
    `INSERT INTO user_two_factor (user_id, secret, enabled, backup_codes)
     VALUES ($1, $2, false, '{}')
     ON CONFLICT (user_id) DO UPDATE SET secret = EXCLUDED.secret, enabled = false, backup_codes = '{}'`,
    [userId, secret]
  );

  const otpauthUrl = authenticator.keyuri(accountLabel, 'JOB RUSH', secret);
  return { secret, otpauthUrl };
}

/** Confirms enrollment with a code from the authenticator app, enabling 2FA and issuing backup codes (shown once). */
async function confirmSetup(userId, code) {
  const { rows } = await query('SELECT * FROM user_two_factor WHERE user_id = $1', [userId]);
  const record = rows[0];
  if (!record) throw new AppError('No pending 2FA setup found. Start setup first.', 400, 'NO_PENDING_SETUP');
  if (record.enabled) throw new AppError('Two-factor authentication is already enabled.', 400, 'ALREADY_ENABLED');

  if (!authenticator.check(code, record.secret)) {
    throw new AppError('Incorrect code. Please try again.', 400, 'INVALID_CODE');
  }

  const backupCodes = generateBackupCodes();
  const hashedCodes = backupCodes.map((c) => sha256Hex(c));

  await query('UPDATE user_two_factor SET enabled = true, backup_codes = $2 WHERE user_id = $1', [
    userId,
    hashedCodes,
  ]);

  await recordAuditEvent({
    actorUserId: userId,
    action: 'TWO_FACTOR_ENABLED',
    resourceType: 'user',
    resourceId: userId,
    result: 'success',
  });

  return { backupCodes };
}

/** Disables 2FA. Requires a valid current code (TOTP or backup) so a hijacked session alone can't turn it off. */
async function disable(userId, code) {
  const isValid = await verifyCode(userId, code, { consumeBackupCode: true });
  if (!isValid) throw new AppError('Incorrect code.', 400, 'INVALID_CODE');

  await query('DELETE FROM user_two_factor WHERE user_id = $1', [userId]);

  await recordAuditEvent({
    actorUserId: userId,
    action: 'TWO_FACTOR_DISABLED',
    resourceType: 'user',
    resourceId: userId,
    result: 'success',
  });
}

async function isEnabled(userId) {
  const { rows } = await query('SELECT enabled FROM user_two_factor WHERE user_id = $1', [userId]);
  return rows.length > 0 && rows[0].enabled;
}

/**
 * Verifies a submitted code against either the TOTP secret or an
 * unused backup code. Backup codes are single-use — a match removes
 * it from the array in the same call, never just flags it.
 */
async function verifyCode(userId, code, { consumeBackupCode = true } = {}) {
  const { rows } = await query('SELECT * FROM user_two_factor WHERE user_id = $1 AND enabled = true', [userId]);
  const record = rows[0];
  if (!record) return false;

  if (authenticator.check(code, record.secret)) return true;

  const normalizedCode = code.trim().toUpperCase();
  const codeHash = sha256Hex(normalizedCode);
  if (record.backup_codes.includes(codeHash)) {
    if (consumeBackupCode) {
      await query('UPDATE user_two_factor SET backup_codes = array_remove(backup_codes, $2) WHERE user_id = $1', [
        userId,
        codeHash,
      ]);
    }
    return true;
  }

  return false;
}

/** Called by the login flow once password verification succeeds for a 2FA-enabled account. */
async function createLoginChallenge(userId) {
  const rawToken = generateOpaqueToken(32);
  const tokenHash = sha256Hex(rawToken);
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MINUTES * 60 * 1000);

  await query(
    `INSERT INTO two_factor_challenges (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt]
  );

  return rawToken;
}

/** Consumes a login challenge + code together, returning the userId on success. Single-use. */
async function verifyLoginChallenge(rawToken, code) {
  const tokenHash = sha256Hex(rawToken);
  const { rows } = await query(
    `SELECT * FROM two_factor_challenges WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > now()`,
    [tokenHash]
  );
  const challenge = rows[0];
  if (!challenge) {
    throw new AppError('This verification session has expired. Please log in again.', 400, 'CHALLENGE_EXPIRED');
  }

  const isValid = await verifyCode(challenge.user_id, code);
  if (!isValid) {
    await recordAuditEvent({
      actorUserId: challenge.user_id,
      action: 'TWO_FACTOR_LOGIN_FAILED',
      resourceType: 'user',
      resourceId: challenge.user_id,
      result: 'failure',
    });
    throw new AppError('Incorrect code.', 400, 'INVALID_CODE');
  }

  await query('UPDATE two_factor_challenges SET consumed_at = now() WHERE id = $1', [challenge.id]);

  await recordAuditEvent({
    actorUserId: challenge.user_id,
    action: 'TWO_FACTOR_LOGIN_SUCCESS',
    resourceType: 'user',
    resourceId: challenge.user_id,
    result: 'success',
  });

  return challenge.user_id;
}

module.exports = {
  startSetup,
  confirmSetup,
  disable,
  isEnabled,
  verifyCode,
  createLoginChallenge,
  verifyLoginChallenge,
};
