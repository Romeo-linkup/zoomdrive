// Endpoint and fields follow Brevo transactional email API v3; verify against Brevo documentation before production.
const nodemailer = require('nodemailer');
const ApiError = require('./ApiError');
const { env } = require('../config/env');
const { logger, maskEmail } = require('./logger');

function resolveRecipient(to) {
  const address = String(to || '').trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return address;
  if (address && env.EMAIL_FALLBACK_DOMAIN && !address.includes('@')) {
    return `${address}@${env.EMAIL_FALLBACK_DOMAIN}`;
  }
  throw new ApiError('ZD-EML-001', { message: 'Email recipient is unavailable' });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function sendMail({ to, subject, text, html }) {
  const recipient = resolveRecipient(to);

  if (env.EMAIL_DRIVER === 'console') {
    if (env.NODE_ENV !== 'development') {
      throw new ApiError('ZD-EML-001', { message: 'Console email is available only in development' });
    }
    logger.info({
      reqId: '-',
      module: 'mail',
      message: 'Development email',
    });
    return;
  }

  if (env.EMAIL_DRIVER === 'smtp') {
    try {
      const transport = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_PORT === 465,
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      });
      await transport.sendMail({
        from: { name: env.EMAIL_FROM_NAME, address: env.EMAIL_FROM },
        to: recipient,
        subject,
        text,
        html,
      });
    } catch {
      logger.error({
        reqId: '-',
        module: 'mail',
        code: 'ZD-EML-001',
        message: 'Email delivery failed',
        meta: { driver: 'smtp' },
      });
      throw new ApiError('ZD-EML-001');
    }
    return;
  }

  let response = null;
  let failureKind = null;
  let timedOut = false;
  let timeoutId;
  try {
    const controller = new AbortController();
    timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 8000);
    response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': env.BREVO_API_KEY,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: env.EMAIL_FROM_NAME, email: env.EMAIL_FROM },
        to: [{ email: recipient }],
        subject,
        textContent: text,
        htmlContent: html || `<pre>${escapeHtml(text)}</pre>`,
      }),
      signal: controller.signal,
    });
  } catch {
    failureKind = timedOut ? 'timeout' : 'network';
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response || !response.ok) {
    logger.warn({
      reqId: '-',
      module: 'mail',
      code: 'ZD-EML-001',
      message: 'Brevo delivery failed',
      meta: { status: response ? response.status : failureKind },
    });
    throw new ApiError('ZD-EML-001');
  }
}

async function sendOtpEmail({ to, code, minutes }) {
  const text = `Your ZoomDrive code is ${code}. It expires in ${minutes} minutes. If you did not ask for it, ignore this email. Never share this code.`;
  const html = `<p>Your ZoomDrive code is <strong>${escapeHtml(code)}</strong>.</p><p>It expires in ${minutes} minutes. If you did not ask for it, ignore this email. Never share this code.</p>`;
  return sendMail({
    to,
    subject: `Your ZoomDrive code: ${code}`,
    text,
    html,
  });
}

module.exports = { sendMail, sendOtpEmail, maskEmail };