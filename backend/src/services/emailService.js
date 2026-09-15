/**
 * Resend email integration. Requires RESEND_API_KEY to be configured.
 * This module does not fake success — if the key is missing or the
 * API call fails, it throws so callers can handle/report it honestly.
 *
 * Every send goes through `sendEmail`, which now also logs the
 * attempt (see emailLogService) and accepts a plain-text body,
 * reply-to override, and category (for a per-category sender address
 * — security@ / support@ / the default — see emailBranding).
 */
const env = require('../config/env');
const branding = require('../config/emailBranding');
const logger = require('../utils/logger');
const emailLogService = require('./emailLogService');
const { renderNotificationEmail } = require('../emails/notificationEmailMap');
const templates = require('../emails/templates');

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/**
 * @param {object} opts
 * @param {string} opts.to
 * @param {string} opts.subject
 * @param {string} opts.html
 * @param {string} [opts.text]            Plain-text fallback — always send one.
 * @param {string} [opts.replyTo]
 * @param {'default'|'security'|'support'} [opts.category]
 * @param {string} [opts.emailType]       For logging, e.g. 'welcome', 'application_received'.
 * @param {string} [opts.userId]
 * @param {{type:string,id:string}} [opts.relatedEntity]
 */
async function sendEmail({ to, subject, html, text, replyTo, category = 'default', emailType = 'generic', userId, relatedEntity }) {
  if (!env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not configured. Set it in your environment before sending email.');
  }

  const payload = {
    from: branding.senderFor(category),
    to: [to],
    subject,
    html,
  };
  if (text) payload.text = text;
  const effectiveReplyTo = replyTo || branding.replyTo;
  if (effectiveReplyTo) payload.reply_to = effectiveReplyTo;

  let response;
  let body;
  try {
    response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    body = await response.json().catch(() => null);
  } catch (err) {
    await emailLogService.logEmail({
      userId, recipient: to, emailType, subject, status: 'failed', errorMessage: err.message,
      relatedEntityType: relatedEntity?.type, relatedEntityId: relatedEntity?.id,
    });
    throw new Error('Failed to send email.');
  }

  if (!response.ok) {
    logger.error('Resend email send failed', { status: response.status, body });
    await emailLogService.logEmail({
      userId, recipient: to, emailType, subject, status: 'failed',
      errorMessage: body?.message || `HTTP ${response.status}`,
      relatedEntityType: relatedEntity?.type, relatedEntityId: relatedEntity?.id,
    });
    throw new Error('Failed to send email.');
  }

  await emailLogService.logEmail({
    userId, recipient: to, emailType, subject, status: 'sent', providerMessageId: body?.id,
    relatedEntityType: relatedEntity?.type, relatedEntityId: relatedEntity?.id,
  });
  return body;
}

/** Registration/login OTP — now the full branded verification template instead of a bare paragraph. */
async function sendOtpEmail(to, code, { firstName, userId } = {}) {
  const rendered = templates.verificationEmail({ firstName, code, expirationTime: `${env.OTP_TTL_MINUTES} minutes` });
  return sendEmail({
    to, subject: rendered.subject, html: rendered.html, text: rendered.text,
    category: 'security', emailType: 'otp_verification', userId,
  });
}

/** Password reset link — same branded flow as every other email. */
async function sendPasswordResetEmail(to, resetUrl, { firstName, userId } = {}) {
  const rendered = templates.passwordResetEmail({ firstName, resetUrl, expirationTime: '30 minutes' });
  return sendEmail({
    to, subject: rendered.subject, html: rendered.html, text: rendered.text,
    category: 'security', emailType: 'password_reset', userId,
  });
}

/** Used by notificationService for every notify()-driven email — see notificationEmailMap. */
async function sendNotificationEmail({ to, type, title, body, data, firstName, userId, relatedEntity }) {
  const rendered = renderNotificationEmail({ type, title, body, data, firstName });
  return sendEmail({
    to, subject: rendered.subject, html: rendered.html, text: rendered.text,
    category: 'default', emailType: type, userId, relatedEntity,
  });
}

/** Onboarding — fired once at registration, not part of the notify() system (no in-app equivalent). */
async function sendWelcomeEmail(to, { firstName, userId } = {}) {
  const rendered = templates.welcomeEmail({ firstName });
  return sendEmail({
    to, subject: rendered.subject, html: rendered.html, text: rendered.text,
    category: 'default', emailType: 'welcome', userId,
  });
}

module.exports = {
  sendEmail,
  sendOtpEmail,
  sendPasswordResetEmail,
  sendNotificationEmail,
  sendWelcomeEmail,
};
