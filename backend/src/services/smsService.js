/**
 * Termii SMS integration for delivering OTP codes by phone.
 * Requires TERMII_API_KEY. Throws honestly on failure — never
 * reports a code as "sent" when the API call did not succeed.
 */
const env = require('../config/env');
const logger = require('../utils/logger');

async function sendSms(to, message) {
  if (!env.TERMII_API_KEY) {
    throw new Error(
      'TERMII_API_KEY is not configured. Set it in your environment before sending SMS.'
    );
  }

  const response = await fetch(`${env.TERMII_BASE_URL}/api/sms/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: env.TERMII_API_KEY,
      to,
      from: env.TERMII_SENDER_ID,
      sms: message,
      type: 'plain',
      channel: 'generic',
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    logger.error('Termii SMS send failed', { status: response.status, body });
    throw new Error('Failed to send SMS.');
  }

  return response.json();
}

async function sendOtpSms(phone, code) {
  return sendSms(phone, `Your JOB RUSH verification code is ${code}. It expires in ${env.OTP_TTL_MINUTES} minutes.`);
}

module.exports = { sendSms, sendOtpSms };
