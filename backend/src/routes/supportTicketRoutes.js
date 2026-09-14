const express = require('express');
const controller = require('../controllers/supportTicketController');
const { authenticate } = require('../middleware/authenticate');
const { requireAdmin } = require('../middleware/authorize');
const { validateBody, createTicketSchema, respondTicketSchema } = require('../validators/adminValidators');

// User-facing: mounted at /api/support/tickets
const router = express.Router();
router.use(authenticate);
router.post('/', validateBody(createTicketSchema), controller.create);
router.get('/', controller.listOwn);
router.get('/:id', controller.getOwn);

// Admin-facing: mounted at /api/admin/support/tickets
const adminRouter = express.Router();
adminRouter.use(authenticate);
adminRouter.use(requireAdmin('support_admin'));
adminRouter.get('/', controller.listForAdmin);
adminRouter.get('/:id', controller.getForAdmin);
adminRouter.post('/:id/respond', validateBody(respondTicketSchema), controller.respond);

module.exports = { router, adminRouter };
