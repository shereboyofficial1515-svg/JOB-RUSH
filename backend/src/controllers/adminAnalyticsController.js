const adminAnalyticsService = require('../services/adminAnalyticsService');
const asyncHandler = require('../utils/asyncHandler');

const getSummary = asyncHandler(async (req, res) => {
  const summary = await adminAnalyticsService.getDashboardSummary();
  res.status(200).json({ summary });
});

module.exports = { getSummary };
