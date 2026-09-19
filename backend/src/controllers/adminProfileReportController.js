const profileReportService = require('../services/profileReportService');
const asyncHandler = require('../utils/asyncHandler');

const listReported = asyncHandler(async (req, res) => {
  const profiles = await profileReportService.listReportedProfiles();
  res.status(200).json({ profiles });
});

const getReports = asyncHandler(async (req, res) => {
  const reports = await profileReportService.getReportsForUser(req.params.userId);
  res.status(200).json({ reports });
});

module.exports = { listReported, getReports };
