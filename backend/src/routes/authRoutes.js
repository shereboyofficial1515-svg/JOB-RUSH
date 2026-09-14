const express = require('express');
const controller = require('../controllers/authController');
const twoFactorController = require('../controllers/twoFactorController');
const { authenticate } = require('../middleware/authenticate');
const {
  loginLimiter,
  registrationLimiter,
  otpRequestLimiter,
  otpVerifyLimiter,
  passwordResetLimiter,
} = require('../middleware/rateLimiter');
const {
  validateBody,
  registerSchema,
  loginSchema,
  requestOtpSchema,
  verifyOtpSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
} = require('../validators/authValidators');
const {
  validateBody: validateTwoFactorBody,
  codeSchema,
  verifyLoginSchema,
} = require('../validators/twoFactorValidators');

const router = express.Router();

router.post('/register', registrationLimiter, validateBody(registerSchema), controller.register);

router.post('/otp/request', otpRequestLimiter, validateBody(requestOtpSchema), controller.requestOtp);
router.post('/otp/verify', otpVerifyLimiter, validateBody(verifyOtpSchema), controller.verifyOtp);

router.post('/login', loginLimiter, validateBody(loginSchema), controller.login);
router.get('/google', controller.googleRedirect);
router.get('/google/callback', controller.googleCallback);
router.post('/2fa/verify-login', loginLimiter, validateTwoFactorBody(verifyLoginSchema), controller.verifyLoginTwoFactor);
router.post('/2fa/setup', authenticate, twoFactorController.setup);
router.post('/2fa/confirm-setup', authenticate, validateTwoFactorBody(codeSchema), twoFactorController.confirmSetup);
router.post('/2fa/disable', authenticate, validateTwoFactorBody(codeSchema), twoFactorController.disable);
router.get('/2fa/status', authenticate, twoFactorController.status);
router.post('/logout', authenticate, controller.logout);
router.post('/logout-all', authenticate, controller.logoutAllDevices);

router.get('/me', authenticate, controller.getCurrentUser);
router.get('/sessions', authenticate, controller.listSessions);
router.get('/devices', authenticate, controller.listDevices);

router.post(
  '/password/forgot',
  passwordResetLimiter,
  validateBody(requestPasswordResetSchema),
  controller.requestPasswordReset
);
router.post(
  '/password/reset',
  passwordResetLimiter,
  validateBody(resetPasswordSchema),
  controller.resetPassword
);

module.exports = router;
