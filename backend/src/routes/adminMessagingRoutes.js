const express = require('express');
const controller = require('../controllers/adminMessagingController');
const { authenticate } = require('../middleware/authenticate');
const { requireAdmin } = require('../middleware/authorize');
const { validateBody, removeMessageSchema } = require('../validators/adminValidators');

// Mounted at /api/admin/messaging. Deliberately narrow: reported
// messages only, never a general "browse all conversations" — see
// adminMessagingService for why even reading this list is audited.
const router = express.Router();
router.use(authenticate);
router.use(requireAdmin('moderation_admin'));

router.get('/reported', controller.listReportedMessages);
router.post('/messages/:messageId/remove', validateBody(removeMessageSchema), controller.removeMessage);

module.exports = router;
