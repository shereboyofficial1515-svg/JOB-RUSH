const adminPortfolioService = require('../services/adminPortfolioService');
const asyncHandler = require('../utils/asyncHandler');

const report = asyncHandler(async (req, res) => {
  const result = await adminPortfolioService.reportPortfolio(req.user.id, req.params.id, req.body.reason);
  res.status(201).json({ report: result });
});

// --- Admin ---
const listAll = asyncHandler(async (req, res) => {
  const portfolios = await adminPortfolioService.listPortfoliosForAdmin(req.query);
  res.status(200).json({ portfolios });
});

const listReported = asyncHandler(async (req, res) => {
  const portfolios = await adminPortfolioService.listReportedPortfolios();
  res.status(200).json({ portfolios });
});

const getReports = asyncHandler(async (req, res) => {
  const reports = await adminPortfolioService.getReportsForPortfolio(req.params.id);
  res.status(200).json({ reports });
});

const hide = asyncHandler(async (req, res) => {
  const portfolio = await adminPortfolioService.hidePortfolio(req.params.id, req.user.id, req.body.reason);
  res.status(200).json({ portfolio });
});

const restore = asyncHandler(async (req, res) => {
  const portfolio = await adminPortfolioService.restorePortfolio(req.params.id, req.user.id);
  res.status(200).json({ portfolio });
});

const getDetail = asyncHandler(async (req, res) => {
  const portfolio = await adminPortfolioService.getPortfolioForAdmin(req.params.id);
  res.status(200).json({ portfolio });
});

module.exports = { report, listAll, listReported, getReports, hide, restore, getDetail };
