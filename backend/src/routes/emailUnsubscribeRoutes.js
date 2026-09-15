const express = require('express');
const { query } = require('../config/db');
const { verifyUnsubscribeToken } = require('../utils/unsubscribeToken');
const branding = require('../config/emailBranding');

const router = express.Router();

/**
 * GET /api/email/unsubscribe?token=...
 * One click, no login required — this only ever turns off the same
 * "email notifications" preference already exposed in Settings →
 * Chat/notifications (notification_preferences.email_enabled). It
 * intentionally does not touch OTP/password-reset/welcome emails,
 * which don't go through that preference at all — you can't
 * accidentally unsubscribe from a password reset you're waiting on.
 */
router.get('/unsubscribe', async (req, res) => {
  const userId = verifyUnsubscribeToken(req.query.token || '');
  const page = (title, message) => `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>${title} — ${branding.brandName}</title></head>
<body style="font-family:Arial,Helvetica,sans-serif; background:#F3F4F6; margin:0; padding:48px 16px;">
  <div style="max-width:480px; margin:0 auto; background:#fff; border-radius:12px; padding:32px; text-align:center;">
    <h1 style="font-size:20px; color:#0F2747; margin:0 0 12px;">${title}</h1>
    <p style="color:#667085; font-size:14px; line-height:22px; margin:0;">${message}</p>
  </div>
</body></html>`;

  if (!userId) {
    return res.status(400).type('text/html').send(page('Link expired or invalid', 'This unsubscribe link is no longer valid.'));
  }

  await query(
    `INSERT INTO notification_preferences (user_id, email_enabled, sms_enabled, in_app_enabled)
     VALUES ($1, false, true, true)
     ON CONFLICT (user_id) DO UPDATE SET email_enabled = false`,
    [userId]
  );

  res.status(200).type('text/html').send(
    page('You have been unsubscribed', "You won't receive further email notifications from JOB RUSH. You can re-enable them anytime from Settings.")
  );
});

module.exports = router;
