const smartMatchService = require('../services/smartMatchService');
const jobService = require('../services/jobService');
const asyncHandler = require('../utils/asyncHandler');

/** GET /api/jobs/recommended — worker only */
const recommendedJobs = asyncHandler(async (req, res) => {
  const jobs = await smartMatchService.recommendJobsForWorker(req.user.id);
  res.status(200).json({ jobs });
});

/** GET /api/jobs/:jobId/recommended-workers — hirer, must own the job */
const recommendedWorkers = asyncHandler(async (req, res) => {
  await jobService.getOwnedJob(req.params.jobId, req.user.id); // throws if not owned
  const workers = await smartMatchService.recommendWorkersForJob(req.params.jobId);
  res.status(200).json({ workers });
});

module.exports = { recommendedJobs, recommendedWorkers };
