const rateLimit = require('express-rate-limit');
const ApiError = require('../lib/ApiError');

function tooMany(req, res, next) {
  next(new ApiError('ZD-AUTH-003', { message: 'Too many requests. Please try again later.' }));
}

function tooManyLogin(req, res, next) {
  next(new ApiError('ZD-AUTH-003', { message: 'Too many login attempts. Try again later.' }));
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

// 10 admin login attempts per IP per 15 minutes.
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: tooManyLogin,
});

const tooManyWrite = (req, res, next) => next(new ApiError('ZD-SYS-004'));

const globalWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 240,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => !['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)
    || /\/payments\/paystack\/webhook\/?$/.test((req.originalUrl || req.path || '').split('?')[0]),
  handler: tooManyWrite,
});

const perUserWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user && req.user.id) ? String(req.user.id) : req.ip,
  skip: (req) => req.method === 'GET' || /\/heartbeat\/?$/.test((req.originalUrl || req.path || '').split('?')[0]) || !req.user,
  handler: tooManyWrite,
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user && req.user.id) ? String(req.user.id) : req.ip,
  handler: tooManyWrite,
});

const createRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user && req.user.id) ? String(req.user.id) : req.ip,
  handler: tooManyWrite,
});

const adminWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.admin && req.admin.id) ? String(req.admin.id) : req.ip,
  skip: (req) => !['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method),
  handler: tooManyWrite,
});

module.exports = {
  otpRequestIpLimiter,
  otpVerifyIpLimiter,
  adminLoginLimiter,
  globalWriteLimiter,
  perUserWriteLimiter,
  uploadLimiter,
  createRequestLimiter,
  adminWriteLimiter,
};
