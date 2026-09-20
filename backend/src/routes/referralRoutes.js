const express = require('express');
const controller = require('../controllers/referralController');
const adminController = require('../controllers/adminReferralController');
const { authenticate } = require('../middleware/authenticate');
const { requireAdmin } = require('../middleware/authorize');
const { validateBody, submitFeedbackSchema, rejectRewardSchema } = require('../validators/referralValidators');

const router = express.Router();
router.use(authenticate);

router.get('/me', controller.getDashboard);
router.get('/my-status', controller.getMyReferralStatus);
router.post('/feedback', validateBody(submitFeedbackSchema), controller.submitFeedback);

// Admin sub-router, mounted separately at /api/admin/referrals in
// server.js — same finance_admin gate the wallet/withdrawal admin
// routes already use, since approving/paying a reward is a real
// money decision, not just a moderation one.
const adminRouter = express.Router();
adminRouter.use(authenticate);
adminRouter.get('/', requireAdmin('finance_admin'), adminController.listReferrers);
adminRouter.get('/:referrerUserId/detail', requireAdmin('finance_admin'), adminController.getReferrerDetail);
adminRouter.get('/rewards', requireAdmin('finance_admin'), adminController.listRewards);
adminRouter.post('/rewards/:id/approve', requireAdmin('finance_admin'), adminController.approveReward);
adminRouter.post('/rewards/:id/reject', requireAdmin('finance_admin'), validateBody(rejectRewardSchema), adminController.rejectReward);
adminRouter.post('/rewards/:id/mark-paid', requireAdmin('finance_admin'), adminController.markRewardPaid);

module.exports = { router, adminRouter };
