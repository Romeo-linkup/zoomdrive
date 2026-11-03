const { pool, withTransaction } = require('../../db/pool');
const { writeAudit } = require('../../lib/audit');
const { encrypt } = require('../../lib/crypto');
const { notifyBestEffort } = require('../notifications/notifications.service');

async function bankDetailsPayload(providerId) {
  const result = await pool.query(
    `SELECT account_holder, bank_name, account_type, branch_code, account_last4, updated_at
     FROM provider_bank_details
     WHERE provider_user_id = $1`,
    [providerId]
  );
  const row = result.rows[0];
  if (!row) return { saved: false };
  return {
    saved: true,
    accountHolder: row.account_holder,
    bankName: row.bank_name,
    accountType: row.account_type,
    branchCode: row.branch_code,
    accountLast4: row.account_last4,
    updatedAt: row.updated_at,
  };
}

async function get(req, res) {
  res.ok(await bankDetailsPayload(req.user.id));
}

async function put(req, res) {
  const { accountHolder, bankName, accountType, branchCode, accountNumber } = req.body;
  const accountNumberEnc = encrypt(accountNumber);
  const accountLast4 = accountNumber.slice(-4);

  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO provider_bank_details (
         provider_user_id, account_holder, bank_name, account_type, branch_code,
         account_number_enc, account_last4, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())
       ON CONFLICT (provider_user_id) DO UPDATE SET
         account_holder = EXCLUDED.account_holder,
         bank_name = EXCLUDED.bank_name,
         account_type = EXCLUDED.account_type,
         branch_code = EXCLUDED.branch_code,
         account_number_enc = EXCLUDED.account_number_enc,
         account_last4 = EXCLUDED.account_last4,
         updated_at = now()`,
      [req.user.id, accountHolder, bankName, accountType, branchCode, accountNumberEnc, accountLast4]
    );
    await writeAudit({
      actorType: 'user',
      actorId: req.user.id,
      action: 'provider.bank_details_update',
      entity: 'provider_bank_details',
      entityId: req.user.id,
      meta: { last4: accountLast4 },
      requestId: req.id,
      ip: req.ip,
    }, client);
  });

  await notifyBestEffort({
    userId: req.user.id,
    title: 'Your payout bank details were changed. If this was not you, contact support now.',
    kind: 'security',
  });
  res.ok(await bankDetailsPayload(req.user.id));
}

module.exports = { get, put };