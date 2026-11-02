const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { pool, query, withTransaction } = require('../../db/pool');
const ApiError = require('../../lib/ApiError');
const { writeAudit } = require('../../lib/audit');
const { logger } = require('../../lib/logger');
const { env } = require('../../config/env');
const { sendMail } = require('../../lib/mailer');
const pricing = require('./pricingPolicy');

const CHALLENGE_TTL_MINUTES = 10;

function challengeKey() {
  return crypto.createHmac('sha256', env.JWT_SECRET)
    .update('zoomdrive-pricing-challenge-v1')
    .digest();
}

function hashCode(challengeId, code) {
  return crypto.createHmac('sha256', challengeKey())
    .update(`${challengeId}:${code}`)
    .digest('hex');
}

function hashesMatch(expectedHex, actualHex) {
  if (!/^[a-f0-9]{64}$/i.test(expectedHex) || !/^[a-f0-9]{64}$/i.test(actualHex)) return false;
  return crypto.timingSafeEqual(Buffer.from(expectedHex, 'hex'), Buffer.from(actualHex, 'hex'));
}

async function getPricingData(client = pool) {
  const [values, lastChange] = await Promise.all([
    pricing.readValues(client),
    pricing.getLastChange(client),
  ]);
  const nextAt = pricing.nextAllowedAt(lastChange && lastChange.changedAt);
  return {
    values,
    lastChange,
    nextAllowedAt: nextAt ? nextAt.toISOString() : null,
    changeAllowed: !nextAt || nextAt.getTime() <= Date.now(),
  };
}

async function getPricing(req, res) {
  res.ok({ pricing: await getPricingData() });
}

async function createChallenge(req, res) {
  const { rows } = await query(
    'SELECT password_hash FROM admin_users WHERE id = $1',
    [req.admin.id]
  );
  const matches = rows[0] && await bcrypt.compare(req.body.password, rows[0].password_hash);
  if (!matches) {
    throw new ApiError('ZD-ADM-006', { message: 'Admin password is incorrect' });
  }

  const challengeId = crypto.randomUUID();
  const code = String(crypto.randomInt(100000, 1000000));
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MINUTES * 60 * 1000);
  const codeHash = hashCode(challengeId, code);

  await withTransaction(async (client) => {
    await pricing.lockPricing(client);
    await pricing.assertChangeAllowed(client);
    await client.query(
      `UPDATE admin_change_challenges
       SET consumed_at = now()
       WHERE admin_id = $1 AND consumed_at IS NULL`,
      [req.admin.id]
    );
    await client.query(
      `INSERT INTO admin_change_challenges (id, admin_id, code_hash, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [challengeId, req.admin.id, codeHash, expiresAt]
    );
  });

  try {
    await sendMail({
      to: req.admin.email,
      subject: 'ZoomDrive pricing change verification',
      text: `Your pricing change verification code is ${code}. It expires in ${CHALLENGE_TTL_MINUTES} minutes.`,
    });
  } catch (err) {
    await query(
      `UPDATE admin_change_challenges
       SET consumed_at = now()
       WHERE id = $1 AND admin_id = $2 AND consumed_at IS NULL`,
      [challengeId, req.admin.id]
    );
    throw err;
  }

  res.ok({ challengeId, expiresAt: expiresAt.toISOString() }, 201);
}

async function verifyChallenge(req, res) {
  const { challengeId, code } = req.body;
  const result = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT code_hash, expires_at, attempts, verified_at, consumed_at
       FROM admin_change_challenges
       WHERE id = $1 AND admin_id = $2
       FOR UPDATE`,
      [challengeId, req.admin.id]
    );
    const challenge = rows[0];
    if (!challenge || challenge.consumed_at || new Date(challenge.expires_at).getTime() <= Date.now()) {
      return { invalid: true };
    }
    if (challenge.verified_at) return { verified: true };
    if (challenge.attempts >= 5) return { invalid: true };

    const actualHash = hashCode(challengeId, code);
    await client.query(
      'UPDATE admin_change_challenges SET attempts = attempts + 1 WHERE id = $1',
      [challengeId]
    );
    if (!hashesMatch(challenge.code_hash, actualHash)) return { invalid: true };

    await client.query(
      'UPDATE admin_change_challenges SET verified_at = now() WHERE id = $1',
      [challengeId]
    );
    return { verified: true };
  });

  if (result.invalid) {
    throw new ApiError('ZD-ADM-006', { message: 'Pricing challenge is invalid or expired' });
  }
  res.ok({ verified: true });
}

async function applyChanges(req, res) {
  const changes = pricing.validateChanges(req.body.changes);
  const result = await withTransaction(async (client) => {
    await pricing.lockPricing(client);
    const { rows } = await client.query(
      `SELECT verified_at, expires_at, consumed_at
       FROM admin_change_challenges
       WHERE id = $1 AND admin_id = $2
       FOR UPDATE`,
      [req.body.challengeId, req.admin.id]
    );
    const challenge = rows[0];
    if (!challenge
      || !challenge.verified_at
      || challenge.consumed_at
      || new Date(challenge.expires_at).getTime() <= Date.now()) {
      throw new ApiError('ZD-ADM-006', { message: 'Verify a current pricing challenge before applying changes' });
    }

    await pricing.assertChangeAllowed(client);
    const current = await pricing.readValues(client);
    const diff = pricing.diffValues(current, changes);
    if (Object.keys(diff).length === 0) {
      throw new ApiError('ZD-VAL-001', { message: 'The supplied values do not change pricing' });
    }

    for (const [key, change] of Object.entries(diff)) {
      await client.query(
        `INSERT INTO app_settings (key, value, updated_at, updated_by)
         VALUES ($1, $2, now(), $3)
         ON CONFLICT (key) DO UPDATE SET
           value = EXCLUDED.value,
           updated_at = now(),
           updated_by = EXCLUDED.updated_by`,
        [key, pricing.valueToString(change.to), req.admin.id]
      );
    }

    await client.query(
      'UPDATE admin_change_challenges SET consumed_at = now() WHERE id = $1',
      [req.body.challengeId]
    );
    await client.query(
      `INSERT INTO pricing_change_log (admin_id, challenge_id, changes)
       VALUES ($1, $2, $3::jsonb)`,
      [req.admin.id, req.body.challengeId, JSON.stringify(diff)]
    );
    await writeAudit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'admin.pricing_update',
      entity: 'app_settings',
      meta: { changes: diff },
      requestId: req.id,
      ip: req.ip,
    }, client);

    return diff;
  });

  let summaryEmailSent = true;
  try {
    const summary = Object.entries(result)
      .map(([key, change]) => `${key}: ${change.from} -> ${change.to}`)
      .join('\n');
    await sendMail({
      to: req.admin.email,
      subject: 'ZoomDrive pricing change applied',
      text: `The following pricing changes were applied:\n${summary}`,
    });
  } catch (err) {
    if (!(err instanceof ApiError) || err.code !== 'ZD-EML-001') throw err;
    summaryEmailSent = false;
    logger.warn({
      reqId: req.id,
      module: 'adminPricing',
      code: err.code,
      message: 'Pricing change summary email was not delivered',
    });
  }

  res.ok({ pricing: await getPricingData(), summaryEmailSent });
}

module.exports = { getPricing, createChallenge, verifyChallenge, applyChanges };