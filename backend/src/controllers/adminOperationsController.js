const adminOperationsService = require('../services/adminOperationsService');
const asyncHandler = require('../utils/asyncHandler');

const listApplications = asyncHandler(async (req, res) => {
  const applications = await adminOperationsService.listApplicationsForAdmin(req.query);
  res.status(200).json({ applications });
});

const getApplication = asyncHandler(async (req, res) => {
  const application = await adminOperationsService.getApplicationForAdmin(req.params.id);
  res.status(200).json({ application });
});

const listInterviews = asyncHandler(async (req, res) => {
  const interviews = await adminOperationsService.listInterviewsForAdmin(req.query);
  res.status(200).json({ interviews });
});

const getInterview = asyncHandler(async (req, res) => {
  const interview = await adminOperationsService.getInterviewForAdmin(req.params.id);
  res.status(200).json({ interview });
});

const listContracts = asyncHandler(async (req, res) => {
  const contracts = await adminOperationsService.listContractsForAdmin(req.query);
  res.status(200).json({ contracts });
});

const getContract = asyncHandler(async (req, res) => {
  const contract = await adminOperationsService.getContractForAdmin(req.params.id);
  res.status(200).json({ contract });
});

const listCalls = asyncHandler(async (req, res) => {
  const calls = await adminOperationsService.listCallsForAdmin(req.query);
  res.status(200).json({ calls });
});

module.exports = {
  listApplications,
  getApplication,
  listInterviews,
  getInterview,
  listContracts,
  getContract,
  listCalls,
};
