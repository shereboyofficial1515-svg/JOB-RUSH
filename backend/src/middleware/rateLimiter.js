const rateLimit = require('express-rate-limit');
const env = require('../config/env');

/**
 * NOTE: express-rate-limit's default store is in-memory, which is
 * fine for a single instance but resets on restart and doesn't share
 * state across multiple app instances. For production with more than
 * one server process, plug in a shared store (e.g. Redis) via the
 * `store` option on each limiter below.
 */

const loginLimiter = rateLimit({
  windowMs: env.LOGIN_RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
  max: env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Please try again later.' },
});

const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many registration attempts from this network. Please try again later.' },
});

const otpRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many verification code requests. Please wait before trying again.' },
});

const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many verification attempts. Please wait before trying again.' },
});

const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many password reset requests. Please try again later.' },
});

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many uploads. Please slow down and try again shortly.' },
});

// Video processing (transcoding) costs real CPU/RAM per request, far
// more than a plain image/document upload — the generic uploadLimiter
// alone would let someone queue up 30 transcode jobs in 15 minutes.
// This runs in addition to, not instead of, the concurrency gate in
// videoProcessingService (that one bounds simultaneous jobs; this one
// bounds how often any single user can start one).
const videoUploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many video uploads. Please slow down and try again shortly.' },
});

// Facebook's own servers call this, not end users — generous, but
// still bounded so a misbehaving/compromised caller (or someone
// probing the endpoint directly) can't hammer it indefinitely.
const facebookDeletionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests.' },
});

module.exports = {
  loginLimiter,
  registrationLimiter,
  otpRequestLimiter,
  otpVerifyLimiter,
  passwordResetLimiter,
  uploadLimiter,
  videoUploadLimiter,
  facebookDeletionLimiter,
};
