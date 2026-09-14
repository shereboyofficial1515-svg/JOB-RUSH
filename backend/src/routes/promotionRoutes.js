const express = require('express');
const controller = require('../controllers/promotionController');
const { authenticate } = require('../middleware/authenticate');
const { requireAdmin } = require('../middleware/authorize');
const { validateBody, createPlacementSchema } = require('../validators/adminValidators');

// Public: mounted at /api/promotions
const router = express.Router();
router.get('/:placementType', controller.listActive);

// Admin-facing: mounted at /api/admin/promotions
const adminRouter = express.Router();
adminRouter.use(authenticate);
adminRouter.use(requireAdmin('content_admin'));
adminRouter.get('/', controller.listForAdmin);
adminRouter.post('/', validateBody(createPlacementSchema), controller.create);
adminRouter.delete('/:id', controller.remove);

module.exports = { router, adminRouter };
