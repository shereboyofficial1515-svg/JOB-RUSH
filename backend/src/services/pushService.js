const webpush = require('web-push');
const { query } = require('../config/db');
const env = require('../config/env');
const logger = require('../utils/logger');

const isConfigured = !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);

if (isConfigured) {
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
} else {
  logger.warn('VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY are not set — web push is disabled (falls back to in-app/email/SMS only).');
}

function getPublicKey() {
  return isConfigured ? env.VAPID_PUBLIC_KEY : null;
}

async function subscribe(userId, subscription, userAgent) {
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    throw new Error('Invalid push subscription payload.');
  }
  const { rows } = await query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, user_agent = EXCLUDED.user_agent
     RETURNING id`,
    [userId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth, userAgent || null]
  );
  return rows[0];
}

async function unsubscribe(userId, endpoint) {
  await query('DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2', [userId, endpoint]);
}

/**
 * Sends the same payload to every device/browser the user has
 * subscribed on. Never throws — a push failure must not break the
 * message/call action that triggered it. A subscription that the push
 * service reports as permanently gone (410 Gone / 404 Not Found — the
 * user revoked permission or uninstalled) is deleted so it stops being
 * retried forever.
 */
async function sendPushToUser(userId, { title, body, data, tag, requireInteraction = false } = {}) {
  if (!isConfigured) return { sent: 0, skipped: 'not_configured' };

  const { rows: subs } = await query('SELECT * FROM push_subscriptions WHERE user_id = $1', [userId]);
  if (subs.length === 0) return { sent: 0, skipped: 'no_subscriptions' };

  const payload = JSON.stringify({ title, body, data: data || {}, tag, requireInteraction });

  let sent = 0;
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        sent += 1;
        await query('UPDATE push_subscriptions SET last_used_at = now() WHERE id = $1', [sub.id]);
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id]);
        } else {
          logger.error('Web push send failed', { userId, error: err.message, statusCode: err.statusCode });
        }
      }
    })
  );
  return { sent };
}

module.exports = { isConfigured, getPublicKey, subscribe, unsubscribe, sendPushToUser };
