/**
 * Resend email integration. Requires RESEND_API_KEY to be configured.
 * This module does not fake success — if the key is missing or the
 * API call fails, it throws so callers can handle/report it honestly.
 */
const env = require('../config/env');
const logger = require('../utils/logger');

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

async function sendEmail({ to, subject, html }) {
  if (!env.RESEND_API_KEY) {
    throw new Error(
      'RESEND_API_KEY is not configured. Set it in your environment before sending email.'
    );
  }

  const response = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL,
      to: [to],
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    logger.error('Resend email send failed', { status: response.status, body });
    throw new Error('Failed to send email.');
  }

  return response.json();
}

async function sendOtpEmail(to, code) {
  return sendEmail({
    to,
    subject: 'Your JOB RUSH verification code',
    html: `
      <div style="font-family: sans-serif; color: #001020;">
        <p>Your JOB RUSH verification code is:</p>
        <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px;">${code}</p>
        <p>This code expires in ${env.OTP_TTL_MINUTES} minutes. If you didn't request this, you can ignore this email.</p>
      </div>
    `,
  });
}

async function sendPasswordResetEmail(to, resetUrl) {
  return sendEmail({
    to,
    subject: 'Reset your JOB RUSH password',
    html: `
      <div style="font-family: sans-serif; color: #001020;">
        <p>We received a request to reset your JOB RUSH password.</p>
        <p><a href="${resetUrl}">Reset your password</a></p>
        <p>If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
  });
}

module.exports = { sendEmail, sendOtpEmail, sendPasswordResetEmail };
