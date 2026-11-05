const { pool } = require('../../db/pool');
const ledger = require('../payments/ledger.service');

async function earnings(req, res) {
  const providerId = req.user.id;
  const [balanceCents, pendingResult, weekResult, entriesResult, payoutsResult] = await Promise.all([
    ledger.getBalance(providerId),
    pool.query(
      `SELECT COUNT(*) AS count
       FROM requests r
       JOIN payments p ON p.request_id = r.id
       WHERE r.provider_id = $1 AND r.status = 'completed' AND p.status = 'pending'`,
      [providerId]
    ),
    pool.query(
      `WITH day_range AS (
          SELECT (timezone('Africa/Johannesburg', now())::date - 6 + day_offset)::date AS date
          FROM generate_series(0, 6) AS days(day_offset)
        ),
        daily AS (
          SELECT (p.paid_at AT TIME ZONE 'Africa/Johannesburg')::date AS date,
                 COALESCE(SUM(r.provider_earning_cents), 0)::bigint AS earning_cents,
                 COUNT(*) AS jobs
          FROM payments p
          JOIN requests r ON r.id = p.request_id
          WHERE r.provider_id = $1
            AND p.status = 'paid'
            AND (p.paid_at AT TIME ZONE 'Africa/Johannesburg')::date
              BETWEEN (timezone('Africa/Johannesburg', now())::date - 6)
              AND timezone('Africa/Johannesburg', now())::date
          GROUP BY 1
        )
        SELECT to_char(day_range.date, 'YYYY-MM-DD') AS date,
               COALESCE(daily.earning_cents, 0) AS earning_cents,
               COALESCE(daily.jobs, 0) AS jobs
        FROM day_range
        LEFT JOIN daily ON daily.date = day_range.date
        ORDER BY day_range.date`,
      [providerId]
    ),
    pool.query(
      `SELECT id, entry_type AS type, amount_cents, note, request_id, created_at
       FROM provider_ledger
       WHERE provider_user_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT 30`,
      [providerId]
    ),
    pool.query(
      `SELECT amount_cents, method, reference, paid_at
       FROM payouts
       WHERE provider_user_id = $1
       ORDER BY paid_at DESC, id DESC
       LIMIT 20`,
      [providerId]
    ),
  ]);
  const week = weekResult.rows.map((row) => ({
    date: row.date,
    earningCents: Number(row.earning_cents),
    jobs: Number(row.jobs),
  }));
  const today = week[week.length - 1];

  res.ok({
    balanceCents,
    owesPlatform: balanceCents < 0,
    pendingPaymentsCount: Number(pendingResult.rows[0].count),
    today: { earningCents: today.earningCents, jobs: today.jobs },
    week,
    entries: entriesResult.rows.map((row) => ({
      id: row.id,
      type: row.type,
      amountCents: Number(row.amount_cents),
      note: row.note,
      requestId: row.request_id,
      createdAt: row.created_at,
    })),
    payouts: payoutsResult.rows.map((row) => ({
      amountCents: Number(row.amount_cents),
      method: row.method,
      reference: row.reference,
      paidAt: row.paid_at,
    })),
  });
}

module.exports = { earnings };