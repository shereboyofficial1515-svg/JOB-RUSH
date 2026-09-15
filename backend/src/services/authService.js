const { query, withTransaction } = require('../config/db');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const { hashPassword, verifyPassword, isPasswordStrongEnough } = require('../utils/passwordUtils');
const { generateOpaqueToken, sha256Hex } = require('../utils/tokenUtils');
const { sendPasswordResetEmail } = require('./emailService');
const { recordAuditEvent } = require('../security/auditLogger');
const otpService = require('./otpService');
const sessionService = require('./sessionService');
const notificationService = require('./notificationService');

const PUBLIC_USER_FIELDS = `
  id, email, phone, full_name, role, account_status,
  email_verified_at, phone_verified_at, created_at
`;

function toPublicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    phone: row.phone,
    fullName: row.full_name,
    role: row.role,
    accountStatus: row.account_status,
    emailVerified: !!row.email_verified_at,
    phoneVerified: !!row.phone_verified_at,
    createdAt: row.created_at,
  };
}

/**
 * Registers a new account. Verification (email/phone OTP) happens as
 * a separate step — the account starts in `pending_verification`.
 * Callers are responsible for having already confirmed the OTP for
 * at least one of email/phone before calling this in a real flow, or
 * for triggering OTP issuance immediately after.
 */
async function registerUser({ email, phone, password, fullName, role }) {
  if (!isPasswordStrongEnough(password)) {
    throw new AppError(
      'Password must be at least 8 characters and include a letter and a number.',
      400,
      'WEAK_PASSWORD'
    );
  }
  if (!email && !phone) {
    throw new AppError('An email or phone number is required.', 400, 'MISSING_IDENTIFIER');
  }

  const existing = await query(
    `SELECT id FROM users WHERE (email IS NOT NULL AND email = $1) OR (phone IS NOT NULL AND phone = $2)`,
    [email || null, phone || null]
  );
  if (existing.rows.length > 0) {
    // Deliberately generic — do not reveal which field collided (email
    // enumeration is a real risk here).
    throw new AppError('An account with these details already exists.', 409, 'ACCOUNT_EXISTS');
  }

  const passwordHash = await hashPassword(password);

  const { rows } = await query(
    `INSERT INTO users (email, phone, password_hash, full_name, role)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${PUBLIC_USER_FIELDS}`,
    [email || null, phone || null, passwordHash, fullName, role]
  );

  await recordAuditEvent({
    actorUserId: rows[0].id,
    action: 'USER_REGISTERED',
    resourceType: 'user',
    resourceId: rows[0].id,
    result: 'success',
  });

  return toPublicUser(rows[0]);
}

/**
 * Authenticates email/phone + password. Applies account lockout after
 * repeated failures, independent of any frontend rate limiting.
 */
async function authenticateWithPassword({ identifier, password, ipAddress }) {
  const { rows } = await query(
    `SELECT * FROM users WHERE email = $1 OR phone = $1 LIMIT 1`,
    [identifier]
  );
  const user = rows[0];

  // Constant-shape failure path: don't reveal whether the identifier
  // exists at all.
  const genericError = () =>
    new AppError('Incorrect email/phone or password.', 401, 'INVALID_CREDENTIALS');

  if (!user) {
    throw genericError();
  }

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    throw new AppError(
      'This account is temporarily locked due to repeated failed sign-in attempts. Please try again later.',
      423,
      'ACCOUNT_LOCKED'
    );
  }

  if (user.account_status === 'suspended' || user.account_status === 'disabled') {
    throw new AppError('This account is not available for sign-in.', 403, 'ACCOUNT_UNAVAILABLE');
  }

  const passwordMatches = await verifyPassword(password, user.password_hash);

  if (!passwordMatches) {
    const attempts = user.failed_login_attempts + 1;
    const shouldLock = attempts >= env.ACCOUNT_LOCKOUT_THRESHOLD;
    await query(
      `UPDATE users SET failed_login_attempts = $2,
              locked_until = CASE WHEN $3 THEN now() + ($4 || ' minutes')::interval ELSE locked_until END
        WHERE id = $1`,
      [user.id, attempts, shouldLock, env.ACCOUNT_LOCKOUT_MINUTES]
    );
    await recordAuditEvent({
      actorUserId: user.id,
      action: 'LOGIN_FAILED',
      resourceType: 'user',
      resourceId: user.id,
      result: 'failure',
      ipAddress,
    });
    throw genericError();
  }

  await query(
    `UPDATE users SET failed_login_attempts = 0, locked_until = NULL,
            last_login_at = now(), last_login_ip = $2
      WHERE id = $1`,
    [user.id, ipAddress]
  );

  const reactivated = await reactivateIfNeeded(user.id, user.deactivated_at, ipAddress);

  await recordAuditEvent({
    actorUserId: user.id,
    action: 'LOGIN_SUCCESS',
    resourceType: 'user',
    resourceId: user.id,
    result: 'success',
    ipAddress,
  });

  return { ...toPublicUser(user), reactivated };
}

/**
 * A self-deactivated account reactivates on the next successful
 * login, the same way most consumer apps handle it — no separate
 * "reactivate" flow to build or for the person to remember. Shared by
 * every login-completion path (password, 2FA verify, Google) so a
 * deactivated account doesn't stay silently hidden just because it
 * came back through a path other than plain password login.
 */
async function reactivateIfNeeded(userId, deactivatedAt, ipAddress) {
  if (!deactivatedAt) return false;
  await query('UPDATE users SET deactivated_at = NULL WHERE id = $1', [userId]);
  await recordAuditEvent({
    actorUserId: userId,
    action: 'ACCOUNT_REACTIVATED',
    resourceType: 'user',
    resourceId: userId,
    result: 'success',
    ipAddress,
  });
  return true;
}

async function getUserById(userId) {
  const { rows } = await query(`SELECT ${PUBLIC_USER_FIELDS} FROM users WHERE id = $1`, [userId]);
  return toPublicUser(rows[0]);
}

async function markEmailVerified(userId) {
  await query(
    `UPDATE users SET email_verified_at = now(),
            account_status = CASE WHEN account_status = 'pending_verification' THEN 'active' ELSE account_status END
      WHERE id = $1`,
    [userId]
  );
}

async function markPhoneVerified(userId) {
  await query(
    `UPDATE users SET phone_verified_at = now(),
            account_status = CASE WHEN account_status = 'pending_verification' THEN 'active' ELSE account_status END
      WHERE id = $1`,
    [userId]
  );
}

/**
 * Issues a password reset token. Always behaves the same way whether
 * or not the identifier matches an account, to avoid enumeration.
 */
async function requestPasswordReset({ email }) {
  const { rows } = await query('SELECT id, email, full_name FROM users WHERE email = $1', [email]);
  const user = rows[0];

  if (user) {
    const rawToken = generateOpaqueToken(32);
    const tokenHash = sha256Hex(rawToken);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    await query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [user.id, tokenHash, expiresAt]
    );

    // /pages/forgot-password.html itself switches to the "choose a new
    // password" step when a ?token= is present — see that page's script.
    const resetUrl = `${env.APP_BASE_URL}/pages/forgot-password.html?token=${rawToken}`;
    try {
      await sendPasswordResetEmail(user.email, resetUrl, { firstName: user.full_name?.split(' ')[0], userId: user.id });
    } catch {
      // A delivery failure here must not turn into a 500 that reveals
      // "this identifier exists but its email failed" — the whole
      // point of this endpoint's fixed response is that it looks
      // identical whether the account exists or not. The failed send
      // is already logged (emailService/emailLogService) for an admin
      // to notice; the token itself is still valid if delivery
      // somehow partially succeeded via a retry elsewhere.
    }

    await recordAuditEvent({
      actorUserId: user.id,
      action: 'PASSWORD_RESET_REQUESTED',
      resourceType: 'user',
      resourceId: user.id,
      result: 'success',
    });
  }
  // No branch on "user not found" — same response either way.
}

async function resetPasswordWithToken({ rawToken, newPassword }) {
  if (!isPasswordStrongEnough(newPassword)) {
    throw new AppError(
      'Password must be at least 8 characters and include a letter and a number.',
      400,
      'WEAK_PASSWORD'
    );
  }

  const tokenHash = sha256Hex(rawToken);
  const { rows } = await query(
    `SELECT * FROM password_reset_tokens
      WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`,
    [tokenHash]
  );
  const record = rows[0];
  if (!record) {
    throw new AppError('This password reset link is invalid or has expired.', 400, 'RESET_TOKEN_INVALID');
  }

  const passwordHash = await hashPassword(newPassword);

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE users SET password_hash = $2, password_changed_at = now(), failed_login_attempts = 0, locked_until = NULL WHERE id = $1`,
      [record.user_id, passwordHash]
    );
    await client.query('UPDATE password_reset_tokens SET used_at = now() WHERE id = $1', [record.id]);
    // Force re-authentication everywhere after a password change.
    await client.query(
      `UPDATE sessions SET revoked_at = now(), revoked_reason = 'password_change' WHERE user_id = $1 AND revoked_at IS NULL`,
      [record.user_id]
    );
  });

  await recordAuditEvent({
    actorUserId: record.user_id,
    action: 'PASSWORD_CHANGED',
    resourceType: 'user',
    resourceId: record.user_id,
    result: 'success',
  });
}

/**
 * Creates a new account or links Google to an existing one, called
 * only after the OAuth service has independently verified the code
 * exchange and Google reports `email_verified: true` — this function
 * never receives an email it hasn't confirmed Google itself vouches
 * for. Linking an existing password-based account is safe on that
 * basis: Google verifying the email means whoever is completing this
 * OAuth flow actually controls that mailbox, the same trust boundary
 * as clicking a password-reset link sent to it.
 *
 * New accounts default to role 'both' — OAuth signup has no step to
 * ask worker-vs-hirer, and there is currently no endpoint to change
 * role after creation, so defaulting narrower would strand a hirer-
 * intent signup with no way to post a job. Revisit once a role-change
 * endpoint exists.
 */
async function findOrCreateGoogleUser({ googleId, email, fullName }) {
  const { rows: byGoogleId } = await query('SELECT * FROM users WHERE google_id = $1', [googleId]);
  if (byGoogleId.length > 0) {
    return toPublicUser(byGoogleId[0]);
  }

  const { rows: byEmail } = await query('SELECT * FROM users WHERE email = $1', [email]);
  if (byEmail.length > 0) {
    const existing = byEmail[0];
    if (existing.account_status === 'suspended' || existing.account_status === 'disabled') {
      throw new AppError('This account is not available for sign-in.', 403, 'ACCOUNT_UNAVAILABLE');
    }
    await query('UPDATE users SET google_id = $2 WHERE id = $1', [existing.id, googleId]);
    await recordAuditEvent({
      actorUserId: existing.id,
      action: 'GOOGLE_ACCOUNT_LINKED',
      resourceType: 'user',
      resourceId: existing.id,
      result: 'success',
    });
    return toPublicUser(existing);
  }

  // Random, never-used password so the NOT NULL column is satisfied
  // without this account being crackable via the password login path.
  const unusablePassword = generateOpaqueToken(32);
  const passwordHash = await hashPassword(unusablePassword);

  const { rows } = await query(
    `INSERT INTO users (email, password_hash, full_name, role, account_status, email_verified_at, google_id)
     VALUES ($1, $2, $3, 'both', 'active', now(), $4)
     RETURNING ${PUBLIC_USER_FIELDS}`,
    [email, passwordHash, fullName || email.split('@')[0], googleId]
  );

  await recordAuditEvent({
    actorUserId: rows[0].id,
    action: 'USER_REGISTERED_VIA_GOOGLE',
    resourceType: 'user',
    resourceId: rows[0].id,
    result: 'success',
  });

  return toPublicUser(rows[0]);
}

/**
 * Change password while logged in (distinct from the forgot/reset
 * flow, which has no "current password" to check). Every other
 * session is revoked so a stolen session elsewhere is cut off the
 * moment the real owner changes their password — but the session that
 * just made this request stays alive, since logging the person out of
 * the tab they're using right now would be a worse experience than
 * the security benefit is worth.
 */
async function changePassword(userId, { currentPassword, newPassword }, currentSessionId) {
  const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [userId]);
  if (rows.length === 0) throw new AppError('Account not found.', 404, 'NOT_FOUND');

  const matches = await verifyPassword(currentPassword, rows[0].password_hash);
  if (!matches) {
    throw new AppError('Current password is incorrect.', 401, 'INVALID_CREDENTIALS');
  }
  if (!isPasswordStrongEnough(newPassword)) {
    throw new AppError(
      'Password must be at least 8 characters and include a letter and a number.',
      400,
      'WEAK_PASSWORD'
    );
  }

  const passwordHash = await hashPassword(newPassword);
  await query(
    `UPDATE users SET password_hash = $2, password_changed_at = now() WHERE id = $1`,
    [userId, passwordHash]
  );
  await sessionService.revokeAllSessionsForUser(userId, 'password_change', currentSessionId);

  await recordAuditEvent({
    actorUserId: userId,
    action: 'PASSWORD_CHANGED',
    resourceType: 'user',
    resourceId: userId,
    result: 'success',
  });
}

/**
 * Step 1 of changing the account's email: send a code to the *new*
 * address before anything is written, so a typo'd email can never
 * lock someone out or get silently attached to the wrong account.
 */
async function requestEmailChange(userId, newEmail) {
  const { rows } = await query('SELECT id FROM users WHERE email = $1 AND id != $2', [newEmail, userId]);
  if (rows.length > 0) {
    throw new AppError('That email address is already in use.', 409, 'EMAIL_TAKEN');
  }
  await otpService.issueOtp({ userId, destination: newEmail, purpose: 'change_email', channel: 'email' });
}

/** Step 2: verify the code, then actually move the account to the new email. */
async function confirmEmailChange(userId, newEmail, code) {
  await otpService.verifyOtp({ destination: newEmail, purpose: 'change_email', code });

  const { rows } = await query('SELECT id FROM users WHERE email = $1 AND id != $2', [newEmail, userId]);
  if (rows.length > 0) {
    throw new AppError('That email address is already in use.', 409, 'EMAIL_TAKEN');
  }

  await query('UPDATE users SET email = $2, email_verified_at = now() WHERE id = $1', [userId, newEmail]);
  await recordAuditEvent({
    actorUserId: userId,
    action: 'EMAIL_CHANGED',
    resourceType: 'user',
    resourceId: userId,
    result: 'success',
  });
  return getUserById(userId);
}

/** Same two-step pattern as email, over SMS. */
async function requestPhoneChange(userId, newPhone) {
  const { rows } = await query('SELECT id FROM users WHERE phone = $1 AND id != $2', [newPhone, userId]);
  if (rows.length > 0) {
    throw new AppError('That phone number is already in use.', 409, 'PHONE_TAKEN');
  }
  await otpService.issueOtp({ userId, destination: newPhone, purpose: 'change_phone', channel: 'sms' });
}

async function confirmPhoneChange(userId, newPhone, code) {
  await otpService.verifyOtp({ destination: newPhone, purpose: 'change_phone', code });

  const { rows } = await query('SELECT id FROM users WHERE phone = $1 AND id != $2', [newPhone, userId]);
  if (rows.length > 0) {
    throw new AppError('That phone number is already in use.', 409, 'PHONE_TAKEN');
  }

  await query('UPDATE users SET phone = $2, phone_verified_at = now() WHERE id = $1', [userId, newPhone]);
  await recordAuditEvent({
    actorUserId: userId,
    action: 'PHONE_CHANGED',
    resourceType: 'user',
    resourceId: userId,
    result: 'success',
  });
  return getUserById(userId);
}

/**
 * Re-checks the password for any destructive/sensitive account action
 * (deactivate, delete) — a live session cookie alone isn't enough
 * confirmation for something this consequential.
 */
async function assertPasswordConfirmed(userId, password) {
  const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [userId]);
  if (rows.length === 0) throw new AppError('Account not found.', 404, 'NOT_FOUND');
  const matches = await verifyPassword(password, rows[0].password_hash);
  if (!matches) {
    throw new AppError('Incorrect password.', 401, 'INVALID_CREDENTIALS');
  }
}

/**
 * Deactivate: reversible by simply logging back in (see
 * authenticateWithPassword). Hides the profile from search/public
 * view the same way a private profile does, without touching the
 * person's own visibility preference — see profileService.
 */
async function deactivateAccount(userId, password) {
  await assertPasswordConfirmed(userId, password);
  await query('UPDATE users SET deactivated_at = now() WHERE id = $1', [userId]);
  await sessionService.revokeAllSessionsForUser(userId, 'deactivated');
  await recordAuditEvent({
    actorUserId: userId,
    action: 'ACCOUNT_DEACTIVATED',
    resourceType: 'user',
    resourceId: userId,
    result: 'success',
  });
  // Sent after sessions are already revoked — reading this email
  // never requires being logged in.
  notificationService.notifyUser(userId, 'account_deactivated', {
    title: 'Account deactivated',
    body: 'Your JOB RUSH account has been deactivated as requested.',
    data: {},
  }).catch(() => {});
}

/**
 * Delete: irreversible from the user's side, but implemented as
 * redaction rather than a hard row delete. Many tables (messages,
 * reviews, job reports, ...) reference users(id) without ON DELETE
 * CASCADE, by design — another person's message thread, review, or
 * job history shouldn't corrupt or vanish because the other party
 * deleted their account. Redacting PII and permanently disabling
 * sign-in achieves the same real-world outcome ("this account is
 * gone") without breaking referential integrity for everyone else.
 */
async function deleteAccount(userId, password) {
  await assertPasswordConfirmed(userId, password);

  const anonymizedEmail = `deleted-${userId}@deleted.jobrush.ng`;
  const unusablePasswordHash = await hashPassword(generateOpaqueToken(32));

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE users
          SET email = $2, phone = NULL, full_name = 'Deleted user',
              password_hash = $3, account_status = 'disabled', deleted_at = now()
        WHERE id = $1`,
      [userId, anonymizedEmail, unusablePasswordHash]
    );
    await client.query(
      `UPDATE sessions SET revoked_at = now(), revoked_reason = 'account_deleted' WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId]
    );
  });

  await recordAuditEvent({
    actorUserId: userId,
    action: 'ACCOUNT_DELETED',
    resourceType: 'user',
    resourceId: userId,
    result: 'success',
  });
}

module.exports = {
  toPublicUser,
  registerUser,
  authenticateWithPassword,
  getUserById,
  markEmailVerified,
  markPhoneVerified,
  requestPasswordReset,
  resetPasswordWithToken,
  findOrCreateGoogleUser,
  reactivateIfNeeded,
  changePassword,
  requestEmailChange,
  confirmEmailChange,
  requestPhoneChange,
  confirmPhoneChange,
  deactivateAccount,
  deleteAccount,
};
