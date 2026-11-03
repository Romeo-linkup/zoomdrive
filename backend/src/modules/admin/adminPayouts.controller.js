const { pool, query, withTransaction } = require('../../db/pool');
const ApiError = require('../../lib/ApiError');
const { writeAudit } = require('../../lib/audit');
const { notifyBestEffort } = require('../notifications/notifications.service');
const ledger = require('../payments/ledger.service');
const { decrypt } = require('../../lib/crypto');
const { toCsv } = require('../../lib/csv');

const PROVIDER_ROWS = `
  WITH ledger_balances AS (
    SELECT provider_user_id, SUM(amount_cents) AS balance_cents
    FROM provider_ledger
    GROUP BY provider_user_id
  ),
  completed_jobs AS (
    SELECT provider_id, COUNT(*) AS jobs_count
    FROM requests
    WHERE status = 'completed' AND provider_id IS NOT NULL
    GROUP BY provider_id
  ),
  last_payouts AS (
    SELECT provider_user_id, MAX(paid_at) AS last_payout_at
    FROM payouts
    GROUP BY provider_user_id
  ),
  provider_rows AS (
    SELECT u.id AS provider_id, u.first_name, u.last_name, u.phone,
           org.name AS company_name,
           COALESCE(lb.balance_cents, 0) AS balance_cents,
           COALESCE(j.jobs_count, 0) AS jobs_count,
           lp.last_payout_at,
           (bd.provider_user_id IS NOT NULL) AS has_bank_details
    FROM users u
    LEFT JOIN provider_profiles pp ON pp.user_id = u.id
    LEFT JOIN organisations org ON org.id = pp.organisation_id
    LEFT JOIN ledger_balances lb ON lb.provider_user_id = u.id
    LEFT JOIN completed_jobs j ON j.provider_id = u.id
    LEFT JOIN last_payouts lp ON lp.provider_user_id = u.id
    LEFT JOIN provider_bank_details bd ON bd.provider_user_id = u.id
    WHERE u.role = 'provider'
      AND (pp.verification_status = 'approved' OR lb.provider_user_id IS NOT NULL)
  )
`;

function providerListWhere({ filter, q: search }) {
  const clauses = [];
  const params = [];
  if (filter === 'owed') clauses.push('balance_cents > 0');
  if (filter === 'owing') clauses.push('balance_cents < 0');
  if (search) {
    const escaped = search.replace(/[\\%_]/g, '\\$&');
    params.push(`%${escaped}%`);
    const param = `$${params.length}`;
    clauses.push(
      `(first_name ILIKE ${param} ESCAPE '\\' OR last_name ILIKE ${param} ESCAPE '\\' ` +
      `OR phone ILIKE ${param} ESCAPE '\\' OR company_name ILIKE ${param} ESCAPE '\\')`
    );
  }
  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

async function list(req, res) {
  const { filter, q, page } = req.validated;
  const pageSize = 25;
  const offset = (page - 1) * pageSize;
  const where = providerListWhere({ filter, q });
  const countResult = await query(
    `${PROVIDER_ROWS}
     SELECT COUNT(*) AS total FROM provider_rows ${where.sql}`,
    where.params
  );
  const rowsResult = await query(
    `${PROVIDER_ROWS}
     SELECT provider_id AS "providerId", first_name AS "firstName",
            last_name AS "lastName", company_name AS "companyName",
            balance_cents AS "balanceCents", jobs_count AS "jobsCount",
            last_payout_at AS "lastPayoutAt", has_bank_details AS "hasBankDetails"
     FROM provider_rows
     ${where.sql}
     ORDER BY balance_cents DESC, provider_id ASC
     LIMIT $${where.params.length + 1} OFFSET $${where.params.length + 2}`,
    [...where.params, pageSize, offset]
  );
  res.ok({
    providers: rowsResult.rows.map((row) => ({
      ...row,
      providerId: Number(row.providerId),
      balanceCents: Number(row.balanceCents),
      jobsCount: Number(row.jobsCount),
      hasBankDetails: Boolean(row.hasBankDetails),
    })),
    page,
    pageSize,
    total: Number(countResult.rows[0].total),
  });
}

async function buildDetail(providerId) {
  const providerResult = await query(
    `SELECT u.id, u.first_name, u.last_name, u.phone, org.name AS company_name
     FROM users u
     LEFT JOIN provider_profiles pp ON pp.user_id = u.id
     LEFT JOIN organisations org ON org.id = pp.organisation_id
     WHERE u.id = $1 AND u.role = 'provider'`,
    [providerId]
  );
  const row = providerResult.rows[0];
  if (!row) throw new ApiError('ZD-ADM-003', { message: 'Provider not found' });

  const [balanceCents, bankResult, entriesResult, payoutsResult] = await Promise.all([
    ledger.getBalance(providerId),
    query(
      `SELECT account_holder, bank_name, account_type, branch_code, account_last4,
              updated_at, (updated_at >= now() - interval '7 days') AS recently_changed
       FROM provider_bank_details WHERE provider_user_id = $1`,
      [providerId]
    ),
    query(
      `SELECT id, entry_type AS type, amount_cents, note, request_id, created_at
       FROM provider_ledger
       WHERE provider_user_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT 100`,
      [providerId]
    ),
    query(
      `SELECT amount_cents, method, reference, paid_at
       FROM payouts
       WHERE provider_user_id = $1
       ORDER BY paid_at DESC, id DESC
       LIMIT 50`,
      [providerId]
    ),
  ]);
  const bankRow = bankResult.rows[0];
  const bank = bankRow
    ? {
        saved: true,
        accountHolder: bankRow.account_holder,
        bankName: bankRow.bank_name,
        accountType: bankRow.account_type,
        branchCode: bankRow.branch_code,
        accountLast4: bankRow.account_last4,
        updatedAt: bankRow.updated_at,
        recentlyChanged: bankRow.recently_changed,
      }
    : { saved: false };

  return {
    provider: {
      id: Number(row.id),
      firstName: row.first_name,
      lastName: row.last_name,
      companyName: row.company_name,
      phone: row.phone,
    },
    balanceCents,
    bank,
    entries: entriesResult.rows.map((entry) => ({
      id: entry.id,
      type: entry.type,
      amountCents: Number(entry.amount_cents),
      note: entry.note,
      requestId: entry.request_id,
      createdAt: entry.created_at,
    })),
    payouts: payoutsResult.rows.map((payout) => ({
      amountCents: Number(payout.amount_cents),
      method: payout.method,
      reference: payout.reference,
      paidAt: payout.paid_at,
    })),
  };
}

async function detail(req, res) {
  res.ok(await buildDetail(Number(req.params.providerId)));
}

async function revealBank(req, res) {
  const providerId = Number(req.params.providerId);
  const result = await query(
    `SELECT account_number_enc
     FROM provider_bank_details
     WHERE provider_user_id = $1
       AND EXISTS (SELECT 1 FROM users WHERE id = $1 AND role = 'provider')`,
    [providerId]
  );
  if (!result.rows[0]) {
    throw new ApiError('ZD-ADM-003', { message: 'Provider bank details not found' });
  }

  let accountNumber;
  try {
    accountNumber = decrypt(result.rows[0].account_number_enc);
  } catch {
    throw new ApiError('ZD-SYS-001', { message: 'Stored bank details could not be decrypted' });
  }
  await writeAudit({
    actorType: 'admin',
    actorId: req.admin.id,
    action: 'admin.view_bank_details',
    entity: 'provider_bank_details',
    entityId: providerId,
    meta: { providerId },
    requestId: req.id,
    ip: req.ip,
  });
  res.ok({ accountNumber });
}

async function ensureProvider(client, providerId) {
  const result = await client.query(
    "SELECT id FROM users WHERE id = $1 AND role = 'provider'",
    [providerId]
  );
  if (!result.rows[0]) throw new ApiError('ZD-ADM-003', { message: 'Provider not found' });
}

async function createPayout(req, res) {
  const providerId = Number(req.params.providerId);
  const { amountCents, method, reference, note } = req.body;
  await withTransaction(async (client) => {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('payout:' || $1::text))",
      [providerId]
    );
    await ensureProvider(client, providerId);
    const balanceCents = await ledger.getBalance(providerId, client);
    if (amountCents > balanceCents) {
      throw new ApiError('ZD-PAY-007', {
        message: 'Payout is more than the provider balance',
        details: { balanceCents },
      });
    }

    let payout;
    try {
      payout = await client.query(
        `INSERT INTO payouts (
           provider_user_id, amount_cents, reference, method, paid_at, paid_by, note
         )
         VALUES ($1, $2, $3, $4, now(), $5, $6)
         RETURNING id`,
        [providerId, amountCents, reference, method, req.admin.id, note || null]
      );
    } catch (error) {
      if (error.code === '23505') {
        throw new ApiError('ZD-VAL-001', {
          message: 'That reference was already used',
          field: 'reference',
        });
      }
      throw error;
    }
    await ledger.postPayout(client, {
      providerId,
      payoutId: payout.rows[0].id,
      amountCents,
      note: note || null,
    });
    await writeAudit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'admin.payout_record',
      entity: 'payouts',
      entityId: payout.rows[0].id,
      meta: { amountCents, method },
      requestId: req.id,
      ip: req.ip,
    }, client);
  });
  await notifyBestEffort({
    userId: providerId,
    title: `A payout of R${(amountCents / 100).toFixed(2)} was recorded`,
    kind: 'payment',
  });
  res.ok(await buildDetail(providerId));
}

async function createAdjustment(req, res) {
  const providerId = Number(req.params.providerId);
  const { amountCents, note } = req.body;
  await withTransaction(async (client) => {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('payout:' || $1::text))",
      [providerId]
    );
    await ensureProvider(client, providerId);
    await ledger.postAdjustment(client, { providerId, amountCents, note });
    await writeAudit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'admin.ledger_adjustment',
      entity: 'provider_ledger',
      entityId: providerId,
      meta: { amountCents },
      requestId: req.id,
      ip: req.ip,
    }, client);
  });
  res.ok(await buildDetail(providerId));
}

function shiftDate(date, offset) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}

async function exportCsv(req, res) {
  const dateResult = await query(
    "SELECT to_char(timezone('Africa/Johannesburg', now())::date, 'YYYY-MM-DD') AS today"
  );
  const today = dateResult.rows[0].today;
  const from = req.validated.from || shiftDate(today, -30);
  const to = req.validated.to || today;
  const rangeDays = (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86400000 + 1;
  if (from > to || rangeDays > 366) {
    throw new ApiError('ZD-VAL-001', {
      message: 'Choose a valid date range of no more than 366 days',
      field: 'from',
    });
  }

  const result = await query(
    `SELECT to_char(pl.created_at AT TIME ZONE 'Africa/Johannesburg', 'YYYY-MM-DD') AS date,
            concat_ws(' ', u.first_name, u.last_name) AS provider,
            pl.entry_type AS type, pl.amount_cents, pl.request_id,
            p.reference, pl.note
     FROM provider_ledger pl
     JOIN users u ON u.id = pl.provider_user_id
     LEFT JOIN payouts p ON p.id = pl.payout_id
     WHERE (pl.created_at AT TIME ZONE 'Africa/Johannesburg')::date
       BETWEEN $1::date AND $2::date
     ORDER BY pl.created_at ASC, pl.id ASC
     LIMIT 10001`,
    [from, to]
  );
  if (result.rows.length > 10000) {
    throw new ApiError('ZD-VAL-001', {
      message: 'This export exceeds 10,000 rows. Choose a shorter date range.',
    });
  }

  const csv = toCsv(
    ['date', 'provider', 'type', 'amount_rands', 'request_id', 'reference', 'note'],
    result.rows.map((row) => [
      row.date,
      row.provider,
      row.type,
      (Number(row.amount_cents) / 100).toFixed(2),
      row.request_id,
      row.reference,
      row.note,
    ])
  );
  await writeAudit({
    actorType: 'admin',
    actorId: req.admin.id,
    action: 'admin.ledger_export',
    entity: 'provider_ledger',
    meta: { from, to, rows: result.rows.length },
    requestId: req.id,
    ip: req.ip,
  });
  res.ok({
    filename: `zoomdrive-ledger-${from}-${to}.csv`,
    csv,
  });
}

module.exports = { list, detail, revealBank, createPayout, createAdjustment, exportCsv };