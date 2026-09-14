const express = require('express');
const controller = require('../controllers/jobReportController');
const { authenticate } = require('../middleware/authenticate');
const { requireAdmin } = require('../middleware/authorize');
const { validateBody, reportJobSchema, adminRemoveJobSchema } = require('../validators/adminValidators');

// User-facing: mounted at /api/jobs
const userRouter = express.Router();
userRouter.post('/:jobId/report', authenticate, validateBody(reportJobSchema), controller.report);

// Admin-facing: mounted at /api/admin/jobs
const adminRouter = express.Router();
adminRouter.use(authenticate);
adminRouter.use(requireAdmin('moderation_admin'));
adminRouter.get('/reported', controller.listReported);
adminRouter.get('/:jobId/reports', controller.getReports);
adminRouter.post('/:jobId/remove', validateBody(adminRemoveJobSchema), controller.remove);

module.exports = { userRouter, adminRouter };
