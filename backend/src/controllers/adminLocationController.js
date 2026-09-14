const adminLocationService = require('../services/adminLocationService');
const asyncHandler = require('../utils/asyncHandler');

const listStates = asyncHandler(async (req, res) => {
  const states = await adminLocationService.listAllStates();
  res.status(200).json({ states });
});

const setStateActive = asyncHandler(async (req, res) => {
  const state = await adminLocationService.setStateActive(req.params.id, req.body.isActive, req.user.id);
  res.status(200).json({ state });
});

const createLga = asyncHandler(async (req, res) => {
  const lga = await adminLocationService.createLga(req.params.stateId, req.body.name);
  res.status(201).json({ lga });
});

const createArea = asyncHandler(async (req, res) => {
  const area = await adminLocationService.createArea(req.params.lgaId, req.body.name);
  res.status(201).json({ area });
});

module.exports = { listStates, setStateActive, createLga, createArea };
