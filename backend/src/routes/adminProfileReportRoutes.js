const express = require('express');
const controller = require('../controllers/adminProfileReportController');
const { authenticate } = require('../middleware/authenticate');
const { requireAdmin } = require('../middleware/authorize');

const router = express.Router();
router.use(authenticate, requireAdmin('moderation_admin'));

// Mounted at /api/admin/profile-reports. Literal path (/reported) must
// come before /:userId/reports, or Express treats "reported" as a userId.
router.get('/reported', controller.listReported);
router.get('/:userId/reports', controller.getReports);

module.exports = router;
