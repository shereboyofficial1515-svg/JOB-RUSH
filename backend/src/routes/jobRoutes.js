const express = require('express');
const jobController = require('../controllers/jobController');
const applicationController = require('../controllers/applicationController');
const savedItemsController = require('../controllers/savedItemsController');
const smartMatchController = require('../controllers/smartMatchController');
const { authenticate } = require('../middleware/authenticate');
const { requireRole } = require('../middleware/authorize');
const {
  validateBody,
  validateQuery,
  createJobSchema,
  updateJobSchema,
  jobStatusSchema,
  jobSearchSchema,
  applyToJobSchema,
  inviteWorkerSchema,
} = require('../validators/jobValidators');

const router = express.Router();

// Public
router.get('/', validateQuery(jobSearchSchema), jobController.search);

// Hirer's own postings, and smart-match recommendations — must come
// before '/:id' so these aren't parsed as a job ID.
router.get('/mine', authenticate, requireRole('hirer'), jobController.listOwn);
router.get('/recommended', authenticate, requireRole('worker'), smartMatchController.recommendedJobs);

router.get('/:id', jobController.getById);
router.get('/:jobId/recommended-workers', authenticate, requireRole('hirer'), smartMatchController.recommendedWorkers);

// Hirer-only mutations — ownership re-checked inside jobService regardless of role
router.post('/', authenticate, requireRole('hirer'), validateBody(createJobSchema), jobController.create);
router.patch('/:id', authenticate, requireRole('hirer'), validateBody(updateJobSchema), jobController.update);
router.post('/:id/status', authenticate, requireRole('hirer'), validateBody(jobStatusSchema), jobController.setStatus);

// Applications nested under a job
router.post(
  '/:jobId/applications',
  authenticate,
  requireRole('worker'),
  validateBody(applyToJobSchema),
  applicationController.apply
);
router.get('/:jobId/applications', authenticate, requireRole('hirer'), applicationController.listForJob);
router.post(
  '/:jobId/invitations',
  authenticate,
  requireRole('hirer'),
  validateBody(inviteWorkerSchema),
  applicationController.invite
);

// Saved jobs (worker)
router.post('/:jobId/save', authenticate, requireRole('worker'), savedItemsController.saveJob);
router.delete('/:jobId/save', authenticate, requireRole('worker'), savedItemsController.unsaveJob);

module.exports = router;
