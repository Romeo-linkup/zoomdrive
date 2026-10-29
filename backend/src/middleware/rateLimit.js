const rateLimit = require('express-rate-limit');
const ApiError = require('../lib/ApiError');

function tooMany(req, res, next) {
  next(new ApiError('ZD-AUTH-003', { message: 'Too many requests. Please try again later.' }));
}

// 10 OTP requests per IP per hour (the 3-per-phone-per-10-minutes rule lives in otp.service.js).
const otpRequestIpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: tooMany,
});

// Generous cap on verify attempts per IP (per-code attempts are capped at 5 in otp.service.js).
const otpVerifyIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: tooMany,
});

module.exports = { otpRequestIpLimiter, otpVerifyIpLimiter };