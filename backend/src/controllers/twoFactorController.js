const twoFactorService = require('../services/twoFactorService');
const asyncHandler = require('../utils/asyncHandler');

/** POST /api/auth/2fa/setup — starts enrollment, returns the secret + otpauth URL for a QR code */
const setup = asyncHandler(async (req, res) => {
  const label = req.user.email || req.user.phone || req.user.id;
  const result = await twoFactorService.startSetup(req.user.id, label);
  res.status(200).json(result);
});

/** POST /api/auth/2fa/confirm-setup — verifies the first code, enables 2FA, returns backup codes once */
const confirmSetup = asyncHandler(async (req, res) => {
  const result = await twoFactorService.confirmSetup(req.user.id, req.body.code);
  res.status(200).json(result);
});

/** POST /api/auth/2fa/disable — requires a valid current code */
const disable = asyncHandler(async (req, res) => {
  await twoFactorService.disable(req.user.id, req.body.code);
  res.status(200).json({ message: 'Two-factor authentication disabled.' });
});

const status = asyncHandler(async (req, res) => {
  const enabled = await twoFactorService.isEnabled(req.user.id);
  res.status(200).json({ enabled });
});

module.exports = { setup, confirmSetup, disable, status };
