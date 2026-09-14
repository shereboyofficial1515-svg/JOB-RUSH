const express = require('express');
const controller = require('../controllers/walletController');
const settingsController = require('../controllers/platformSettingsController');
const { authenticate } = require('../middleware/authenticate');
const { requireRole, requireAdmin } = require('../middleware/authorize');
const {
  validateBody,
  requestWithdrawalSchema,
  rejectWithdrawalSchema,
  updateFeePercentSchema,
} = require('../validators/paymentValidators');

const router = express.Router();

router.use(authenticate);

router.get('/', controller.getOwnWallet);
router.get('/transactions', controller.getOwnTransactions);

router.post('/withdrawals', requireRole('worker'), validateBody(requestWithdrawalSchema), controller.requestWithdrawal);
router.get('/withdrawals', requireRole('worker'), controller.listOwnWithdrawals);
router.get('/withdrawals/:id', requireRole('worker'), controller.getOwnWithdrawal);

// Admin sub-router, mounted separately at /api/admin/finance in server.js
const adminRouter = express.Router();
adminRouter.use(authenticate);
adminRouter.get('/withdrawals/pending', requireAdmin('finance_admin'), controller.listPendingWithdrawals);
adminRouter.post('/withdrawals/:id/approve', requireAdmin('finance_admin'), controller.approveWithdrawal);
adminRouter.post(
  '/withdrawals/:id/reject',
  requireAdmin('finance_admin'),
  validateBody(rejectWithdrawalSchema),
  controller.rejectWithdrawal
);
adminRouter.get('/settings', requireAdmin('finance_admin'), settingsController.getSettings);
adminRouter.patch(
  '/settings/fee',
  requireAdmin('finance_admin'),
  validateBody(updateFeePercentSchema),
  settingsController.updateFeePercent
);

module.exports = { router, adminRouter };
