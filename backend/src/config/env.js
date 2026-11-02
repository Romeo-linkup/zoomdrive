const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const packageJson = require('../../package.json');

const env = Object.freeze({
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT, 10) || 4000,
  DATABASE_URL: process.env.DATABASE_URL || null,
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '30d',
  FRONTEND_ORIGINS: (process.env.FRONTEND_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0),
  OTP_DRIVER: process.env.OTP_DRIVER,
  OTP_DEV_ECHO: process.env.OTP_DEV_ECHO === 'true',
  SIGNUP_ENABLED: process.env.SIGNUP_ENABLED !== 'false',
  APP_VERSION: process.env.APP_VERSION || packageJson.version,
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || null,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || null,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || null,
  SMS_API_KEY: process.env.SMS_API_KEY || null,
  SMS_API_SECRET: process.env.SMS_API_SECRET || null,
  SMS_SENDER_ID: process.env.SMS_SENDER_ID || null,
  PAYSTACK_SECRET_KEY: process.env.PAYSTACK_SECRET_KEY || null,
  PAYSTACK_PUBLIC_KEY: process.env.PAYSTACK_PUBLIC_KEY || null,
  PAYSTACK_FALLBACK_EMAIL_DOMAIN: process.env.PAYSTACK_FALLBACK_EMAIL_DOMAIN || null,
  EMAIL_DRIVER: process.env.EMAIL_DRIVER || 'console',
  EMAIL_FROM: process.env.EMAIL_FROM || null,
  SMTP_HOST: process.env.SMTP_HOST || null,
  SMTP_PORT: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : null,
  SMTP_USER: process.env.SMTP_USER || null,
  SMTP_PASS: process.env.SMTP_PASS || null,
  EMAIL_FALLBACK_DOMAIN: process.env.EMAIL_FALLBACK_DOMAIN || null,
  PRICING_CHANGE_COOLDOWN_HOURS: process.env.PRICING_CHANGE_COOLDOWN_HOURS
    ? Number(process.env.PRICING_CHANGE_COOLDOWN_HOURS)
    : 24,
});

function validateEnv() {
  const problems = [];

  if (!env.DATABASE_URL) {
    problems.push({ name: 'DATABASE_URL', problem: 'missing' });
  } else if (!/^postgres(ql)?:\/\//.test(env.DATABASE_URL)) {
    problems.push({ name: 'DATABASE_URL', problem: 'invalid format' });
  }

  if (!env.JWT_SECRET) {
    problems.push({ name: 'JWT_SECRET', problem: 'missing' });
  } else if (env.JWT_SECRET.length < 32) {
    problems.push({ name: 'JWT_SECRET', problem: 'too short (min 32)' });
  }

  if (env.FRONTEND_ORIGINS.length === 0) {
    problems.push({ name: 'FRONTEND_ORIGINS', problem: 'empty' });
  }

  if (!env.OTP_DRIVER || (env.OTP_DRIVER !== 'console' && env.OTP_DRIVER !== 'bulksms')) {
    problems.push({ name: 'OTP_DRIVER', problem: 'missing or invalid (must be console or bulksms)' });
  }

  if (env.OTP_DEV_ECHO && env.NODE_ENV === 'production') {
    problems.push({ name: 'OTP_DEV_ECHO', problem: 'must be false in production' });
  }

  if (!['console', 'smtp'].includes(env.EMAIL_DRIVER)) {
    problems.push({ name: 'EMAIL_DRIVER', problem: 'must be console or smtp' });
  }
  if (env.EMAIL_DRIVER === 'console' && env.NODE_ENV !== 'development') {
    problems.push({ name: 'EMAIL_DRIVER', problem: 'console is allowed only in development' });
  }
  if (env.EMAIL_DRIVER === 'smtp') {
    if (!env.EMAIL_FROM || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.EMAIL_FROM)) {
      problems.push({ name: 'EMAIL_FROM', problem: 'missing or invalid for smtp' });
    }
    if (!env.SMTP_HOST) problems.push({ name: 'SMTP_HOST', problem: 'missing for smtp' });
    if (!Number.isInteger(env.SMTP_PORT) || env.SMTP_PORT < 1 || env.SMTP_PORT > 65535) {
      problems.push({ name: 'SMTP_PORT', problem: 'must be an integer from 1 to 65535 for smtp' });
    }
    if (!env.SMTP_USER) problems.push({ name: 'SMTP_USER', problem: 'missing for smtp' });
    if (!env.SMTP_PASS) problems.push({ name: 'SMTP_PASS', problem: 'missing for smtp' });
  }
  if (env.EMAIL_FALLBACK_DOMAIN && !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(env.EMAIL_FALLBACK_DOMAIN)) {
    problems.push({ name: 'EMAIL_FALLBACK_DOMAIN', problem: 'invalid domain' });
  }
  if (!Number.isInteger(env.PRICING_CHANGE_COOLDOWN_HOURS)
      || env.PRICING_CHANGE_COOLDOWN_HOURS < 1
      || env.PRICING_CHANGE_COOLDOWN_HOURS > 720) {
    problems.push({ name: 'PRICING_CHANGE_COOLDOWN_HOURS', problem: 'must be an integer from 1 to 720' });
  }
  if (Boolean(env.PAYSTACK_SECRET_KEY) !== Boolean(env.PAYSTACK_PUBLIC_KEY)) {
    problems.push({ name: 'PAYSTACK_SECRET_KEY', problem: 'both Paystack keys must be configured together' });
    problems.push({ name: 'PAYSTACK_PUBLIC_KEY', problem: 'both Paystack keys must be configured together' });
  } else if (env.PAYSTACK_SECRET_KEY && env.PAYSTACK_PUBLIC_KEY) {
    const secretMode = env.PAYSTACK_SECRET_KEY.match(/^sk_(test|live)_/);
    const publicMode = env.PAYSTACK_PUBLIC_KEY.match(/^pk_(test|live)_/);
    if (!secretMode) problems.push({ name: 'PAYSTACK_SECRET_KEY', problem: 'invalid key format' });
    if (!publicMode) problems.push({ name: 'PAYSTACK_PUBLIC_KEY', problem: 'invalid key format' });
    if (secretMode && publicMode && secretMode[1] !== publicMode[1]) {
      problems.push({ name: 'PAYSTACK_PUBLIC_KEY', problem: 'mode must match PAYSTACK_SECRET_KEY' });
    }
    if (!env.PAYSTACK_FALLBACK_EMAIL_DOMAIN
        || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(env.PAYSTACK_FALLBACK_EMAIL_DOMAIN)) {
      problems.push({ name: 'PAYSTACK_FALLBACK_EMAIL_DOMAIN', problem: 'required and must be a valid domain when Paystack is configured' });
    }
  }

  if (!env.CLOUDINARY_CLOUD_NAME) {
    problems.push({ name: 'CLOUDINARY_CLOUD_NAME', problem: 'missing' });
  }
  if (!env.CLOUDINARY_API_KEY) {
    problems.push({ name: 'CLOUDINARY_API_KEY', problem: 'missing' });
  }
  if (!env.CLOUDINARY_API_SECRET) {
    problems.push({ name: 'CLOUDINARY_API_SECRET', problem: 'missing' });
  }

  return problems;
}

module.exports = { env, validateEnv };
