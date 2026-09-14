const adminUserService = require('../services/adminUserService');
const asyncHandler = require('../utils/asyncHandler');

const search = asyncHandler(async (req, res) => {
  const users = await adminUserService.searchUsers(req.query);
  res.status(200).json({ users });
});

const getById = asyncHandler(async (req, res) => {
  const user = await adminUserService.getUserDetail(req.params.id);
  res.status(200).json({ user });
});

const suspend = asyncHandler(async (req, res) => {
  const user = await adminUserService.suspendUser(req.params.id, req.user.id, req.body.reason);
  res.status(200).json({ user });
});

const disable = asyncHandler(async (req, res) => {
  const user = await adminUserService.disableUser(req.params.id, req.user.id, req.body.reason);
  res.status(200).json({ user });
});

const reactivate = asyncHandler(async (req, res) => {
  const user = await adminUserService.reactivateUser(req.params.id, req.user.id);
  res.status(200).json({ user });
});

module.exports = { search, getById, suspend, disable, reactivate };
