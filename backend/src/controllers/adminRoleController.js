const adminRoleService = require('../services/adminRoleService');
const asyncHandler = require('../utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const admins = await adminRoleService.listAdmins();
  res.status(200).json({ admins });
});

const grant = asyncHandler(async (req, res) => {
  const admin = await adminRoleService.grantAdminRole(req.body, req.user.id);
  res.status(201).json({ admin });
});

const revoke = asyncHandler(async (req, res) => {
  const admin = await adminRoleService.revokeAdminRole(req.params.id, req.user.id);
  res.status(200).json({ admin });
});

module.exports = { list, grant, revoke };
