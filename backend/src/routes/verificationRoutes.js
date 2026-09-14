const express = require('express');
const controller = require('../controllers/verificationController');
const { authenticate } = require('../middleware/authenticate');
const { requireRole, requireAdmin } = require('../middleware/authorize');
const {
  validateBody,
  submitVerificationSchema,
  rejectVerificationSchema,
} = require('../validators/profileValidators');

// Worker-facing: /api/verification
const workerRouter = express.Router();
workerRouter.post(
  '/submit',
  authenticate,
  requireRole('worker'),
  validateBody(submitVerificationSchema),
  controller.submit
);
workerRouter.get('/me', authenticate, requireRole('worker'), controller.getOwnStatus);

// Admin-facing: /api/admin/verification — verification_admin or super_admin only
const adminRouter = express.Router();
adminRouter.get('/pending', authenticate, requireAdmin('verification_admin'), controller.listPending);
adminRouter.get('/:id/documents', authenticate, requireAdmin('verification_admin'), controller.getDocuments);
adminRouter.post('/:id/approve', authenticate, requireAdmin('verification_admin'), controller.approve);
adminRouter.post(
  '/:id/reject',
  authenticate,
  requireAdmin('verification_admin'),
  validateBody(rejectVerificationSchema),
  controller.reject
);

module.exports = { workerRouter, adminRouter };
