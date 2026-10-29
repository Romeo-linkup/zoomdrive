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
