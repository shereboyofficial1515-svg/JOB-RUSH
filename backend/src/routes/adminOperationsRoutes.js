const express = require('express');
const controller = require('../controllers/adminOperationsController');
const { authenticate } = require('../middleware/authenticate');
const { requireAdmin } = require('../middleware/authorize');

// Mounted at /api/admin/operations. Read-only visibility into
// applications/interviews/contracts/calls for investigating
// user-reported problems — same role as disputes/support tickets,
// since that's exactly the kind of investigation this supports.
const router = express.Router();
router.use(authenticate);
router.use(requireAdmin('support_admin'));

router.get('/applications', controller.listApplications);
router.get('/applications/:id', controller.getApplication);
router.get('/interviews', controller.listInterviews);
router.get('/interviews/:id', controller.getInterview);
router.get('/contracts', controller.listContracts);
router.get('/contracts/:id', controller.getContract);
router.get('/calls', controller.listCalls);

module.exports = router;
