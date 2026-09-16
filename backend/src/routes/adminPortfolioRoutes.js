const express = require('express');
const controller = require('../controllers/adminPortfolioController');
const { authenticate } = require('../middleware/authenticate');
const { requireAdmin } = require('../middleware/authorize');
const { validateBody, hidePortfolioSchema } = require('../validators/adminValidators');

// Mounted at /api/admin/portfolio. Literal paths (/reported) must
// come before the bare /:id route below, same reasoning as jobs.
const router = express.Router();
router.use(authenticate);
router.use(requireAdmin('moderation_admin'));

router.get('/reported', controller.listReported);
router.get('/', controller.listAll);
router.get('/:id/reports', controller.getReports);
router.post('/:id/hide', validateBody(hidePortfolioSchema), controller.hide);
router.post('/:id/restore', controller.restore);
router.get('/:id', controller.getDetail);

module.exports = router;
