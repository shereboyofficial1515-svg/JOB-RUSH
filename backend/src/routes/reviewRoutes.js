const express = require('express');
const controller = require('../controllers/reviewController');
const { authenticate } = require('../middleware/authenticate');
const { requireRole, requireAdmin } = require('../middleware/authorize');
const { validateBody, createReviewSchema, reportReviewSchema, hideReviewSchema } = require('../validators/reviewDisputeValidators');

const router = express.Router();

router.get('/worker/:workerUserId', controller.listForWorker); // public

router.use(authenticate);
router.post('/', requireRole('hirer'), validateBody(createReviewSchema), controller.create);
router.post('/:id/report', validateBody(reportReviewSchema), controller.report);

// Admin sub-router, mounted at /api/admin/reviews
const adminRouter = express.Router();
adminRouter.use(authenticate);
adminRouter.get('/reported', requireAdmin('moderation_admin'), controller.listReported);
adminRouter.post('/:id/hide', requireAdmin('moderation_admin'), validateBody(hideReviewSchema), controller.hide);

module.exports = { router, adminRouter };
