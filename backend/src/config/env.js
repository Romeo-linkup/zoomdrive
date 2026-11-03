const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const packageJson = require('../../package.json');
const OTP_LENGTH = 6;
const TERMS_VERSION = '2026-11-draft';

const env = Object.freeze({
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT, 10) || 4000,
  DATABASE_URL: process.env.DATABASE_URL || null,
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '30d',
  TRUST_PROXY_HOPS: process.env.TRUST_PROXY_HOPS ? Number(process.env.TRUST_PROXY_HOPS) : 1,
  FRONTEND_ORIGINS: (process.env.FRONTEND_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0),
  OTP_DRIVER: process.env.OTP_DRIVER,
  OTP_LENGTH,
  TERMS_VERSION,
  OTP_DAILY_EMAIL_CAP: process.env.OTP_DAILY_EMAIL_CAP
    ? Number(process.env.OTP_DAILY_EMAIL_CAP)
    : 250,
  OTP_DEV_ECHO: process.env.OTP_DEV_ECHO === 'true',
  OTP_ALLOW_CONSOLE_IN_PRODUCTION: process.env.OTP_ALLOW_CONSOLE_IN_PRODUCTION === 'true',
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
  DATA_ENCRYPTION_KEY: process.env.DATA_ENCRYPTION_KEY || null,
  EMAIL_DRIVER: process.env.EMAIL_DRIVER || 'console',
  EMAIL_FROM: process.env.EMAIL_FROM || null,
  EMAIL_FROM_NAME: process.env.EMAIL_FROM_NAME || 'ZoomDrive',
  BREVO_API_KEY: process.env.BREVO_API_KEY || null,
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
  if (env.NODE_ENV === 'production' && env.JWT_SECRET) {
    const lowered = env.JWT_SECRET.toLowerCase();
    if (lowered === 'changeme' || lowered === 'secret' || lowered.startsWith('replace')) {
      problems.push({ name: 'JWT_SECRET', problem: 'placeholder secret refused in production' });
    }
  }

  if (!env.DATA_ENCRYPTION_KEY) {
    problems.push({ name: 'DATA_ENCRYPTION_KEY', problem: 'missing' });
  } else if (!/^(?:[A-Za-z0-9+/]{4}){10}[A-Za-z0-9+/]{3}=$/.test(env.DATA_ENCRYPTION_KEY)
      || Buffer.from(env.DATA_ENCRYPTION_KEY, 'base64').length !== 32
      || Buffer.from(env.DATA_ENCRYPTION_KEY, 'base64').toString('base64') !== env.DATA_ENCRYPTION_KEY) {
    problems.push({ name: 'DATA_ENCRYPTION_KEY', problem: 'must be base64 encoding of exactly 32 bytes' });
  }

  if (env.FRONTEND_ORIGINS.length === 0) {
    problems.push({ name: 'FRONTEND_ORIGINS', problem: 'empty' });
  }
  if (env.NODE_ENV === 'production') {
    for (const origin of env.FRONTEND_ORIGINS) {
      if (!origin.startsWith('https://')) {
        problems.push({ name: 'FRONTEND_ORIGINS', problem: 'every entry must start with https://' });
        break;
      }
      if (origin.includes('*') || origin.includes('/') && origin.replace('https://','').includes('/') || origin.endsWith('/')) {
        problems.push({ name: 'FRONTEND_ORIGINS', problem: 'no wildcard, path or trailing slash allowed' });
        break;
      }
      const host = origin.replace('https://', '');
      if (host === 'localhost' || host.startsWith('localhost:') || host === '127.0.0.1' || host.startsWith('127.0.0.1:')) {
        problems.push({ name: 'FRONTEND_ORIGINS', problem: 'localhost and 127.0.0.1 are not allowed in production' });
        break;
      }
    }
  }
  if (!Number.isInteger(env.TRUST_PROXY_HOPS) || env.TRUST_PROXY_HOPS < 0) {
    problems.push({ name: 'TRUST_PROXY_HOPS', problem: 'must be a non-negative integer' });
  }

  if (!['console', 'email', 'bulksms'].includes(env.OTP_DRIVER)) {
    problems.push({ name: 'OTP_DRIVER', problem: 'missing or invalid (must be console, email or bulksms)' });
  }

  if (process.env.OTP_ALLOW_CONSOLE_IN_PRODUCTION !== undefined
      && !['true', 'false'].includes(process.env.OTP_ALLOW_CONSOLE_IN_PRODUCTION)) {
    problems.push({ name: 'OTP_ALLOW_CONSOLE_IN_PRODUCTION', problem: 'must be true or false' });
  }
  if (env.NODE_ENV === 'production' && env.OTP_DRIVER === 'console'
      && !env.OTP_ALLOW_CONSOLE_IN_PRODUCTION) {
    problems.push({
      name: 'OTP_DRIVER',
      problem: 'console is refused in production unless OTP_ALLOW_CONSOLE_IN_PRODUCTION=true',
    });
  }
  if (env.OTP_DRIVER === 'bulksms') {
    if (!env.SMS_API_KEY) problems.push({ name: 'SMS_API_KEY', problem: 'missing for OTP_DRIVER=bulksms' });
    if (!env.SMS_API_SECRET) problems.push({ name: 'SMS_API_SECRET', problem: 'missing for OTP_DRIVER=bulksms' });
  }
  if (env.OTP_DRIVER === 'email' && env.NODE_ENV === 'production' && env.EMAIL_DRIVER === 'console') {
    problems.push({ name: 'EMAIL_DRIVER', problem: 'must not be console when OTP_DRIVER=email in production' });
  }
  if (!Number.isInteger(env.OTP_DAILY_EMAIL_CAP)
      || env.OTP_DAILY_EMAIL_CAP < 10
      || env.OTP_DAILY_EMAIL_CAP > 100000) {
    problems.push({ name: 'OTP_DAILY_EMAIL_CAP', problem: 'must be an integer from 10 to 100000' });
  }
  if (env.SMS_SENDER_ID && env.SMS_SENDER_ID.length > 11) {
    problems.push({ name: 'SMS_SENDER_ID', problem: 'must be at most 11 characters' });
  }

  if (env.OTP_DEV_ECHO && env.NODE_ENV === 'production') {
    problems.push({ name: 'OTP_DEV_ECHO', problem: 'must be false in production' });
  }

  if (!['console', 'smtp', 'brevo'].includes(env.EMAIL_DRIVER)) {
    problems.push({ name: 'EMAIL_DRIVER', problem: 'must be console, smtp or brevo' });
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
  if (env.EMAIL_DRIVER === 'brevo') {
    if (!env.BREVO_API_KEY) problems.push({ name: 'BREVO_API_KEY', problem: 'missing for EMAIL_DRIVER=brevo' });
    if (!env.EMAIL_FROM || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.EMAIL_FROM)) {
      problems.push({ name: 'EMAIL_FROM', problem: 'missing or invalid for EMAIL_DRIVER=brevo' });
    }
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

module.exports = { env, validateEnv, OTP_LENGTH, TERMS_VERSION };
