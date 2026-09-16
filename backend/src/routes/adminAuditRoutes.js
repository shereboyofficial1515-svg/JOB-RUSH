const express = require('express');
const controller = require('../controllers/adminAuditController');
const { authenticate } = require('../middleware/authenticate');
const { requireAdmin } = require('../middleware/authorize');

// Read-only, but restricted to super_admin: the audit trail exists to
// hold every admin accountable, including finance/verification/etc.
// admins, so it can't be a thing those same admins can browse or be
// tipped off by.
const router = express.Router();
router.use(authenticate);
router.use(requireAdmin('super_admin'));

router.get('/', controller.list);

module.exports = router;
