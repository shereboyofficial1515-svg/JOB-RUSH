const { query } = require('../config/db');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const { generateNumericOtp, sha256Hex, timingSafeEqualStr } = require('../utils/tokenUtils');
const { sendOtpEmail } = require('./emailService');
const { sendOtpSms } = require('./smsService');

/**
 * Issues a new OTP for a destination + purpose, enforcing a resend
 * cooldown so a user (or an attacker) can't hammer the send endpoint
 * to run up SMS/email costs or brute-force via repeated codes.
 */
async function issueOtp({ userId = null, destination, purpose, channel }) {
  const cooldownSeconds = env.OTP_RESEND_COOLDOWN_SECONDS;

  const recent = await query(
    `SELECT id FROM otp_codes
      WHERE destination = $1 AND purpose = $2
        AND consumed_at IS NULL
        AND created_at > now() - ($3 || ' seconds')::interval
      ORDER BY created_at DESC LIMIT 1`,
    [destination, purpose, cooldownSeconds]
  );
  if (recent.rows.length > 0) {
    throw new AppError(
      'A verification code was already sent recently. Please wait before requesting another.',
      429,
      'OTP_COOLDOWN'
    );
  }

  const code = generateNumericOtp(env.OTP_LENGTH);
  const codeHash = sha256Hex(code);
  const expiresAt = new Date(Date.now() + env.OTP_TTL_MINUTES * 60 * 1000);

  await query(
    `INSERT INTO otp_codes (user_id, destination, purpose, code_hash, max_attempts, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, destination, purpose, codeHash, env.OTP_MAX_ATTEMPTS, expiresAt]
  );

  if (channel === 'email') {
    // userId isn't always known by the caller here (the registration
    // flow requests the first OTP right after creating the account,
    // without threading the new user's ID back through) — falling
    // back to a lookup by destination just personalizes the greeting
    // and lets the email be logged against the right user; it never
    // affects verification, which is always checked by destination.
    let firstName;
    let resolvedUserId = userId;
    const { rows: userRows } = await query(
      userId ? 'SELECT id, full_name FROM users WHERE id = $1' : 'SELECT id, full_name FROM users WHERE email = $1',
      [userId || destination]
    );
    if (userRows[0]) {
      firstName = userRows[0].full_name?.split(' ')[0];
      resolvedUserId = userRows[0].id;
    }
    await sendOtpEmail(destination, code, { firstName, userId: resolvedUserId });
  } else if (channel === 'sms') {
    await sendOtpSms(destination, code);
  } else {
    throw new AppError('Unsupported OTP delivery channel.', 400, 'INVALID_CHANNEL');
  }
}

/**
 * Verifies a submitted code against the most recent unconsumed OTP
 * for that destination/purpose. Enforces expiry and a max-attempts
 * ceiling so a code can't be brute-forced.
 */
async function verifyOtp({ destination, purpose, code }) {
  const { rows } = await query(
    `SELECT * FROM otp_codes
      WHERE destination = $1 AND purpose = $2 AND consumed_at IS NULL
      ORDER BY created_at DESC LIMIT 1`,
    [destination, purpose]
  );
  const record = rows[0];

  if (!record) {
    throw new AppError('No pending verification code for this request.', 400, 'OTP_NOT_FOUND');
  }
  if (new Date(record.expires_at) < new Date()) {
    throw new AppError('This verification code has expired. Please request a new one.', 400, 'OTP_EXPIRED');
  }
  if (record.attempts >= record.max_attempts) {
    throw new AppError('Too many incorrect attempts. Please request a new code.', 429, 'OTP_LOCKED');
  }

  const submittedHash = sha256Hex(code);
  if (!timingSafeEqualStr(submittedHash, record.code_hash)) {
    await query('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1', [record.id]);
    throw new AppError('Incorrect verification code.', 400, 'OTP_INCORRECT');
  }

  await query('UPDATE otp_codes SET consumed_at = now() WHERE id = $1', [record.id]);
  return true;
}

module.exports = { issueOtp, verifyOtp };
