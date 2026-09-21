const express = require('express');
const controller = require('../controllers/profileController');
const extras = require('../controllers/profileExtrasController');
const { authenticate, attachUserIfPresent } = require('../middleware/authenticate');
const { requireRole } = require('../middleware/authorize');
const {
  validateBody,
  updateWorkerProfileSchema,
  updateHirerProfileSchema,
  createWorkExperienceSchema,
  updateWorkExperienceSchema,
  reorderWorkExperienceSchema,
  createEducationSchema,
  updateEducationSchema,
  reorderEducationSchema,
  updateCvSchema,
  updateCvVisibilitySchema,
  upsertBusinessProfileSchema,
  addBusinessMediaSchema,
  createProfessionalServiceSchema,
  updateProfessionalServiceSchema,
  reportProfileSchema,
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

// ---------- Work experience (own, worker-only) ----------
router.get('/worker/me/experience', authenticate, requireRole('worker'), extras.listOwnExperience);
router.post(
  '/worker/me/experience',
  authenticate,
  requireRole('worker'),
  validateBody(createWorkExperienceSchema),
  extras.createExperience
);
router.post('/worker/me/experience/reorder', authenticate, requireRole('worker'), validateBody(reorderWorkExperienceSchema), extras.reorderExperience);
router.patch(
  '/worker/me/experience/:id',
  authenticate,
  requireRole('worker'),
  validateBody(updateWorkExperienceSchema),
  extras.updateExperience
);
router.delete('/worker/me/experience/:id', authenticate, requireRole('worker'), extras.deleteExperience);

// ---------- Education (own, worker-only) ----------
router.get('/worker/me/education', authenticate, requireRole('worker'), extras.listOwnEducation);
router.post(
  '/worker/me/education',
  authenticate,
  requireRole('worker'),
  validateBody(createEducationSchema),
  extras.createEducation
);
router.post('/worker/me/education/reorder', authenticate, requireRole('worker'), validateBody(reorderEducationSchema), extras.reorderEducation);
router.patch(
  '/worker/me/education/:id',
  authenticate,
  requireRole('worker'),
  validateBody(updateEducationSchema),
  extras.updateEducation
);
router.delete('/worker/me/education/:id', authenticate, requireRole('worker'), extras.deleteEducation);

// ---------- CV / résumé (own, worker-only) ----------
router.get('/worker/me/cv', authenticate, requireRole('worker'), extras.getOwnCv);
router.put('/worker/me/cv', authenticate, requireRole('worker'), validateBody(updateCvSchema), extras.upsertCv);
router.patch(
  '/worker/me/cv/visibility',
  authenticate,
  requireRole('worker'),
  validateBody(updateCvVisibilitySchema),
  extras.updateCvVisibility
);
router.delete('/worker/me/cv', authenticate, requireRole('worker'), extras.deleteCv);

// ---------- Business profile (own, worker-only) ----------
router.get('/worker/me/business', authenticate, requireRole('worker'), extras.getOwnBusinessProfile);
router.put(
  '/worker/me/business',
  authenticate,
  requireRole('worker'),
  validateBody(upsertBusinessProfileSchema),
  extras.upsertBusinessProfile
);
router.delete('/worker/me/business', authenticate, requireRole('worker'), extras.deleteBusinessProfile);
router.post(
  '/worker/me/business/media',
  authenticate,
  requireRole('worker'),
  validateBody(addBusinessMediaSchema),
  extras.addBusinessMedia
);
router.delete('/worker/me/business/media/:id', authenticate, requireRole('worker'), extras.removeBusinessMedia);

// ---------- Professional services (own, worker-only) ----------
router.get('/worker/me/services', authenticate, requireRole('worker'), extras.listOwnServices);
router.post(
  '/worker/me/services',
  authenticate,
  requireRole('worker'),
  validateBody(createProfessionalServiceSchema),
  extras.createService
);
router.patch(
  '/worker/me/services/:id',
  authenticate,
  requireRole('worker'),
  validateBody(updateProfessionalServiceSchema),
  extras.updateService
);
router.delete('/worker/me/services/:id', authenticate, requireRole('worker'), extras.deleteService);

// ---------- Public reads for another worker's experience/education/cv/business/services ----------
router.get('/worker/:userId/experience', extras.listExperienceForWorker);
router.get('/worker/:userId/education', extras.listEducationForWorker);
router.get('/worker/:userId/cv', attachUserIfPresent, extras.getCvForWorker);
router.get('/worker/:userId/business', extras.getBusinessProfileForWorker);
router.get('/worker/:userId/services', extras.listServicesForWorker);

// ---------- Report a profile (any authenticated user) ----------
router.post('/:userId/report', authenticate, validateBody(reportProfileSchema), extras.reportProfile);

router.get('/worker/:userId', attachUserIfPresent, controller.getWorkerProfile);
router.get('/hirer/:userId', attachUserIfPresent, controller.getHirerProfile);

module.exports = router;
