const promotionService = require('../services/promotionService');
const asyncHandler = require('../utils/asyncHandler');

/** GET /api/promotions/:placementType — public read */
const listActive = asyncHandler(async (req, res) => {
  const placements = await promotionService.listActivePlacements(req.params.placementType, req.query);
  res.status(200).json({ placements });
});

// --- Admin ---
const listForAdmin = asyncHandler(async (req, res) => {
  const placements = await promotionService.listPlacementsForAdmin();
  res.status(200).json({ placements });
});

const create = asyncHandler(async (req, res) => {
  const placement = await promotionService.createPlacement(req.user.id, req.body);
  res.status(201).json({ placement });
});

const remove = asyncHandler(async (req, res) => {
  await promotionService.removePlacement(req.params.id, req.user.id);
  res.status(200).json({ message: 'Placement removed.' });
});

module.exports = { listActive, listForAdmin, create, remove };
