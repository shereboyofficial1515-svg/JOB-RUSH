const adminAuditService = require('../services/adminAuditService');
const asyncHandler = require('../utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const result = await adminAuditService.listAuditLogs(req.query);
  res.status(200).json(result);
});

module.exports = { list };
