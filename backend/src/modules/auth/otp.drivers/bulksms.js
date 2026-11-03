// Endpoint and fields follow BulkSMS REST v1; verify against the provider documentation before enabling in production.
const { env } = require('../../../config/env');
const ApiError = require('../../../lib/ApiError');
const { logger } = require('../../../lib/logger');

async function send({ phone, code }) {
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

    const message = {
      to: phone,
      body: `ZoomDrive code: ${code}. It expires in 5 minutes. Do not share it.`,
    };
    if (env.SMS_SENDER_ID) message.from = env.SMS_SENDER_ID;

    response = await fetch('https://api.bulksms.com/v1/messages', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${env.SMS_API_KEY}:${env.SMS_API_SECRET}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
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
      module: 'otp',
      code: 'ZD-SMS-001',
      message: 'BulkSMS delivery failed',
      meta: {
        status: response ? response.status : failureKind,
        phoneLast4: String(phone || '').slice(-4),
      },
    });
    throw new ApiError('ZD-SMS-001');
  }

  return { delivered: true };
}

module.exports = { name: 'bulksms', send };