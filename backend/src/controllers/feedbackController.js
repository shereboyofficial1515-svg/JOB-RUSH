const feedbackService = require('../services/feedbackService');
const asyncHandler = require('../utils/asyncHandler');

const submit = asyncHandler(async (req, res) => {
  const feedback = await feedbackService.submitFeedback(req.user.id, req.body);
  res.status(201).json({ feedback });
});

const listOwn = asyncHandler(async (req, res) => {
  const feedback = await feedbackService.listOwnFeedback(req.user.id);
  res.status(200).json({ feedback });
});

module.exports = { submit, listOwn };
