const express = require('express');
const controller = require('../controllers/portfolioController');
const { authenticate } = require('../middleware/authenticate');
const { requireRole } = require('../middleware/authorize');
const {
  validateBody,
  createPortfolioSchema,
  updatePortfolioSchema,
  addPortfolioMediaSchema,
  reorderPortfolioMediaSchema,
} = require('../validators/profileValidators');

const router = express.Router();

router.get('/worker/:workerUserId', controller.listForWorker); // public
router.get('/me', authenticate, requireRole('worker'), controller.listOwn);

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

module.exports = router;
