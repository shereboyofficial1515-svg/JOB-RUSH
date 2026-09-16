const express = require('express');
const controller = require('../controllers/subscriptionController');
const { authenticate } = require('../middleware/authenticate');
const { requireRole, requireAdmin } = require('../middleware/authorize');
const {
  validateBody,
  initiateSubscriptionSchema,
  suspendSubscriptionSchema,
} = require('../validators/subscriptionValidators');

const router = express.Router();
router.use(authenticate);

router.post('/', requireRole('worker'), validateBody(initiateSubscriptionSchema), controller.initiate);
router.get('/verify/:reference', requireRole('worker'), controller.verify);
router.get('/me', requireRole('worker'), controller.getOwn);
router.get('/me/payments', requireRole('worker'), controller.getOwnPaymentHistory);
router.post('/me/cancel', requireRole('worker'), controller.cancel);

// Admin sub-router, mounted at /api/admin/subscriptions
const adminRouter = express.Router();
adminRouter.use(authenticate);
adminRouter.get('/', requireAdmin('finance_admin'), controller.listForAdmin);
adminRouter.get('/revenue', requireAdmin('finance_admin'), controller.revenue);
adminRouter.post('/:id/suspend', requireAdmin('finance_admin'), validateBody(suspendSubscriptionSchema), controller.suspend);
adminRouter.post('/:id/restore', requireAdmin('finance_admin'), controller.restore);

module.exports = { router, adminRouter };
