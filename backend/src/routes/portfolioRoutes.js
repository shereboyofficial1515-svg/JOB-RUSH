const express = require('express');
const controller = require('../controllers/portfolioController');
const adminPortfolioController = require('../controllers/adminPortfolioController');
const { authenticate, attachUserIfPresent } = require('../middleware/authenticate');
const { requireRole } = require('../middleware/authorize');
const {
  validateBody,
  createPortfolioSchema,
  updatePortfolioSchema,
  addPortfolioMediaSchema,
  reorderPortfolioMediaSchema,
} = require('../validators/profileValidators');
const { reportPortfolioSchema } = require('../validators/adminValidators');

const router = express.Router();

router.get('/worker/:workerUserId', controller.listForWorker); // public
router.get('/me', authenticate, requireRole('worker'), controller.listOwn);
// Must come after the two literal-path routes above — a bare :id
// param route registered first would swallow /me and /worker/... too.
router.get('/:id', attachUserIfPresent, controller.getById); // public (Portfolio Project Details)

router.post('/', authenticate, requireRole('worker'), validateBody(createPortfolioSchema), controller.create);
router.patch('/:id', authenticate, requireRole('worker'), validateBody(updatePortfolioSchema), controller.update);
router.delete('/:id', authenticate, requireRole('worker'), controller.remove);

router.post(
  '/:id/media',
  authenticate,
  requireRole('worker'),
  validateBody(addPortfolioMediaSchema),
  controller.addMedia
);
router.delete('/:id/media/:mediaId', authenticate, requireRole('worker'), controller.removeMedia);
router.patch(
  '/:id/media/reorder',
  authenticate,
  requireRole('worker'),
  validateBody(reorderPortfolioMediaSchema),
  controller.reorderMedia
);
router.patch('/:id/media/:mediaId/primary', authenticate, requireRole('worker'), controller.setPrimaryMedia);

router.post('/:id/report', authenticate, validateBody(reportPortfolioSchema), adminPortfolioController.report);

module.exports = router;
