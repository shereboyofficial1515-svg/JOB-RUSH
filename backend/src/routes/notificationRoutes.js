const express = require('express');
const controller = require('../controllers/notificationController');
const { authenticate } = require('../middleware/authenticate');
const {
  validateBody,
  updatePreferencesSchema,
  pushSubscribeSchema,
  pushUnsubscribeSchema,
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

module.exports = router;
