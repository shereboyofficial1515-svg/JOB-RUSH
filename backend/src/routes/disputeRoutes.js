const express = require('express');
const controller = require('../controllers/disputeController');
const { authenticate } = require('../middleware/authenticate');
const { requireAdmin } = require('../middleware/authorize');
const {
  validateBody,
  openDisputeSchema,
  addEvidenceSchema,
  updateDisputeStatusSchema,
  resolveDisputeSchema,
  rejectDisputeSchema,
} = require('../validators/reviewDisputeValidators');

const router = express.Router();
router.use(authenticate);

router.get('/', controller.listOwn);
router.post('/', validateBody(openDisputeSchema), controller.open);
router.get('/:id', controller.getById);
router.post('/:id/evidence', validateBody(addEvidenceSchema), controller.addEvidence);
router.get('/:id/evidence', controller.listEvidence);

// Admin sub-router, mounted at /api/admin/disputes
const adminRouter = express.Router();
adminRouter.use(authenticate);
adminRouter.get('/', requireAdmin('support_admin'), controller.listForAdmin);
adminRouter.get('/:id', requireAdmin('support_admin'), controller.getForAdmin);
adminRouter.get('/:id/evidence', requireAdmin('support_admin'), controller.listEvidenceForAdmin);
adminRouter.post('/:id/status', requireAdmin('support_admin'), validateBody(updateDisputeStatusSchema), controller.updateStatus);
adminRouter.post('/:id/resolve', requireAdmin('support_admin'), validateBody(resolveDisputeSchema), controller.resolve);
adminRouter.post('/:id/reject', requireAdmin('support_admin'), validateBody(rejectDisputeSchema), controller.reject);

module.exports = { router, adminRouter };
