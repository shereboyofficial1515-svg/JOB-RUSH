const applicationService = require('../services/applicationService');
const asyncHandler = require('../utils/asyncHandler');

/** POST /api/jobs/:jobId/applications — worker applies to an open job */
const apply = asyncHandler(async (req, res) => {
  const application = await applicationService.applyToJob(req.user.id, req.params.jobId, req.body);
  res.status(201).json({ application });
});

/** GET /api/jobs/:jobId/applications — hirer reviews applicants to their own job */
const listForJob = asyncHandler(async (req, res) => {
  const applications = await applicationService.listApplicationsForJob(req.params.jobId, req.user.id);
  res.status(200).json({ applications });
});

/** POST /api/jobs/:jobId/invitations — hirer invites a specific worker */
const invite = asyncHandler(async (req, res) => {
  const application = await applicationService.inviteWorkerToJob(
    req.user.id,
    req.params.jobId,
    req.body.workerUserId
  );
  res.status(201).json({ application });
});

/** GET /api/applications/me — worker's own applications/invitations */
const listOwn = asyncHandler(async (req, res) => {
  const applications = await applicationService.listApplicationsForWorker(req.user.id);
  res.status(200).json({ applications });
});

/** POST /api/applications/:id/withdraw — worker */
const withdraw = asyncHandler(async (req, res) => {
  const application = await applicationService.withdrawApplication(req.params.id, req.user.id);
  res.status(200).json({ application });
});

/** POST /api/applications/:id/respond — worker accepts/declines an invitation */
const respond = asyncHandler(async (req, res) => {
  const application = await applicationService.respondToInvitation(req.params.id, req.user.id, req.body.accept === true);
  res.status(200).json({ application });
});

/** POST /api/applications/:id/shortlist — hirer */
const shortlist = asyncHandler(async (req, res) => {
  const application = await applicationService.shortlistApplication(req.params.id, req.user.id);
  res.status(200).json({ application });
});

/** POST /api/applications/:id/reject — hirer */
const reject = asyncHandler(async (req, res) => {
  const application = await applicationService.rejectApplication(req.params.id, req.user.id);
  res.status(200).json({ application });
});

/** POST /api/applications/:id/hire — hirer */
const hire = asyncHandler(async (req, res) => {
  const application = await applicationService.hireApplication(req.params.id, req.user.id);
  res.status(200).json({ application });
});

module.exports = { apply, listForJob, invite, listOwn, withdraw, respond, shortlist, reject, hire };
