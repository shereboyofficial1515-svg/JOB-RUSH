const express = require('express');
const controller = require('../controllers/jobReportController');
const { authenticate } = require('../middleware/authenticate');
const { requireAdmin } = require('../middleware/authorize');
const { validateBody, reportJobSchema, adminRemoveJobSchema, hideJobSchema } = require('../validators/adminValidators');

// User-facing: mounted at /api/jobs
const userRouter = express.Router();
userRouter.post('/:jobId/report', authenticate, validateBody(reportJobSchema), controller.report);

// Admin-facing: mounted at /api/admin/jobs. Literal paths (/reported)
// must be registered before the bare /:jobId route below, or Express
// would match "reported" as a jobId first.
const adminRouter = express.Router();
adminRouter.use(authenticate);
adminRouter.use(requireAdmin('moderation_admin'));
adminRouter.get('/reported', controller.listReported);
adminRouter.get('/', controller.listAll);
adminRouter.get('/:jobId/reports', controller.getReports);
adminRouter.post('/:jobId/remove', validateBody(adminRemoveJobSchema), controller.remove);
adminRouter.post('/:jobId/hide', validateBody(hideJobSchema), controller.hide);
adminRouter.post('/:jobId/restore', controller.restore);
adminRouter.get('/:jobId', controller.getDetail);

module.exports = { userRouter, adminRouter };
