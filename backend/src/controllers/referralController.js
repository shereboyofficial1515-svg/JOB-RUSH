const referralService = require('../services/referralService');
const asyncHandler = require('../utils/asyncHandler');

/** GET /api/referrals/me — code, link, progress, and this user's own referral list. */
const getDashboard = asyncHandler(async (req, res) => {
  const dashboard = await referralService.getReferrerDashboard(req.user.id);
  res.status(200).json(dashboard);
});

/**
 * GET /api/referrals/my-status — for the REFERRED side: was this
 * account itself referred, and if so, does it still owe feedback?
 * Powers the "share your experience" prompt shown to a referred user
 * on their own dashboard (distinct from getDashboard above, which is
 * the REFERRER's view of everyone they've referred).
 */
const getMyReferralStatus = asyncHandler(async (req, res) => {
  const referral = await referralService.getOwnReferralRow(req.user.id);
  if (!referral) return res.status(200).json({ referred: false });

  res.status(200).json({
    referred: true,
    status: referral.status,
    activityCompleted: !!referral.activity_completed_at,
    feedbackSubmitted: !!referral.feedback_submitted_at,
  });
});

/**
 * POST /api/referrals/feedback
 * Submitted by the referred user about their OWN experience — scoped
 * entirely to req.user.id, so there is no way for a referrer (or
 * anyone else) to submit this on someone else's behalf.
 */
const submitFeedback = asyncHandler(async (req, res) => {
  const result = await referralService.submitFeedback(req.user.id, req.body);
  res.status(200).json({ message: 'Thank you for your feedback.', referralId: result.referralId });
});

module.exports = { getDashboard, getMyReferralStatus, submitFeedback };
