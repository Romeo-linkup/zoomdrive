const express = require('express');
const z = require('zod');
const { otpRequestIpLimiter, otpVerifyIpLimiter } = require('../../middleware/rateLimit');
const validate = require('../../middleware/validate');
const auth = require('../../middleware/auth');
const { env } = require('../../config/env');
const {
  requestOtpHandler,
  verifyOtpHandler,
  getMeHandler,
  logoutHandler,
} = require('./auth.controller');

const router = express.Router();

const emailSchema = z.string().trim().max(254).email('Enter a valid email address').transform((value) => value.toLowerCase());
const appSchema = z.enum(['driver', 'provider']);

router.post('/otp/request', otpRequestIpLimiter, validate(z.object({
  email: emailSchema,
  app: appSchema,
})), requestOtpHandler);
router.post('/otp/verify', otpVerifyIpLimiter, validate(z.object({
  email: emailSchema,
  code: z.string().regex(new RegExp(`^\\d{${env.OTP_LENGTH}}$`), `Enter the ${env.OTP_LENGTH}-digit code`),
  app: appSchema,
})), verifyOtpHandler);
router.get('/me', auth, getMeHandler);
router.post('/logout', auth, logoutHandler);

module.exports = router;
