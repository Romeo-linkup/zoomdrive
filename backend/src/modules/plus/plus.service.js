const { pool, withTransaction } = require('../../db/pool');
const ApiError = require('../../lib/ApiError');
const pricing = require('../admin/pricingPolicy');
const charges = require('../payments/charges.service');

async function getPlusState(userId, client = pool) {
  const [values, result] = await Promise.all([
    pricing.readValues(client),
    client.query(
      `SELECT trial_ends_at, paid_until
       FROM driver_memberships
       WHERE user_id = $1`,
      [userId]
    ),
  ]);
  const member = result.rows[0] || null;
  const now = Date.now();
  const trialEndsAt = member ? member.trial_ends_at : null;
  const paidUntil = member ? member.paid_until : null;
  const trialActive = Boolean(trialEndsAt && new Date(trialEndsAt).getTime() > now);
  const paidActive = Boolean(paidUntil && new Date(paidUntil).getTime() > now);
  const enabled = values.driverPlusEnabled;
  const active = enabled && Boolean(member) && (trialActive || paidActive);
  return {
    enabled,
    priceCents: values.driverPlusMonthlyCents,
    trialDays: values.driverPlusTrialDays,
    member: Boolean(member),
    active,
    onTrial: active && trialActive && !paidActive,
    trialEndsAt,
    paidUntil,
  };
}

async function join(userId) {
  const values = await pricing.readValues();
  if (!values.driverPlusEnabled) throw new ApiError('ZD-PLUS-001');

  await withTransaction(async (client) => {
    const existing = await client.query(
      'SELECT user_id FROM driver_memberships WHERE user_id = $1 FOR UPDATE',
      [userId]
    );
    if (existing.rows.length > 0) return;
    await client.query(
      `INSERT INTO driver_memberships (user_id, trial_ends_at)
       VALUES ($1, now() + ($2 * interval '1 day'))
       ON CONFLICT (user_id) DO NOTHING`,
      [userId, values.driverPlusTrialDays]
    );
  });
  return getPlusState(userId);
}

async function startPay(user) {
  const values = await pricing.readValues();
  if (!values.driverPlusEnabled) throw new ApiError('ZD-PLUS-001');
  if (values.driverPlusMonthlyCents <= 0) throw new ApiError('ZD-PAY-005');

  await pool.query(
    `INSERT INTO driver_memberships (user_id, trial_ends_at)
     VALUES ($1, now())
     ON CONFLICT (user_id) DO NOTHING`,
    [user.id]
  );
  return charges.startCharge({
    user,
    purpose: 'driver_plus',
    amountCents: values.driverPlusMonthlyCents,
  });
}

async function isPlusActive(driverId) {
  const state = await getPlusState(driverId);
  return state.active;
}

module.exports = { getPlusState, join, startPay, isPlusActive };