const adminMessagingService = require('../services/adminMessagingService');
const asyncHandler = require('../utils/asyncHandler');

const listReportedMessages = asyncHandler(async (req, res) => {
  const reports = await adminMessagingService.listReportedMessagesForAdmin(req.user.id);
  res.status(200).json({ reports });
});

const removeMessage = asyncHandler(async (req, res) => {
  const message = await adminMessagingService.adminRemoveMessage(req.params.messageId, req.user.id, req.body.reason);
  res.status(200).json({ message });
});

module.exports = { listReportedMessages, removeMessage };
