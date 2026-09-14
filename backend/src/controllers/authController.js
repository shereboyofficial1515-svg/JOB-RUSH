const env = require('../config/env');
const { query } = require('../config/db');
const authService = require('../services/authService');
const otpService = require('../services/otpService');
const sessionService = require('../services/sessionService');
const twoFactorService = require('../services/twoFactorService');
const googleOAuthService = require('../services/googleOAuthService');
const deviceService = require('../services/deviceService');
const notificationService = require('../services/notificationService');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const { recordAuditEvent } = require('../security/auditLogger');

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
}

/**
 * Creates a session for a successful login and checks whether this
 * is a device the account hasn't been seen on before, firing a
 * notification if so. Shared by every login success path (password,
 * 2FA verify, Google) so the check happens exactly once per real
 * login, regardless of which path got them there.
 */
async function establishSession(req, user) {
  const userAgent = req.headers['user-agent'] || null;
  const ipAddress = getClientIp(req);

  const { rawToken, expiresAt } = await sessionService.createSession({
    userId: user.id,
    ipAddress,
    userAgent,
  });

  const { isNewDevice } = await deviceService.checkAndRecordDevice(user.id, userAgent, ipAddress);
  if (isNewDevice) {
    notificationService.notifyUser(user.id, 'new_device_login', {
      title: 'New sign-in to your account',
      body: `Your account was just accessed from a new device${ipAddress ? ` (${ipAddress})` : ''}. If this wasn't you, secure your account immediately.`,
      data: { ipAddress },
    }).catch(() => {});
  }

  return { rawToken, expiresAt };
}

async function issueSessionAndRespond(req, res, user) {
  const { rawToken, expiresAt } = await establishSession(req, user);

  res.cookie(env.SESSION_COOKIE_NAME, rawToken, {
    ...sessionService.COOKIE_OPTIONS,
    expires: expiresAt,
  });

  return res.status(200).json({ user });
}

/**
 * POST /api/auth/register
 * Creates the account in pending_verification status. Real client
 * flow: register -> request OTP -> verify OTP -> account becomes active.
 */
const register = asyncHandler(async (req, res) => {
  const user = await authService.registerUser(req.body);
  res.status(201).json({
    user,
    message: 'Account created. Please verify your email or phone to continue.',
  });
});

/**
 * POST /api/auth/otp/request
 */
const requestOtp = asyncHandler(async (req, res) => {
  const { destination, channel, purpose } = req.body;
  await otpService.issueOtp({ destination, channel, purpose });
  res.status(200).json({ message: 'Verification code sent.' });
});

/**
 * POST /api/auth/otp/verify
 * On success for a registration purpose, marks the corresponding
 * field verified and activates the account if this was the only
 * pending requirement.
 */
const verifyOtp = asyncHandler(async (req, res) => {
  const { destination, purpose, code } = req.body;
  await otpService.verifyOtp({ destination, purpose, code });

  if (purpose === 'registration_email') {
    const { rows } = await query('SELECT id FROM users WHERE email = $1', [destination]);
    if (rows[0]) await authService.markEmailVerified(rows[0].id);
  } else if (purpose === 'registration_phone') {
    const { rows } = await query('SELECT id FROM users WHERE phone = $1', [destination]);
    if (rows[0]) await authService.markPhoneVerified(rows[0].id);
  }

  res.status(200).json({ verified: true });
});

/**
 * POST /api/auth/login
 * If the account has 2FA enabled, this does NOT issue a session —
 * it returns a short-lived challenge token the client must pair with
 * a TOTP/backup code at POST /api/auth/2fa/verify-login.
 */
const login = asyncHandler(async (req, res) => {
  const { identifier, password } = req.body;
  const user = await authService.authenticateWithPassword({
    identifier,
    password,
    ipAddress: getClientIp(req),
  });

  if (user.accountStatus === 'pending_verification') {
    throw new AppError(
      'Please verify your email or phone before signing in.',
      403,
      'VERIFICATION_REQUIRED'
    );
  }

  const has2FA = await twoFactorService.isEnabled(user.id);
  if (has2FA) {
    const challengeToken = await twoFactorService.createLoginChallenge(user.id);
    return res.status(200).json({ requiresTwoFactor: true, challengeToken });
  }

  return issueSessionAndRespond(req, res, user);
});

/**
 * POST /api/auth/2fa/verify-login
 * Second step of login for a 2FA-enabled account. Issues the real
 * session only after the challenge + code both check out.
 */
const verifyLoginTwoFactor = asyncHandler(async (req, res) => {
  const { challengeToken, code } = req.body;
  const userId = await twoFactorService.verifyLoginChallenge(challengeToken, code);
  const user = await authService.getUserById(userId);
  return issueSessionAndRespond(req, res, user);
});

/**
 * POST /api/auth/logout
 */
const logout = asyncHandler(async (req, res) => {
  if (req.sessionId) {
    await sessionService.revokeSession(req.sessionId, 'logout');
  }
  res.clearCookie(env.SESSION_COOKIE_NAME, { ...sessionService.COOKIE_OPTIONS });
  res.status(200).json({ message: 'Logged out.' });
});

/**
 * POST /api/auth/logout-all
 * Invalidates every session for the current user (all devices).
 */
const logoutAllDevices = asyncHandler(async (req, res) => {
  await sessionService.revokeAllSessionsForUser(req.user.id, 'logout_all');
  res.clearCookie(env.SESSION_COOKIE_NAME, { ...sessionService.COOKIE_OPTIONS });
  await recordAuditEvent({
    actorUserId: req.user.id,
    action: 'LOGOUT_ALL_DEVICES',
    resourceType: 'user',
    resourceId: req.user.id,
    result: 'success',
  });
  res.status(200).json({ message: 'Logged out of all devices.' });
});

/**
 * GET /api/auth/sessions
 * Lists the current user's own active sessions for the "device
 * management" settings screen.
 */
const listSessions = asyncHandler(async (req, res) => {
  const sessions = await sessionService.listActiveSessionsForUser(req.user.id);
  res.status(200).json({ sessions });
});

/**
 * GET /api/auth/devices
 * Lists devices (by User-Agent fingerprint) that have signed into
 * this account before — the record new-device detection is built on.
 */
const listDevices = asyncHandler(async (req, res) => {
  const devices = await deviceService.listDevicesForUser(req.user.id);
  res.status(200).json({ devices });
});

/**
 * GET /api/auth/me
 * Identity is resolved entirely from the session — nothing in the
 * request body/query is trusted here.
 */
const getCurrentUser = asyncHandler(async (req, res) => {
  const user = await authService.getUserById(req.user.id);
  res.status(200).json({ user });
});

/**
 * POST /api/auth/password/forgot
 */
const requestPasswordReset = asyncHandler(async (req, res) => {
  await authService.requestPasswordReset(req.body);
  // Same response whether or not the email exists, to avoid enumeration.
  res.status(200).json({ message: 'If an account exists for that email, a reset link has been sent.' });
});

/**
 * POST /api/auth/password/reset
 */
const resetPassword = asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body;
  await authService.resetPasswordWithToken({ rawToken: token, newPassword });
  res.status(200).json({ message: 'Password updated. Please sign in again.' });
});

/**
 * GET /api/auth/google
 * Redirects the browser to Google's consent screen. Not an API call
 * the frontend fetches — a real navigation, since Google's OAuth flow
 * requires the user's own browser to interact with Google directly.
 */
const googleRedirect = asyncHandler(async (req, res) => {
  const url = googleOAuthService.buildAuthorizationUrl();
  res.redirect(url);
});

/**
 * GET /api/auth/google/callback
 * Google redirects here with ?code&state. Verifies state (CSRF),
 * exchanges the code server-side (the client secret never leaves this
 * function), fetches the verified profile from Google's own userinfo
 * endpoint, then creates/links the account and issues a real session
 * — finally redirecting to the frontend with the session cookie set.
 */
const googleCallback = asyncHandler(async (req, res) => {
  const { code, state, error: googleError } = req.query;
  const frontendBase = env.APP_BASE_URL;

  if (googleError) {
    return res.redirect(`${frontendBase}/pages/login.html?error=google_denied`);
  }
  if (!code || !state || !googleOAuthService.verifyState(state)) {
    logger.warn('Rejected Google OAuth callback with invalid/missing state');
    return res.redirect(`${frontendBase}/pages/login.html?error=invalid_state`);
  }

  try {
    const tokens = await googleOAuthService.exchangeCodeForTokens(code);
    const profile = await googleOAuthService.getUserInfo(tokens.access_token);

    if (!profile.email || profile.email_verified !== true) {
      return res.redirect(`${frontendBase}/pages/login.html?error=email_not_verified`);
    }

    const user = await authService.findOrCreateGoogleUser({
      googleId: profile.sub,
      email: profile.email,
      fullName: profile.name,
    });

    const has2FA = await twoFactorService.isEnabled(user.id);
    if (has2FA) {
      // Google sign-in still respects 2FA — redirect to the frontend's
      // challenge step rather than silently skipping the second factor.
      const challengeToken = await twoFactorService.createLoginChallenge(user.id);
      return res.redirect(`${frontendBase}/pages/login.html?twoFactorChallenge=${encodeURIComponent(challengeToken)}`);
    }

    const { rawToken, expiresAt } = await establishSession(req, user);
    res.cookie(env.SESSION_COOKIE_NAME, rawToken, { ...sessionService.COOKIE_OPTIONS, expires: expiresAt });

    return res.redirect(`${frontendBase}/pages/dashboard.html`);
  } catch (err) {
    logger.error('Google OAuth callback failed', { error: err.message });
    return res.redirect(`${frontendBase}/pages/login.html?error=google_signin_failed`);
  }
});

module.exports = {
  register,
  requestOtp,
  verifyOtp,
  login,
  verifyLoginTwoFactor,
  googleRedirect,
  googleCallback,
  logout,
  logoutAllDevices,
  listSessions,
  listDevices,
  getCurrentUser,
  requestPasswordReset,
  resetPassword,
};
