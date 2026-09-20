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
  changePasswordSchema,
  requestEmailChangeSchema,
  confirmEmailChangeSchema,
  requestPhoneChangeSchema,
  confirmPhoneChangeSchema,
  accountPasswordConfirmSchema,
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
// Android app only — see completeOAuthLogin/oauthMobileHandoffService.
// No `authenticate` middleware: the whole point is to issue the first
// session cookie, before any session exists.
router.get('/mobile-handoff', controller.mobileOAuthHandoff);

router.get('/google', controller.googleRedirect);
router.get('/google/callback', controller.googleCallback);
router.get('/facebook', controller.facebookRedirect);
router.get('/facebook/callback', controller.facebookCallback);
router.get('/apple', controller.appleRedirect);
// POST /apple/callback is intentionally NOT mounted here -- see
// server.js, where it's registered before the global CORS middleware.
// Apple's response_mode=form_post means the browser submits it as a
// real cross-origin POST from appleid.apple.com, which (unlike a
// simple GET redirect) carries an Origin header the CORS origin
// check would otherwise reject outright, blocking every Apple login.
router.post('/2fa/verify-login', loginLimiter, validateTwoFactorBody(verifyLoginSchema), controller.verifyLoginTwoFactor);
router.post('/2fa/setup', authenticate, twoFactorController.setup);
router.post('/2fa/confirm-setup', authenticate, validateTwoFactorBody(codeSchema), twoFactorController.confirmSetup);
router.post('/2fa/disable', authenticate, validateTwoFactorBody(codeSchema), twoFactorController.disable);
router.get('/2fa/status', authenticate, twoFactorController.status);
router.post('/logout', authenticate, controller.logout);
router.post('/logout-all', authenticate, controller.logoutAllDevices);

router.get('/me', authenticate, controller.getCurrentUser);
router.get('/sessions', authenticate, controller.listSessions);
router.post('/sessions/:id/revoke', authenticate, controller.revokeSession);
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
router.post('/password/change', authenticate, validateBody(changePasswordSchema), controller.changePassword);

router.post(
  '/email/change/request',
  otpRequestLimiter,
  authenticate,
  validateBody(requestEmailChangeSchema),
  controller.requestEmailChange
);
router.post(
  '/email/change/confirm',
  otpVerifyLimiter,
  authenticate,
  validateBody(confirmEmailChangeSchema),
  controller.confirmEmailChange
);
router.post(
  '/phone/change/request',
  otpRequestLimiter,
  authenticate,
  validateBody(requestPhoneChangeSchema),
  controller.requestPhoneChange
);
router.post(
  '/phone/change/confirm',
  otpVerifyLimiter,
  authenticate,
  validateBody(confirmPhoneChangeSchema),
  controller.confirmPhoneChange
);

router.post(
  '/account/deactivate',
  authenticate,
  validateBody(accountPasswordConfirmSchema),
  controller.deactivateAccount
);
router.post(
  '/account/delete',
  authenticate,
  validateBody(accountPasswordConfirmSchema),
  controller.deleteAccount
);

module.exports = router;
