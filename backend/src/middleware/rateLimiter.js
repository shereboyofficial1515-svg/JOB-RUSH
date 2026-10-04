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

// Chat attachments (photos, voice notes, files) are a normal part of a
// conversation, so they get their own, roomier budget than the shared
// uploadLimiter -- still bounded so one account cannot flood storage.
const chatUploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 90,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attachments sent. Please slow down and try again shortly.' },
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

// ----- limits for already-signed-in actions, keyed by account (these routes sit behind `authenticate`) -----
// Generous for a person, tight for a script: they exist to stop floods, not to slow down real use.
const perUser = (windowMs, max, message) => rateLimit({
  windowMs,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user && req.user.id ? `u:${req.user.id}` : 'anon'),
  message: { error: message },
});
// Sending messages: 60 a minute is far above anything typed or pasted by a person.
const messageSendLimiter = perUser(60 * 1000, 60, 'You are sending messages too quickly. Please wait a moment.');
// Money-moving requests (fund / release / refund escrow, request a withdrawal).
const moneyActionLimiter = perUser(60 * 60 * 1000, 30, 'Too many payment requests. Please try again later.');
// Support tickets, feedback and reports.
const supportActionLimiter = perUser(60 * 60 * 1000, 20, 'Too many submissions. Please try again later.');
// Public search / browse (no account): per IP.
const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many searches. Please slow down for a moment.' },
});

module.exports = {
  messageSendLimiter,
  moneyActionLimiter,
  supportActionLimiter,
  searchLimiter,
  loginLimiter,
  registrationLimiter,
  otpRequestLimiter,
  otpVerifyLimiter,
  passwordResetLimiter,
  uploadLimiter,
  chatUploadLimiter,
  videoUploadLimiter,
  facebookDeletionLimiter,
};
