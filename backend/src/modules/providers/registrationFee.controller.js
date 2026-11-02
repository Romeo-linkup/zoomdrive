const { query } = require('../../db/pool');
const ApiError = require('../../lib/ApiError');
const charges = require('../payments/charges.service');

async function status(req, res) {
  res.ok(await charges.getRegistrationState(req.user.id));
}

async function pay(req, res) {
  const { rows } = await query(
    'SELECT verification_status FROM provider_profiles WHERE user_id = $1',
    [req.user.id]
  );
  if (!rows[0] || rows[0].verification_status !== 'approved') {
    throw new ApiError('ZD-PROV-005');
  }

  const state = await charges.getRegistrationState(req.user.id);
  if (!state.required) throw new ApiError('ZD-PAY-005');
  const result = await charges.startCharge({
    user: req.user,
    purpose: 'provider_registration',
    amountCents: state.amountCents,
  });
  res.ok(result);
}

async function verify(req, res) {
  await charges.settleByReference(req.body.reference, { expectUserId: req.user.id });
  res.ok(await charges.getRegistrationState(req.user.id));
}

module.exports = { status, pay, verify };