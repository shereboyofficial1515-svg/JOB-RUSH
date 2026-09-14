const express = require('express');
const controller = require('../controllers/adminUserController');
const { authenticate } = require('../middleware/authenticate');
const { requireAdmin } = require('../middleware/authorize');
const { validateBody, suspendUserSchema, disableUserSchema } = require('../validators/adminValidators');

const router = express.Router();
router.use(authenticate);

router.get('/', requireAdmin('support_admin'), controller.search);
router.get('/:id', requireAdmin('support_admin'), controller.getById);
router.post('/:id/suspend', requireAdmin('support_admin'), validateBody(suspendUserSchema), controller.suspend);
router.post('/:id/disable', requireAdmin('support_admin'), validateBody(disableUserSchema), controller.disable);
router.post('/:id/reactivate', requireAdmin('support_admin'), controller.reactivate);

module.exports = router;
