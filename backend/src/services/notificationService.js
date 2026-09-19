const { query } = require('../config/db');
const emailService = require('./emailService');
const smsService = require('./smsService');
const pushService = require('./pushService');
const logger = require('../utils/logger');
const { buildUnsubscribeUrl } = require('../utils/unsubscribeToken');

/**
 * Per-type channel policy. Not every notification should hit every
 * channel — a new chat message going out over SMS for every reply
 * would be spammy and costly, while an interview reminder or a
 * payment landing genuinely warrants reaching the person off-app.
 * This is a product judgment call, kept in one place so it's easy to
 * revisit rather than scattered across every call site.
 */
const CHANNEL_POLICY = {
  new_message: ['in_app', 'web_push'],
  application_submitted: ['in_app', 'email'],
  application_received: ['in_app', 'email'],
  application_status_changed: ['in_app', 'email'],
  job_invitation: ['in_app', 'email'],
  interview_scheduled: ['in_app', 'email', 'sms'],
  interview_response: ['in_app', 'email'],
  interview_reminder: ['in_app', 'email', 'sms'],
  interview_cancelled: ['in_app', 'email'],
  escrow_funded: ['in_app', 'email'],
  escrow_released: ['in_app', 'email', 'sms'],
  withdrawal_requested: ['in_app', 'email'],
  withdrawal_approved: ['in_app', 'email', 'sms'],
  withdrawal_rejected: ['in_app', 'email'],
  verification_approved: ['in_app', 'email'],
  verification_rejected: ['in_app', 'email'],
  subscription_activated: ['in_app', 'email'],
  subscription_expiring: ['in_app', 'email'],
  subscription_expired: ['in_app', 'email'],
  review_received: ['in_app', 'email'],
  dispute_opened: ['in_app', 'email'],
  dispute_resolved: ['in_app', 'email'],
  new_device_login: ['in_app', 'email'],
  contract_created: ['in_app', 'email'],
  subscription_renewed: ['in_app', 'email'],
  subscription_cancelled: ['in_app', 'email'],
  support_ticket_created: ['in_app', 'email'],
  support_ticket_updated: ['in_app', 'email'],
  account_deactivated: ['in_app', 'email'],
  announcement: ['in_app'],
};

async function getPreferences(userId) {
  const { rows } = await query('SELECT * FROM notification_preferences WHERE user_id = $1', [userId]);
  if (rows.length > 0) return rows[0];
  return { email_enabled: true, sms_enabled: true, in_app_enabled: true, push_enabled: true };
}

async function recordDelivery(notificationId, channel, status, errorMessage) {
  await query(
    `INSERT INTO notification_deliveries (notification_id, channel, status, error_message) VALUES ($1, $2, $3, $4)`,
    [notificationId, channel, status, errorMessage || null]
  ).catch((err) => logger.error('Failed to record notification delivery', { error: err.message }));
}

/**
 * Creates a notification and attempts delivery on whichever channels
 * this type's policy allows and the user hasn't disabled. Never
 * throws — a notification failure must not break the primary action
 * (a message send, a hire decision, a payment) that triggered it.
 */
async function notify(userId, type, { title, body, data, email, phone, firstName } = {}) {
  try {
    const { rows } = await query(
      `INSERT INTO notifications (user_id, type, title, body, data) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [userId, type, title, body || null, data ? JSON.stringify(data) : null]
    );
    const notification = rows[0];

    const preferences = await getPreferences(userId);
    const allowedChannels = CHANNEL_POLICY[type] || ['in_app'];

    // Shared by both the email and web-push branches below — a
    // new-message alert on either channel respects the recipient's own
    // chat_message_previews setting (Settings → Chat): with previews
    // off, neither channel quotes the message content, since a push
    // banner can be visible on a lock screen to someone other than the
    // recipient.
    let previewsEnabled = true;
    if (type === 'new_message') {
      const { rows: settingsRows } = await query(
        'SELECT chat_message_previews FROM user_settings WHERE user_id = $1',
        [userId]
      );
      previewsEnabled = settingsRows[0]?.chat_message_previews ?? true;
    }

    if (allowedChannels.includes('in_app')) {
      await recordDelivery(notification.id, 'in_app', preferences.in_app_enabled ? 'sent' : 'skipped');
    }

    if (allowedChannels.includes('email')) {
      if (!preferences.email_enabled || !email) {
        await recordDelivery(notification.id, 'email', 'skipped');
      } else {
        try {
          const emailData = { ...data, unsubscribeUrl: buildUnsubscribeUrl(userId), showPreview: previewsEnabled };

          await emailService.sendNotificationEmail({
            to: email,
            type,
            title,
            body,
            data: emailData,
            firstName,
            userId,
            relatedEntity: data?.applicationId
              ? { type: 'application', id: data.applicationId }
              : data?.contractId
              ? { type: 'contract', id: data.contractId }
              : undefined,
          });
          await recordDelivery(notification.id, 'email', 'sent');
        } catch (err) {
          await recordDelivery(notification.id, 'email', 'failed', err.message);
        }
      }
    }

    if (allowedChannels.includes('sms')) {
      if (!preferences.sms_enabled || !phone) {
        await recordDelivery(notification.id, 'sms', 'skipped');
      } else {
        try {
          await smsService.sendSms(phone, `${title}${body ? ' - ' + body : ''}`.slice(0, 160));
          await recordDelivery(notification.id, 'sms', 'sent');
        } catch (err) {
          await recordDelivery(notification.id, 'sms', 'failed', err.message);
        }
      }
    }

    if (allowedChannels.includes('web_push')) {
      if (preferences.push_enabled === false) {
        await recordDelivery(notification.id, 'web_push', 'skipped');
      } else {
        try {
          // Tagged by notification id so a device that already showed
          // this alert never shows a second, duplicate one for it —
          // the Notification API replaces same-tag notifications
          // instead of stacking them.
          const pushBody = type === 'new_message' && !previewsEnabled ? 'Sent you a message' : body;
          const result = await pushService.sendPushToUser(userId, {
            title,
            body: pushBody,
            data: { ...data, notificationId: notification.id, type },
            tag: `notification-${notification.id}`,
          });
          await recordDelivery(notification.id, 'web_push', result.sent > 0 ? 'sent' : 'skipped');
        } catch (err) {
          await recordDelivery(notification.id, 'web_push', 'failed', err.message);
        }
      }
    }

    return notification;
  } catch (err) {
    logger.error('notify() failed — continuing without blocking the caller', { userId, type, error: err.message });
    return null;
  }
}

/**
 * Convenience wrapper that looks up the recipient's email/phone
 * first, so call sites don't each have to fetch the user row.
 */
async function notifyUser(userId, type, { title, body, data } = {}) {
  const { rows } = await query('SELECT email, phone, full_name FROM users WHERE id = $1', [userId]);
  const user = rows[0];
  return notify(userId, type, {
    title,
    body,
    data,
    email: user?.email,
    phone: user?.phone,
    firstName: user?.full_name?.split(' ')[0],
  });
}

async function listForUser(userId, { unreadOnly = false, page = 1, pageSize = 30 } = {}) {
  const limit = Math.min(Math.max(pageSize, 1), 100);
  const offset = (Math.max(page, 1) - 1) * limit;
  const params = [userId];
  let sql = 'SELECT * FROM notifications WHERE user_id = $1';
  if (unreadOnly) sql += ' AND read_at IS NULL';
  params.push(limit, offset);
  sql += ` ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;
  const { rows } = await query(sql, params);
  return rows;
}

async function getUnreadCount(userId) {
  const { rows } = await query('SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL', [userId]);
  return rows[0].count;
}

async function markRead(notificationId, userId) {
  await query('UPDATE notifications SET read_at = now() WHERE id = $1 AND user_id = $2 AND read_at IS NULL', [
    notificationId,
    userId,
  ]);
}

async function markAllRead(userId) {
  await query('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL', [userId]);
}

async function updatePreferences(userId, { emailEnabled, smsEnabled, inAppEnabled, pushEnabled }) {
  const current = await getPreferences(userId);
  const { rows } = await query(
    `INSERT INTO notification_preferences (user_id, email_enabled, sms_enabled, in_app_enabled, push_enabled)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id) DO UPDATE SET
       email_enabled = EXCLUDED.email_enabled,
       sms_enabled = EXCLUDED.sms_enabled,
       in_app_enabled = EXCLUDED.in_app_enabled,
       push_enabled = EXCLUDED.push_enabled
     RETURNING *`,
    [
      userId,
      emailEnabled,
      smsEnabled,
      inAppEnabled,
      pushEnabled === undefined ? (current.push_enabled ?? true) : pushEnabled,
    ]
  );
  return rows[0];
}

module.exports = {
  notify,
  notifyUser,
  listForUser,
  getUnreadCount,
  markRead,
  markAllRead,
  getPreferences,
  updatePreferences,
};
