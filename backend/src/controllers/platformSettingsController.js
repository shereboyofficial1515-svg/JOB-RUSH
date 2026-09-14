const platformSettingsService = require('../services/platformSettingsService');
const asyncHandler = require('../utils/asyncHandler');
const { recordAuditEvent } = require('../security/auditLogger');

const getSettings = asyncHandler(async (req, res) => {
  const settings = await platformSettingsService.getSettings();
  res.status(200).json({ settings });
});

const updateFeePercent = asyncHandler(async (req, res) => {
  const settings = await platformSettingsService.updateFeePercent(req.body.platformFeePercent, req.user.id);
  await recordAuditEvent({
    actorUserId: req.user.id,
    action: 'PLATFORM_FEE_UPDATED',
    resourceType: 'platform_settings',
    resourceId: null,
    result: 'success',
    metadata: { newFeePercent: req.body.platformFeePercent },
  });
  res.status(200).json({ settings });
});

module.exports = { getSettings, updateFeePercent };
