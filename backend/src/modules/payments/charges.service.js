const crypto = require('crypto');
const { pool, query, withTransaction } = require('../../db/pool');
const ApiError = require('../../lib/ApiError');
const { writeAudit } = require('../../lib/audit');
const { createNotification } = require('../notifications/notifications.service');
const paystack = require('./paystack.service');
const { env } = require('../../config/env');
const pricing = require('../admin/pricingPolicy');

function mapCharge(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    purpose: row.purpose,
    amountCents: row.amount_cents,
    status: row.status,
    reference: row.paystack_ref,
    paidAt: row.paid_at,
    meta: row.meta,
    createdAt: row.created_at,
  };
}

async function getAccountEmail(user) {
  if (user.email) return user.email;
  const { rows } = await query('SELECT email FROM users WHERE id = $1', [user.id]);
  if (rows[0] && rows[0].email) return rows[0].email;
  if (!env.PAYSTACK_FALLBACK_EMAIL_DOMAIN) throw new ApiError('ZD-PAY-003');
  return `u${user.id}@${env.PAYSTACK_FALLBACK_EMAIL_DOMAIN}`;
}

function callbackUrlFor(purpose) {
  const origin = env.FRONTEND_ORIGINS[0];
  if (!origin) throw new ApiError('ZD-PAY-003');
  const base = origin.replace(/\/+$/, '');
  return `${base}/${purpose === 'provider_registration' ? 'provider' : 'driver'}/`;
}

async function startCharge({ user, purpose, amountCents, meta = {} }) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new ApiError('ZD-PAY-005');
  }
  if (!user || !Number.isSafeInteger(Number(user.id))
      || !['provider_registration', 'driver_plus'].includes(purpose)) {
    throw new ApiError('ZD-VAL-001', { message: 'Invalid charge details' });
  }

  const userId = Number(user.id);
  const email = await getAccountEmail(user);
  const prefix = purpose === 'provider_registration' ? 'reg' : 'plus';
  const reference = `zd_${prefix}_${userId}_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;
  const safeMeta = meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : {};
  const charge = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO platform_charges (user_id, purpose, amount_cents, status, paystack_ref, meta)
       VALUES ($1, $2, $3, 'pending', $4, $5::jsonb)
       RETURNING *`,
      [userId, purpose, amountCents, reference, JSON.stringify(safeMeta)]
    );
    await writeAudit({
      actorType: 'user',
      actorId: userId,
      action: 'payment.charge_started',
      entity: 'platform_charges',
      entityId: rows[0].id,
      meta: { purpose, amountCents },
    }, client);
    return rows[0];
  });

  try {
    const transaction = await paystack.initializeTransaction({
      email,
      amountCents,
      reference,
      metadata: { ...safeMeta, chargeId: charge.id, purpose },
      callbackUrl: callbackUrlFor(purpose),
    });
    if (transaction.reference !== reference) throw new ApiError('ZD-PAY-001');
    return { authorizationUrl: transaction.authorizationUrl, reference };
  } catch (err) {
    await query(
      `UPDATE platform_charges
       SET status = 'failed'
       WHERE id = $1 AND status = 'pending'`,
      [charge.id]
    );
    throw err;
  }
}

async function getChargeByReference(reference, expectUserId) {
  const { rows } = await query(
    `SELECT * FROM platform_charges WHERE paystack_ref = $1`,
    [reference]
  );
  const row = rows[0];
  if (!row || (expectUserId !== undefined && Number(row.user_id) !== Number(expectUserId))) {
    throw new ApiError('ZD-PAY-004');
  }
  return row;
}

async function updateFailedCharge(charge) {
  const { rows } = await query(
    `UPDATE platform_charges
     SET status = 'failed'
     WHERE id = $1 AND status <> 'paid'
     RETURNING *`,
    [charge.id]
  );
  if (rows[0]) return mapCharge(rows[0]);
  const current = await query('SELECT * FROM platform_charges WHERE id = $1', [charge.id]);
  return mapCharge(current.rows[0]);
}

async function settleByReference(reference, { expectUserId } = {}) {
  const initialCharge = await getChargeByReference(reference, expectUserId);
  if (initialCharge.status === 'paid') return mapCharge(initialCharge);

  const verified = await paystack.verifyTransaction(reference);
  if (verified.reference !== reference) throw new ApiError('ZD-PAY-001');

  if (verified.status === 'success') {
    if (verified.amountCents !== Number(initialCharge.amount_cents) || verified.currency !== 'ZAR') {
      throw new ApiError('ZD-PAY-001', { message: 'Payment amount could not be verified' });
    }

    return withTransaction(async (client) => {
      const { rows } = await client.query(
        'SELECT * FROM platform_charges WHERE id = $1 FOR UPDATE',
        [initialCharge.id]
      );
      const charge = rows[0];
      if (!charge) throw new ApiError('ZD-PAY-004');
      if (charge.status === 'paid') return mapCharge(charge);
      if (Number(charge.amount_cents) !== verified.amountCents) {
        throw new ApiError('ZD-PAY-001', { message: 'Payment amount could not be verified' });
      }

      const updated = await client.query(
        `UPDATE platform_charges
         SET status = 'paid', paid_at = now()
         WHERE id = $1 AND status <> 'paid'
         RETURNING *`,
        [charge.id]
      );
      if (!updated.rows[0]) {
        const current = await client.query('SELECT * FROM platform_charges WHERE id = $1', [charge.id]);
        return mapCharge(current.rows[0]);
      }

      if (charge.purpose === 'provider_registration') {
        const profile = await client.query(
          `UPDATE provider_profiles
           SET registration_paid_at = now(), registration_charge_id = $1
           WHERE user_id = $2
           RETURNING user_id`,
          [charge.id, charge.user_id]
        );
        if (profile.rows.length === 0) throw new ApiError('ZD-PAY-004');
        await createNotification({
          userId: charge.user_id,
          title: 'Registration fee received',
          body: 'Your provider registration fee has been received.',
          kind: 'provider_registration_paid',
        }, client);
      } else if (charge.purpose === 'driver_plus') {
        await client.query(
          `INSERT INTO driver_memberships (user_id, paid_until)
           VALUES ($1, now() + interval '30 days')
           ON CONFLICT (user_id) DO UPDATE SET
             paid_until = GREATEST(now(), COALESCE(driver_memberships.paid_until, now()))
               + interval '30 days'`,
          [charge.user_id]
        );
      }

      await writeAudit({
        actorType: 'system',
        action: 'payment.charge_paid',
        entity: 'platform_charges',
        entityId: charge.id,
        meta: { purpose: charge.purpose, amountCents: charge.amount_cents },
      }, client);
      return mapCharge(updated.rows[0]);
    });
  }

  if (verified.status === 'failed' || verified.status === 'abandoned') {
    return updateFailedCharge(initialCharge);
  }

  return mapCharge(initialCharge);
}

async function getRegistrationState(userId, client = pool) {
  const [values, profileResult] = await Promise.all([
    pricing.readValues(client),
    client.query(
      `SELECT registration_paid_at, registration_waived
       FROM provider_profiles
       WHERE user_id = $1`,
      [userId]
    ),
  ]);
  const profile = profileResult.rows[0] || {};
  const enabled = values.providerRegistrationFeeEnabled;
  const paidAt = profile.registration_paid_at || null;
  const paid = Boolean(paidAt);
  const waived = profile.registration_waived === true;
  return {
    enabled,
    amountCents: values.providerRegistrationFeeCents,
    paid,
    paidAt,
    waived,
    required: enabled && !paid && !waived,
  };
}

module.exports = { startCharge, settleByReference, getRegistrationState };