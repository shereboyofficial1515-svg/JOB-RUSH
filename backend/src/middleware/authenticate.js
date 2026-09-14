const env = require('../config/env');
const { getActiveSessionByToken } = require('../services/sessionService');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

/**
 * Resolves req.user strictly from the server-side session record
 * looked up via the httpOnly cookie. Anything the client sends about
 * "who it is" (headers, body fields, query params) is ignored here —
 * identity always comes from this lookup.
 */
const authenticate = asyncHandler(async (req, res, next) => {
  const rawToken = req.cookies?.[env.SESSION_COOKIE_NAME];
  const session = await getActiveSessionByToken(rawToken);

  if (!session) {
    throw new AppError('Authentication required.', 401, 'UNAUTHENTICATED');
  }
  if (session.account_status === 'suspended' || session.account_status === 'disabled') {
    throw new AppError('This account is not available.', 403, 'ACCOUNT_UNAVAILABLE');
  }

  req.user = {
    id: session.user_id,
    role: session.role,
    accountStatus: session.account_status,
    email: session.email,
    phone: session.phone,
    fullName: session.full_name,
  };
  req.sessionId = session.id;

  next();
});

/** Allows the request through whether or not a session exists, but attaches req.user if one does. */
const attachUserIfPresent = asyncHandler(async (req, res, next) => {
  const rawToken = req.cookies?.[env.SESSION_COOKIE_NAME];
  const session = await getActiveSessionByToken(rawToken);
  if (session) {
    req.user = {
      id: session.user_id,
      role: session.role,
      accountStatus: session.account_status,
    };
    req.sessionId = session.id;
  }
  next();
});

module.exports = { authenticate, attachUserIfPresent };
