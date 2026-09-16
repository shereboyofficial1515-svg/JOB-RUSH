const jobService = require('../services/jobService');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { toSnakeCaseJobInput } = require('../validators/jobValidators');

/** GET /api/jobs — public search */
const search = asyncHandler(async (req, res) => {
  const jobs = await jobService.searchJobs(req.query);
  res.status(200).json({ jobs });
});

/**
 * GET /api/jobs/:id — public detail. A job an admin has hidden (e.g.
 * under investigation for a report) gets the same 404 as one that
 * doesn't exist — this is a fully anonymous route with no viewer
 * context to check an exception against, so it can't confirm the
 * job's existence to whoever still has the link.
 */
const getById = asyncHandler(async (req, res) => {
  const job = await jobService.getJobById(req.params.id);
  if (!job || job.hidden) throw new AppError('Job not found.', 404, 'NOT_FOUND');
  res.status(200).json({ job });
});

/** GET /api/jobs/mine — hirer's own postings */
const listOwn = asyncHandler(async (req, res) => {
  const jobs = await jobService.listJobsForHirer(req.user.id, req.query.status);
  res.status(200).json({ jobs });
});

/** POST /api/jobs — hirer_user_id is always req.user.id */
const create = asyncHandler(async (req, res) => {
  const input = toSnakeCaseJobInput(req.body);
  const job = await jobService.createJob(req.user.id, input);
  res.status(201).json({ job });
});

/** PATCH /api/jobs/:id — ownership enforced inside the service */
const update = asyncHandler(async (req, res) => {
  const input = toSnakeCaseJobInput(req.body);
  const job = await jobService.updateJob(req.params.id, req.user.id, input);
  res.status(200).json({ job });
});

/** POST /api/jobs/:id/status */
const setStatus = asyncHandler(async (req, res) => {
  const job = await jobService.setJobStatus(req.params.id, req.user.id, req.body.status);
  res.status(200).json({ job });
});

module.exports = { search, getById, listOwn, create, update, setStatus };
