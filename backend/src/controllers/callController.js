const callService = require('../services/callService');
const asyncHandler = require('../utils/asyncHandler');

const initiateCall = asyncHandler(async (req, res) => {
  const call = await callService.initiateCall(req.user.id, req.params.conversationId, req.body.callType);
  res.status(201).json({ call });
});

const updateStatus = asyncHandler(async (req, res) => {
  const call = await callService.updateCallStatus(req.params.id, req.user.id, req.body.status, req.body.failureReason);
  res.status(200).json({ call });
});

const getCallToken = asyncHandler(async (req, res) => {
  const token = await callService.getCallToken(req.params.id, req.user.id, req.user.fullName || req.user.id);
  res.status(200).json(token);
});

const listForConversation = asyncHandler(async (req, res) => {
  const calls = await callService.listCallsForConversation(req.params.conversationId, req.user.id);
  res.status(200).json({ calls });
});

module.exports = { initiateCall, updateStatus, getCallToken, listForConversation };
