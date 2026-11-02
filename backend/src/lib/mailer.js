const nodemailer = require('nodemailer');
const ApiError = require('./ApiError');
const { env } = require('../config/env');
const { logger } = require('./logger');

function maskEmail(email) {
  const [local, domain] = String(email || '').split('@');
  if (!local || !domain) return '***';
  return `${local[0]}***@${domain}`;
}

function resolveRecipient(to) {
  const address = String(to || '').trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return address;
  if (address && env.EMAIL_FALLBACK_DOMAIN && !address.includes('@')) {
    return `${address}@${env.EMAIL_FALLBACK_DOMAIN}`;
  }
  throw new ApiError('ZD-EML-001', { message: 'Email recipient is unavailable' });
}

async function sendMail({ to, subject, text }) {
  const recipient = resolveRecipient(to);

  if (env.EMAIL_DRIVER === 'console') {
    if (env.NODE_ENV !== 'development') {
      throw new ApiError('ZD-EML-001', { message: 'Console email is available only in development' });
    }
    logger.info({
      reqId: '-',
      module: 'mailer',
      message: 'Development email',
      meta: { to: maskEmail(recipient), subject, text },
    });
    return;
  }

  try {
    const transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });
    await transport.sendMail({
      from: env.EMAIL_FROM,
      to: recipient,
      subject,
      text,
    });
  } catch {
    logger.error({
      reqId: '-',
      module: 'mailer',
      code: 'ZD-EML-001',
      message: 'Email delivery failed',
      meta: { to: maskEmail(recipient), driver: 'smtp' },
    });
    throw new ApiError('ZD-EML-001');
  }
}

module.exports = { sendMail, maskEmail };