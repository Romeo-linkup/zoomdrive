const { pool, withTransaction } = require('../../db/pool');
const { writeAudit } = require('../../lib/audit');
const { encrypt } = require('../../lib/crypto');
const { notifyBestEffort } = require('../notifications/notifications.service');
const { enqueueEmail, enqueueAdminAlert } = require('../notifications/emailOutbox.service');
const { template } = require('../notifications/emailTemplates');

function formatSast(date) {
  return date.toLocaleString('en-ZA', {
    timeZone: 'Africa/Johannesburg',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

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
  const userId = req.user.id;

  const existing = await pool.query(
    'SELECT updated_at FROM provider_bank_details WHERE provider_user_id = $1',
    [userId]
  );
  const isUpdate = existing.rows.length > 0;

  let newUpdatedAt;
  await withTransaction(async (client) => {
    const result = await client.query(
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
         updated_at = now()
       RETURNING updated_at`,
      [userId, accountHolder, bankName, accountType, branchCode, accountNumberEnc, accountLast4]
    );
    newUpdatedAt = result.rows[0].updated_at;
    await writeAudit({
      actorType: 'user',
      actorId: userId,
      action: 'provider.bank_details_update',
      entity: 'provider_bank_details',
      entityId: userId,
      meta: { fields: ['accountHolder', 'bankName', 'accountType', 'branchCode', 'accountNumber'] },
      requestId: req.id,
      ip: req.ip,
    }, client);
  });

  await notifyBestEffort({
    userId,
    title: 'Your payout bank details were changed. If this was not you, contact support now.',
    kind: 'security',
  });

  if (isUpdate) {
    const epoch = Math.floor(new Date(newUpdatedAt).getTime() / 1000);
    const changedAt = formatSast(new Date(newUpdatedAt));
    const { subject, text } = template('bank_details_changed', { bankName, accountLast4, changedAt });
    await enqueueEmail({
      userId,
      kind: 'bank_details_changed',
      subject,
      text,
      dedupeKey: `bank_details_changed:${userId}:${epoch}`,
    });

    const payout = await pool.query(
      'SELECT paid_at FROM payouts WHERE provider_user_id = $1 ORDER BY paid_at DESC LIMIT 1',
      [userId]
    );
    if (payout.rows[0]) {
      const lastPayout = new Date(payout.rows[0].paid_at);
      const diffDays = (new Date(newUpdatedAt) - lastPayout) / (1000 * 60 * 60 * 24);
      if (diffDays >= 0 && diffDays <= 7) {
        await enqueueAdminAlert({
          kind: 'admin_alert',
          subject: 'Provider bank details changed shortly after payout',
          text: `Provider ${userId} changed bank details ${diffDays.toFixed(1)} days after their last payout. Bank: ${bankName}, ending ${accountLast4}.`,
          dedupeKey: `admin_alert:bank_details_changed:${userId}:${epoch}`,
        });
      }
    }
  }

  res.ok(await bankDetailsPayload(userId));
}

module.exports = { get, put };