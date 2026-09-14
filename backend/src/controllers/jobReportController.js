const jobReportService = require('../services/jobReportService');
const asyncHandler = require('../utils/asyncHandler');

const report = asyncHandler(async (req, res) => {
  const result = await jobReportService.reportJob(req.user.id, req.params.jobId, req.body.reason);
  res.status(201).json({ report: result });
});

// --- Admin ---
const listReported = asyncHandler(async (req, res) => {
  const jobs = await jobReportService.listReportedJobs();
  res.status(200).json({ jobs });
});

const getReports = asyncHandler(async (req, res) => {
  const reports = await jobReportService.getReportsForJob(req.params.jobId);
  res.status(200).json({ reports });
});

const remove = asyncHandler(async (req, res) => {
  const job = await jobReportService.adminRemoveJob(req.params.jobId, req.user.id, req.body.reason);
  res.status(200).json({ job });
});

module.exports = { report, listReported, getReports, remove };
