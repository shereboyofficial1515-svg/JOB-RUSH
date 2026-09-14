const express = require('express');
const controller = require('../controllers/profileController');
const { authenticate, attachUserIfPresent } = require('../middleware/authenticate');
const { requireRole } = require('../middleware/authorize');
const {
  validateBody,
  updateWorkerProfileSchema,
  updateHirerProfileSchema,
} = require('../validators/profileValidators');

const router = express.Router();

// Public profile views — /search and /me must come before /:userId, or
// Express matches them as :userId ("me"/"search") and the DB throws on
// the non-UUID value.
router.get('/worker/search', controller.searchWorkers);

// Own-profile management — identity comes from the session, not the URL
router.get('/worker/me', authenticate, requireRole('worker'), controller.getOwnWorkerProfile);
router.patch(
  '/worker/me',
  authenticate,
  requireRole('worker'),
  validateBody(updateWorkerProfileSchema),
  controller.updateOwnWorkerProfile
);

router.get('/hirer/me', authenticate, requireRole('hirer'), controller.getOwnHirerProfile);
router.patch(
  '/hirer/me',
  authenticate,
  requireRole('hirer'),
  validateBody(updateHirerProfileSchema),
  controller.updateOwnHirerProfile
);

router.get('/worker/:userId', attachUserIfPresent, controller.getWorkerProfile);
router.get('/hirer/:userId', controller.getHirerProfile);

module.exports = router;
