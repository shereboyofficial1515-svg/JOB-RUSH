const locationService = require('../services/locationService');
const asyncHandler = require('../utils/asyncHandler');

const listStates = asyncHandler(async (req, res) => {
  const states = await locationService.listStates();
  res.status(200).json({ states });
});

const listLgas = asyncHandler(async (req, res) => {
  const lgas = await locationService.listLgasForState(req.params.stateId);
  res.status(200).json({ lgas });
});

const listAreas = asyncHandler(async (req, res) => {
  const areas = await locationService.listAreasForLga(req.params.lgaId);
  res.status(200).json({ areas });
});

module.exports = { listStates, listLgas, listAreas };
