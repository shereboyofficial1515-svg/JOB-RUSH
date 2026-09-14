const settingsService = require('../services/settingsService');
const { toSnakeCaseSettingsInput } = require('../validators/settingsValidators');
const asyncHandler = require('../utils/asyncHandler');

/** GET /api/settings — the caller's own settings row (lazily created). */
const getSettings = asyncHandler(async (req, res) => {
  const settings = await settingsService.getSettings(req.user.id);
  res.status(200).json({ settings });
});

/**
 * PATCH /api/settings
 * `req.user.id` is the only source of whose settings this updates —
 * there is no userId in the body, so this can't target anyone else's.
 */
const updateSettings = asyncHandler(async (req, res) => {
  const input = toSnakeCaseSettingsInput(req.body);
  const settings = await settingsService.updateSettings(req.user.id, input);
  res.status(200).json({ settings });
});

/** GET /api/settings/storage-usage — real byte totals, the caller's own media only. */
const getStorageUsage = asyncHandler(async (req, res) => {
  const usage = await settingsService.getStorageUsage(req.user.id);
  res.status(200).json({ usage });
});

module.exports = { getSettings, updateSettings, getStorageUsage };
