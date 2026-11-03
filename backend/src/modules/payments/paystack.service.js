const crypto = require('crypto');
const https = require('https');
const ApiError = require('../../lib/ApiError');
const { env } = require('../../config/env');

const API_HOST = 'api.paystack.co';
const REQUEST_TIMEOUT_MS = 10000;
const MAX_RESPONSE_BYTES = 1024 * 1024;

function isConfigured() {
  return Boolean(env.PAYSTACK_SECRET_KEY);
}

function paystackError() {
  return new ApiError('ZD-PAY-001', {
    message: 'Payment provider is temporarily unavailable. Please try again.',
  });
}

function requestJson(method, path, body) {
  if (!isConfigured()) {
    return Promise.reject(new ApiError('ZD-PAY-003'));
  }

  return new Promise((resolve, reject) => {
    let responseBody = '';
    const bodyBuffer = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const request = https.request({
      hostname: API_HOST,
      path,
      method,
      headers: {
        Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
        Accept: 'application/json',
        ...(bodyBuffer
          ? {
              'Content-Type': 'application/json',
              'Content-Length': bodyBuffer.length,
            }
          : {}),
      },
    }, (response) => {
      response.on('data', (chunk) => {
        responseBody += chunk.toString('utf8');
        if (Buffer.byteLength(responseBody, 'utf8') > MAX_RESPONSE_BYTES) {
          request.destroy();
        }
      });
      response.on('end', () => {
        let payload;
        try {
          payload = JSON.parse(responseBody);
        } catch {
          reject(paystackError());
          return;
        }
        if (!payload || typeof payload !== 'object'
            || response.statusCode < 200 || response.statusCode >= 300
            || payload.status !== true) {
          reject(paystackError());
          return;
        }
        resolve(payload.data);
      });
    });

    const timeout = setTimeout(() => request.destroy(), REQUEST_TIMEOUT_MS);
    request.on('close', () => clearTimeout(timeout));
    request.setTimeout(REQUEST_TIMEOUT_MS, () => request.destroy());
    request.on('error', () => reject(paystackError()));
    request.on('timeout', () => request.destroy());
    if (bodyBuffer) request.write(bodyBuffer);
    request.end();
  });
}

async function initializeTransaction({ email, amountCents, reference, metadata, callbackUrl }) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new ApiError('ZD-PAY-005');
  }
  const data = await requestJson('POST', '/transaction/initialize', {
    email,
    amount: amountCents,
    currency: 'ZAR',
    reference,
    callback_url: callbackUrl,
    metadata,
  });
  if (!data || !data.authorization_url || !data.access_code || !data.reference) {
    throw paystackError();
  }
  return {
    authorizationUrl: data.authorization_url,
    accessCode: data.access_code,
    reference: data.reference,
  };
}

async function verifyTransaction(reference) {
  const data = await requestJson(
    'GET',
    `/transaction/verify/${encodeURIComponent(reference)}`
  );
  if (!data || typeof data.status !== 'string'
      || !Number.isSafeInteger(Number(data.amount))
      || typeof data.currency !== 'string'
      || typeof data.reference !== 'string') {
    throw paystackError();
  }
  return {
    status: data.status,
    amountCents: Number(data.amount),
    feesCents: Number.isInteger(data.fees) ? data.fees : null,
    currency: data.currency,
    reference: data.reference,
    paidAt: data.paid_at || null,
  };
}

function verifyWebhookSignature(rawBuffer, signatureHeader) {
  if (!Buffer.isBuffer(rawBuffer) || !signatureHeader || !isConfigured()) return false;
  const signature = String(signatureHeader);
  if (!/^[a-f0-9]{128}$/i.test(signature)) return false;
  const expected = crypto
    .createHmac('sha512', env.PAYSTACK_SECRET_KEY)
    .update(rawBuffer)
    .digest();
  const supplied = Buffer.from(signature, 'hex');
  return supplied.length === expected.length && crypto.timingSafeEqual(expected, supplied);
}

module.exports = {
  isConfigured,
  initializeTransaction,
  verifyTransaction,
  verifyWebhookSignature,
};