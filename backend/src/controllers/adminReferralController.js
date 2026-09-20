const referralService = require('../services/referralService');
const asyncHandler = require('../utils/asyncHandler');

const listReferrers = asyncHandler(async (req, res) => {
  const referrers = await referralService.adminListReferrers({
    page: req.query.page ? Number(req.query.page) : undefined,
    pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
  });
  res.status(200).json({ referrers });
});

/** "Who referred whom" for one referrer — every referred user and their full status. */
const getReferrerDetail = asyncHandler(async (req, res) => {
  const detail = await referralService.adminGetReferrerDetail(req.params.referrerUserId);
  res.status(200).json(detail);
});

const listRewards = asyncHandler(async (req, res) => {
  const rewards = await referralService.adminListRewards({ status: req.query.status });
  res.status(200).json({ rewards });
});

const approveReward = asyncHandler(async (req, res) => {
  await referralService.adminApproveReward(req.params.id, req.user.id);
  res.status(200).json({ message: 'Reward approved.' });
});

const rejectReward = asyncHandler(async (req, res) => {
  await referralService.adminRejectReward(req.params.id, req.user.id, req.body.reason);
  res.status(200).json({ message: 'Reward rejected.' });
});

const markRewardPaid = asyncHandler(async (req, res) => {
  await referralService.adminMarkRewardPaid(req.params.id, req.user.id);
  res.status(200).json({ message: 'Reward marked as paid and credited to the referrer\'s wallet.' });
});

module.exports = { listReferrers, getReferrerDetail, listRewards, approveReward, rejectReward, markRewardPaid };
