const { query } = require('../config/db');
const env = require('../config/env');
const logger = require('../utils/logger');

let messaging = null;
const isConfigured = !!env.FIREBASE_SERVICE_ACCOUNT_JSON;

if (isConfigured) {
  try {
    const admin = require('firebase-admin');
    const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
    const app = admin.apps.length ? admin.app() : admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    messaging = admin.messaging(app);
  } catch (err) {
    logger.error('FIREBASE_SERVICE_ACCOUNT_JSON is set but invalid — FCM push disabled.', { error: err.message });
  }
} else {
  logger.warn('FIREBASE_SERVICE_ACCOUNT_JSON is not set — FCM (Android app) push is disabled (web push / in-app / email / SMS still work).');
}

async function registerToken(userId, token) {
  if (!token) throw new Error('Missing FCM token.');
  await query(
    `INSERT INTO device_push_tokens (user_id, platform, token)
     VALUES ($1, 'android', $2)
     ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, last_used_at = now()`,
    [userId, token]
  );
}

async function unregisterToken(userId, token) {
  await query('DELETE FROM device_push_tokens WHERE user_id = $1 AND token = $2', [userId, token]);
}

/**
 * Sends a DATA-ONLY message (no `notification` block) to every Android
 * device the user is registered on. Data-only is deliberate: it's
 * delivered straight to JobRushFirebaseMessagingService.onMessageReceived()
 * even while the app is backgrounded or killed, so the app itself
 * decides how to present it (a normal notification for a new message,
 * or the full incoming-call UI + ringtone + foreground service for a
 * call) — a `notification` block would instead be auto-displayed by
 * the OS with no way to attach the call-answer/reject action or start
 * the foreground service that keeps the ringtone playing.
 *
 * Mirrors pushService.sendPushToUser's error handling: never throws,
 * and a token FCM reports as invalid/unregistered is deleted so it
 * isn't retried forever.
 */
async function sendDataToUser(userId, data) {
  if (!isConfigured || !messaging) return { sent: 0, skipped: 'not_configured' };

  const { rows: devices } = await query('SELECT * FROM device_push_tokens WHERE user_id = $1', [userId]);
  if (devices.length === 0) return { sent: 0, skipped: 'no_devices' };

  const stringData = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)]));

  let sent = 0;
  await Promise.all(
    devices.map(async (device) => {
      try {
        await messaging.send({
          token: device.token,
          data: stringData,
          android: {
            // High priority so the OS wakes the app for a data-only
            // message even in Doze — required for the incoming-call
            // case, where late delivery means a missed call.
            priority: 'high',
          },
        });
        sent += 1;
        await query('UPDATE device_push_tokens SET last_used_at = now() WHERE id = $1', [device.id]);
      } catch (err) {
        if (err.code === 'messaging/registration-token-not-registered' || err.code === 'messaging/invalid-registration-token') {
          await query('DELETE FROM device_push_tokens WHERE id = $1', [device.id]);
        } else {
          logger.error('FCM send failed', { userId, error: err.message, code: err.code });
        }
      }
    })
  );
  return { sent };
}

module.exports = { isConfigured, registerToken, unregisterToken, sendDataToUser };
