const express = require('express');
const controller = require('../controllers/notificationController');
const { authenticate } = require('../middleware/authenticate');
const {
  validateBody,
  updatePreferencesSchema,
  pushSubscribeSchema,
  pushUnsubscribeSchema,
  fcmTokenSchema,
} = require('../validators/notificationValidators');

const router = express.Router();
router.use(authenticate);

router.get('/', controller.list);
router.get('/unread-count', controller.unreadCount);
router.post('/:id/read', controller.markRead);
router.post('/read-all', controller.markAllRead);
router.get('/preferences', controller.getPreferences);
router.patch('/preferences', validateBody(updatePreferencesSchema), controller.updatePreferences);

router.get('/push/public-key', controller.getPushPublicKey);
router.post('/push/subscribe', validateBody(pushSubscribeSchema), controller.pushSubscribe);
router.post('/push/unsubscribe', validateBody(pushUnsubscribeSchema), controller.pushUnsubscribe);

// Android app only (FCM) — separate token shape from the web-push
// subscribe/unsubscribe pair above, same authenticate-then-store shape.
router.post('/push/fcm-token', validateBody(fcmTokenSchema), controller.registerFcmToken);
router.delete('/push/fcm-token', validateBody(fcmTokenSchema), controller.unregisterFcmToken);

module.exports = router;
