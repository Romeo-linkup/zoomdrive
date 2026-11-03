const crypto = require('crypto');
const { env } = require('../../config/env');
const { query, withTransaction } = require('../../db/pool');
const ApiError = require('../../lib/ApiError');
const { logger, maskEmail } = require('../../lib/logger');
const { writeAudit } = require('../../lib/audit');

const OTP_LOCK_NAMESPACE = 1879048192;

function generateCode() {
  const limit = 10 ** env.OTP_LENGTH;
  return crypto.randomInt(0, limit).toString().padStart(env.OTP_LENGTH, '0');
}

function hashCode(email, code) {
  const hmac = crypto.createHmac('sha256', env.JWT_SECRET);
  hmac.update(email + ':' + code);
  return hmac.digest('hex');
}

function verifyHash(email, code, hash) {
  const expected = hashCode(email, code);
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hash));
}

function emailHash(email) {
  return crypto.createHmac('sha256', env.JWT_SECRET)
    .update(email)
    .digest('hex')
    .slice(0, 16);
}

function auditAnonymousOtp({ client, email, action, reason, app, requestId, ip, entityId }) {
  return writeAudit({
    actorType: 'anonymous',
    actorId: null,
    action,
    entity: 'otp_codes',
    entityId,
    meta: { emailHash: emailHash(email), ...(reason ? { reason } : {}), ...(app ? { app } : {}) },
    requestId,
    ip,
  }, client);
}

function emailLimitError(message) {
  return new ApiError('ZD-AUTH-003', { message });
}

async function requestOtp({ email, app, ip, requestId }) {
  const normalizedEmail = String(email).trim().toLowerCase();
  const code = generateCode();
  const codeHash = hashCode(normalizedEmail, code);

  const otp = await withTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock($1, 1)', [OTP_LOCK_NAMESPACE]);
    await client.query(
      'SELECT pg_advisory_xact_lock($1, hashtext($2))',
      [OTP_LOCK_NAMESPACE, normalizedEmail]
    );

    const limitsResult = await client.query(
      `SELECT
         COUNT(*) FILTER (WHERE created_at > now() - interval '10 minutes') AS recent_count,
         COUNT(*) FILTER (WHERE created_at > now() - interval '24 hours') AS daily_count,
         COALESCE(bool_or(created_at > now() - interval '30 seconds'), false) AS wait_required
       FROM otp_codes
       WHERE email = $1`,
      [normalizedEmail]
    );
    const limits = limitsResult.rows[0];

    if (limits.wait_required) {
      throw emailLimitError('Please wait before requesting another code');
    }
    if (Number(limits.recent_count) >= 3 || Number(limits.daily_count) >= 10) {
      throw emailLimitError('Too many codes were requested for this email. Try again later.');
    }

    const globalLimitResult = await client.query(
      `SELECT COUNT(*) AS count
       FROM otp_codes
       WHERE email IS NOT NULL
         AND (created_at AT TIME ZONE 'Africa/Johannesburg')::date =
             (now() AT TIME ZONE 'Africa/Johannesburg')::date`
    );
    if (Number(globalLimitResult.rows[0].count) >= env.OTP_DAILY_EMAIL_CAP) {
      throw emailLimitError('Too many sign-in codes were requested today. Please try again tomorrow.');
    }

    await client.query(
      `UPDATE otp_codes
       SET consumed_at = now()
       WHERE email = $1 AND consumed_at IS NULL`,
      [normalizedEmail]
    );

    const userResult = await client.query(
      'SELECT id FROM users WHERE lower(email) = $1 LIMIT 1',
      [normalizedEmail]
    );
    const purpose = userResult.rows.length > 0 ? 'login' : 'signup';
    const inserted = await client.query(
      `INSERT INTO otp_codes (email, phone, code_hash, purpose, expires_at, attempts)
       VALUES ($1, NULL, $2, $3, now() + interval '5 minutes', 0)
       RETURNING id`,
      [normalizedEmail, codeHash, purpose]
    );
    const id = inserted.rows[0].id;

    await auditAnonymousOtp({
      client,
      email: normalizedEmail,
      action: 'auth.otp_requested',
      app,
      requestId,
      ip,
      entityId: id,
    });

    return { id };
  });

  const driverPath = env.OTP_DRIVER === 'console'
    ? './otp.drivers/console'
    : env.OTP_DRIVER === 'email'
      ? './otp.drivers/email'
      : './otp.drivers/bulksms';
  const driver = require(driverPath);
  try {
    await driver.send({ email: normalizedEmail, code });
  } catch (error) {
    await query(
      'UPDATE otp_codes SET consumed_at = now() WHERE id = $1 AND consumed_at IS NULL',
      [otp.id]
    );
    throw error;
  }

  logger.info({
    reqId: requestId,
    module: 'otp',
    action: 'request',
    meta: { app },
  });

  const result = {
    sent: true,
    otpLength: env.OTP_LENGTH,
    maskedEmail: maskEmail(normalizedEmail),
    expiresInSeconds: 300,
  };
  if (env.OTP_DEV_ECHO && env.OTP_DRIVER === 'console' && env.NODE_ENV !== 'production') {
    result.devCode = code;
  }
  return result;
}

async function verifyOtp({ email, code, app, ip, requestId }) {
  const normalizedEmail = String(email).trim().toLowerCase();
  const outcome = await withTransaction(async (client) => {
    const result = await client.query(
      `SELECT id, code_hash, attempts, expires_at
       FROM otp_codes
       WHERE email = $1
         AND consumed_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [normalizedEmail]
    );

    if (result.rows.length === 0) {
      await auditAnonymousOtp({
        client,
        email: normalizedEmail,
        action: 'auth.otp_failed',
        reason: 'invalid',
        app,
        requestId,
        ip,
      });
      return { code: 'ZD-AUTH-002' };
    }

    const row = result.rows[0];
    if (new Date(row.expires_at) < new Date()) {
      await client.query('UPDATE otp_codes SET consumed_at = now() WHERE id = $1', [row.id]);
      await auditAnonymousOtp({
        client,
        email: normalizedEmail,
        action: 'auth.otp_failed',
        reason: 'expired',
        app,
        requestId,
        ip,
        entityId: row.id,
      });
      return { code: 'ZD-AUTH-002' };
    }

    if (row.attempts >= 5) {
      await client.query('UPDATE otp_codes SET consumed_at = now() WHERE id = $1', [row.id]);
      await auditAnonymousOtp({
        client,
        email: normalizedEmail,
        action: 'auth.otp_failed',
        reason: 'attempts',
        app,
        requestId,
        ip,
        entityId: row.id,
      });
      return {
        code: 'ZD-AUTH-003',
        message: 'Too many wrong codes. Request a new one.',
      };
    }

    if (!verifyHash(normalizedEmail, code, row.code_hash)) {
      const attempts = row.attempts + 1;
      const exhausted = attempts >= 5;
      if (exhausted) {
        await client.query(
          'UPDATE otp_codes SET consumed_at = now(), attempts = $1 WHERE id = $2',
          [attempts, row.id]
        );
      } else {
        await client.query('UPDATE otp_codes SET attempts = $1 WHERE id = $2', [attempts, row.id]);
      }
      await auditAnonymousOtp({
        client,
        email: normalizedEmail,
        action: 'auth.otp_failed',
        reason: exhausted ? 'attempts' : 'invalid',
        app,
        requestId,
        ip,
        entityId: row.id,
      });
      return {
        code: exhausted ? 'ZD-AUTH-003' : 'ZD-AUTH-002',
        message: exhausted ? 'Too many wrong codes. Request a new one.' : undefined,
      };
    }

    await client.query('UPDATE otp_codes SET consumed_at = now() WHERE id = $1', [row.id]);
    logger.info({
      reqId: requestId,
      module: 'otp',
      action: 'verify',
      meta: { app },
    });
    return { success: true };
  });

  if (outcome.code) {
    throw new ApiError(outcome.code, { message: outcome.message });
  }
  return { success: true };
}

module.exports = { generateCode, hashCode, requestOtp, verifyOtp };
