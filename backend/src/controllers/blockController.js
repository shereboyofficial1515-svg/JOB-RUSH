const blockService = require('../services/blockService');
const asyncHandler = require('../utils/asyncHandler');

const blockUser = asyncHandler(async (req, res) => {
  await blockService.blockUser(req.user.id, req.body.userId);
  res.status(200).json({ message: 'User blocked.' });
});

const unblockUser = asyncHandler(async (req, res) => {
  await blockService.unblockUser(req.user.id, req.params.userId);
  res.status(200).json({ message: 'User unblocked.' });
});

const listBlocked = asyncHandler(async (req, res) => {
  const blocked = await blockService.listBlocked(req.user.id);
  res.status(200).json({ blocked });
});

module.exports = { blockUser, unblockUser, listBlocked };
