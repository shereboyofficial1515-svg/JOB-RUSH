const express = require('express');
const controller = require('../controllers/applicationController');
const { authenticate } = require('../middleware/authenticate');
const { requireRole } = require('../middleware/authorize');
const { validateBody, respondToInvitationSchema } = require('../validators/jobValidators');

const router = express.Router();

router.get('/me', authenticate, requireRole('worker'), controller.listOwn);

router.post('/:id/withdraw', authenticate, requireRole('worker'), controller.withdraw);
router.post(
  '/:id/respond',
  authenticate,
  requireRole('worker'),
  validateBody(respondToInvitationSchema),
  controller.respond
);

router.post('/:id/shortlist', authenticate, requireRole('hirer'), controller.shortlist);
router.post('/:id/reject', authenticate, requireRole('hirer'), controller.reject);
router.post('/:id/hire', authenticate, requireRole('hirer'), controller.hire);

module.exports = router;
