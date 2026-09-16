const express = require('express');
const controller = require('../controllers/adminRoleController');
const { authenticate } = require('../middleware/authenticate');
const { requireAdmin } = require('../middleware/authorize');
const { validateBody, grantAdminRoleSchema } = require('../validators/adminValidators');

// Granting/revoking admin access is the single most sensitive
// administrative action in the app — restricted to super_admin only,
// not the usual "any admin role" pattern requireAdmin() allows.
const router = express.Router();
router.use(authenticate);
router.use(requireAdmin('super_admin'));

router.get('/', controller.list);
router.post('/', validateBody(grantAdminRoleSchema), controller.grant);
router.post('/:id/revoke', controller.revoke);

module.exports = router;
