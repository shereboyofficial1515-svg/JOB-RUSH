const express = require('express');
const controller = require('../controllers/escrowController');
const { authenticate } = require('../middleware/authenticate');
const { requireRole, requireAdmin } = require('../middleware/authorize');
const {
  validateBody,
  initiateFundingSchema,
  refundEscrowSchema,
} = require('../validators/paymentValidators');

const router = express.Router();

router.use(authenticate);

router.post('/fund', requireRole('hirer'), validateBody(initiateFundingSchema), controller.initiateFunding);
router.get('/verify/:reference', requireRole('hirer'), controller.verifyFunding);
router.post('/:id/release', requireRole('hirer'), controller.releaseEscrow);
router.get('/contract/:contractId', controller.getForContract);

// Real money movement back to the payer — admin-only, not reachable by either party directly.
router.post('/:id/refund', requireAdmin('finance_admin'), validateBody(refundEscrowSchema), controller.refundEscrow);

module.exports = router;
