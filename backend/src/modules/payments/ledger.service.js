const { pool } = require('../../db/pool');

async function postEarning(client, { providerId, requestId, amountCents, note = null }) {
  const result = await client.query(
    `INSERT INTO provider_ledger (provider_user_id, request_id, entry_type, amount_cents, note)
     VALUES ($1, $2, 'earning', $3, $4)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [providerId, requestId, amountCents, note]
  );
  return result.rows.length > 0;
}

async function postCashCommission(client, { providerId, requestId, amountCents }) {
  const result = await client.query(
    `INSERT INTO provider_ledger (provider_user_id, request_id, entry_type, amount_cents)
     VALUES ($1, $2, 'commission', $3)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [providerId, requestId, -amountCents]
  );
  return result.rows.length > 0;
}

async function postPayout(client, { providerId, payoutId, amountCents, note = null }) {
  const result = await client.query(
    `INSERT INTO provider_ledger (
       provider_user_id, payout_id, entry_type, amount_cents, note
     )
     VALUES ($1, $2, 'payout', $3, $4)
     RETURNING id`,
    [providerId, payoutId, -amountCents, note]
  );
  return result.rows.length > 0;
}

async function postAdjustment(client, { providerId, amountCents, note }) {
  const result = await client.query(
    `INSERT INTO provider_ledger (provider_user_id, entry_type, amount_cents, note)
     VALUES ($1, 'adjustment', $2, $3)
     RETURNING id`,
    [providerId, amountCents, note]
  );
  return result.rows.length > 0;
}

async function getBalance(providerId, client = pool) {
  const result = await client.query(
    `SELECT COALESCE(SUM(amount_cents), 0) AS balance_cents
     FROM provider_ledger
     WHERE provider_user_id = $1`,
    [providerId]
  );
  return Number(result.rows[0].balance_cents);
}

module.exports = { postEarning, postCashCommission, postPayout, postAdjustment, getBalance };