const express = require('express');
const controller = require('../controllers/storageController');
const { authenticate } = require('../middleware/authenticate');
const { requireRole } = require('../middleware/authorize');
const { singleFile } = require('../middleware/uploadHandler');
const { uploadLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

router.post(
  '/portfolio/image',
  authenticate,
  requireRole('worker'),
  uploadLimiter,
  singleFile('file'),
  controller.uploadPortfolioImage
);

router.post(
  '/portfolio/video',
  authenticate,
  requireRole('worker'),
  uploadLimiter,
  singleFile('file'),
  controller.uploadPortfolioVideo
);

router.post(
  '/profile-picture',
  authenticate,
  uploadLimiter,
  singleFile('file'),
  controller.uploadProfilePicture
);

router.post(
  '/verification-document',
  authenticate,
  requireRole('worker'),
  uploadLimiter,
  singleFile('file'),
  controller.uploadVerificationDocument
);

router.post(
  '/chat/:mediaCategory',
  authenticate,
  uploadLimiter,
  singleFile('file'),
  controller.uploadChatMedia
);

router.post(
  '/dispute-evidence/:mediaCategory',
  authenticate,
  uploadLimiter,
  singleFile('file'),
  controller.uploadDisputeEvidence
);

module.exports = router;
