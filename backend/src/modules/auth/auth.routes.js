const express = require('express');
const z = require('zod');
const { otpRequestIpLimiter, otpVerifyIpLimiter } = require('../../middleware/rateLimit');
const validate = require('../../middleware/validate');
const auth = require('../../middleware/auth');
const {
  requestOtpHandler,
  verifyOtpHandler,
  getMeHandler,
  logoutHandler,
} = require('./auth.controller');

const router = express.Router();

router.post('/otp/request', otpRequestIpLimiter, validate(z.object({ phone: z.string().max(20), app: z.enum(['driver','provider']) })), requestOtpHandler);
router.post('/otp/verify', otpVerifyIpLimiter, validate(z.object({ phone: z.string().max(20), code: z.string().regex(/^\d{4}$/, 'Enter the 4-digit code'), app: z.enum(['driver','provider']) })), verifyOtpHandler);
router.get('/me', auth, getMeHandler);
router.post('/logout', auth, logoutHandler);

module.exports = router;
