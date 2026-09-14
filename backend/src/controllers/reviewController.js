const reviewService = require('../services/reviewService');
const asyncHandler = require('../utils/asyncHandler');

const create = asyncHandler(async (req, res) => {
  const review = await reviewService.createReview(req.user.id, req.body);
  res.status(201).json({ review });
});

const listForWorker = asyncHandler(async (req, res) => {
  const reviews = await reviewService.listReviewsForWorker(req.params.workerUserId);
  res.status(200).json({ reviews });
});

const report = asyncHandler(async (req, res) => {
  const result = await reviewService.reportReview(req.user.id, req.params.id, req.body.reason);
  res.status(201).json({ report: result });
});

// --- Admin ---
const listReported = asyncHandler(async (req, res) => {
  const reviews = await reviewService.listReportedReviews();
  res.status(200).json({ reviews });
});

const hide = asyncHandler(async (req, res) => {
  await reviewService.hideReview(req.params.id, req.user.id, req.body.reason);
  res.status(200).json({ message: 'Review hidden.' });
});

module.exports = { create, listForWorker, report, listReported, hide };
