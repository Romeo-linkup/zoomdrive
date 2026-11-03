const crypto = require('crypto');
const { env } = require('../../config/env');
const { query, withTransaction } = require('../../db/pool');
const ApiError = require('../../lib/ApiError');
const { logger, maskPhone } = require('../../lib/logger');

function generateCode() {
  const code = crypto.randomInt(0, 10000);
  return code.toString().padStart(4, '0');
}

function hashCode(phone, code) {
  const hmac = crypto.createHmac('sha256', env.JWT_SECRET);
  hmac.update(phone + ':' + code);
  return hmac.digest('hex');
}

function verifyHash(phone, code, hash) {
  const expected = hashCode(phone, code);
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hash));
}

async function requestOtp({ phone, app, ip, requestId }) {
  const perPhoneLimit = await query(
    `SELECT COUNT(*) as count
     FROM otp_codes
     WHERE phone = $1
       AND created_at > now() - interval '10 minutes'`,
    [phone]
  );

  if (parseInt(perPhoneLimit.rows[0].count, 10) >= 3) {
    throw new ApiError('ZD-AUTH-003', { message: 'Too many codes requested. Try again in a few minutes.' });
  }

  const authService = require('./auth.service');
  await authService.assertAppAccess({ phone, app });

  await query(
    `UPDATE otp_codes
     SET consumed_at = now()
     WHERE phone = $1
       AND consumed_at IS NULL`,
    [phone]
  );

  const code = generateCode();
  const codeHash = hashCode(phone, code);

  const userExists = await query('SELECT id FROM users WHERE phone = $1', [phone]);
  const purpose = userExists.rows.length > 0 ? 'login' : 'signup';

  const otpResult = await query(
    `INSERT INTO otp_codes (phone, code_hash, purpose, expires_at, attempts)
     VALUES ($1, $2, $3, now() + interval '5 minutes', 0)
     RETURNING id`,
    [phone, codeHash, purpose]
  );

  const driverName = env.OTP_DRIVER === 'console' ? './otp.drivers/console' : './otp.drivers/bulksms';
  const driver = require(driverName);
  try {
    await driver.send({ phone, code });
  } catch (error) {
    await query(
      'UPDATE otp_codes SET consumed_at = now() WHERE id = $1 AND consumed_at IS NULL',
      [otpResult.rows[0].id]
    );
    throw error;
  }

  logger.info({
    reqId: requestId,
    module: 'otp',
    action: 'request',
    meta: { phone: maskPhone(phone), app, purpose },
  });

  const result = { expiresInSeconds: 300 };
  if (env.OTP_DEV_ECHO && env.NODE_ENV !== 'production') {
    result.devCode = code;
  }

  return result;
}

async function verifyOtp({ phone, code, app, ip, requestId }) {
  let verificationFailed = false;
  await withTransaction(async (client) => {
    const result = await client.query(
      `SELECT id, code_hash, attempts, expires_at
       FROM otp_codes
       WHERE phone = $1
         AND consumed_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [phone]
    );

    if (result.rows.length === 0) {
      throw new ApiError('ZD-AUTH-002');
    }

    const row = result.rows[0];

    if (new Date(row.expires_at) < new Date()) {
      await client.query('UPDATE otp_codes SET consumed_at = now() WHERE id = $1', [row.id]);
      throw new ApiError('ZD-AUTH-002');
    }

    if (row.attempts >= 5) {
      await client.query('UPDATE otp_codes SET consumed_at = now() WHERE id = $1', [row.id]);
      throw new ApiError('ZD-AUTH-003', { message: 'Too many wrong codes. Request a new one.' });
    }

    const isCorrect = verifyHash(phone, code, row.code_hash);

    if (!isCorrect) {
      const newAttempts = row.attempts + 1;
      if (newAttempts >= 5) {
        await client.query('UPDATE otp_codes SET consumed_at = now(), attempts = $1 WHERE id = $2', [newAttempts, row.id]);
      } else {
        await client.query('UPDATE otp_codes SET attempts = $1 WHERE id = $2', [newAttempts, row.id]);
      }
      verificationFailed = true;
      return;
    }

    await client.query('UPDATE otp_codes SET consumed_at = now() WHERE id = $1', [row.id]);

    logger.info({
      reqId: requestId,
      module: 'otp',
      action: 'verify',
      meta: { phone: maskPhone(phone), app },
    });
  });

  if (verificationFailed) {
    throw new ApiError('ZD-AUTH-002');
  }

  return { success: true };
}

module.exports = { generateCode, hashCode, requestOtp, verifyOtp };
