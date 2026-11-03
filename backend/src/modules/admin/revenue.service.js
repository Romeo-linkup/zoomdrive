const { query } = require('../../db/pool');

const PAGE_SIZE = 50;

function shiftDate(date, offset) {
  const shifted = new Date(`${date}T00:00:00.000Z`);
  shifted.setUTCDate(shifted.getUTCDate() + offset);
  return shifted.toISOString().slice(0, 10);
}

async function localToday() {
  const { rows } = await query(
    "SELECT to_char(timezone('Africa/Johannesburg', now())::date, 'YYYY-MM-DD') AS today"
  );
  return rows[0].today;
}

async function resolveRange({ from, to } = {}) {
  const today = await localToday();
  const range = {
    from: from || `${today.slice(0, 7)}-01`,
    to: to || today,
  };
  const days = (Date.parse(`${range.to}T00:00:00.000Z`)
    - Date.parse(`${range.from}T00:00:00.000Z`)) / 86400000 + 1;
  if (range.from > range.to || days > 366) {
    const ApiError = require('../../lib/ApiError');
    throw new ApiError('ZD-VAL-001', {
      message: 'Choose a valid date range of no more than 366 days',
      field: 'from',
    });
  }
  return range;
}

async function getSummary(filters) {
  const range = await resolveRange(filters);
  const [rides, charges, fees, ledgerTotals, payouts, balances] = await Promise.all([
    query(
      `SELECT COUNT(*)::int AS jobs,
              COALESCE(SUM(p.amount_cents), 0)::bigint AS gross_cents,
              COALESCE(SUM(p.amount_cents) FILTER (WHERE p.method = 'card'), 0)::bigint AS card_cents,
              COALESCE(SUM(p.amount_cents) FILTER (WHERE p.method IN ('cash', 'eft')), 0)::bigint AS offline_cents,
              COALESCE(SUM(r.commission_cents), 0)::bigint AS commission_cents,
              COALESCE(SUM(r.provider_earning_cents), 0)::bigint AS provider_share_cents
       FROM payments p
       JOIN requests r ON r.id = p.request_id
       WHERE p.status = 'paid'
         AND (p.paid_at AT TIME ZONE 'Africa/Johannesburg')::date BETWEEN $1::date AND $2::date`,
      [range.from, range.to]
    ),
    query(
      `SELECT COALESCE(SUM(amount_cents) FILTER (WHERE purpose = 'provider_registration'), 0)::bigint AS registration_cents,
              COALESCE(SUM(amount_cents) FILTER (WHERE purpose = 'driver_plus'), 0)::bigint AS plus_cents
       FROM platform_charges
       WHERE status = 'paid'
         AND (paid_at AT TIME ZONE 'Africa/Johannesburg')::date BETWEEN $1::date AND $2::date`,
      [range.from, range.to]
    ),
    query(
      `SELECT COALESCE(SUM(fee), 0)::bigint AS fees_cents,
              COUNT(*) FILTER (WHERE fee IS NULL)::int AS unknown_count
       FROM (
         SELECT gateway_fee_cents AS fee
         FROM payments
         WHERE status = 'paid' AND method = 'card'
           AND (paid_at AT TIME ZONE 'Africa/Johannesburg')::date BETWEEN $1::date AND $2::date
         UNION ALL
         SELECT gateway_fee_cents AS fee
         FROM platform_charges
         WHERE status = 'paid'
           AND (paid_at AT TIME ZONE 'Africa/Johannesburg')::date BETWEEN $1::date AND $2::date
       ) settled_fees`,
      [range.from, range.to]
    ),
    query(
      `SELECT COALESCE(SUM(amount_cents), 0)::bigint AS total
       FROM provider_ledger
       WHERE entry_type = 'adjustment'
         AND (created_at AT TIME ZONE 'Africa/Johannesburg')::date BETWEEN $1::date AND $2::date`,
      [range.from, range.to]
    ),
    query(
      `SELECT COALESCE(SUM(amount_cents), 0)::bigint AS total
       FROM payouts
       WHERE (paid_at AT TIME ZONE 'Africa/Johannesburg')::date BETWEEN $1::date AND $2::date`,
      [range.from, range.to]
    ),
    query(
      `SELECT COALESCE(SUM(GREATEST(balance_cents, 0)), 0)::bigint AS owed_to,
              COALESCE(SUM(ABS(LEAST(balance_cents, 0))), 0)::bigint AS owed_by
       FROM (
         SELECT provider_user_id, SUM(amount_cents) AS balance_cents
         FROM provider_ledger
         GROUP BY provider_user_id
       ) provider_balances`
    ),
  ]);
  const ride = rides.rows[0];
  const charge = charges.rows[0];
  const gatewayFeesCents = Number(fees.rows[0].fees_cents);
  const commissionEarnedCents = Number(ride.commission_cents);
  const registrationFeesCents = Number(charge.registration_cents);
  const plusRevenueCents = Number(charge.plus_cents);

  return {
    range,
    jobsPaid: Number(ride.jobs),
    grossBookingsCents: Number(ride.gross_cents),
    cardVolumeCents: Number(ride.card_cents),
    offlineVolumeCents: Number(ride.offline_cents),
    commissionEarnedCents,
    providerShareCents: Number(ride.provider_share_cents),
    registrationFeesCents,
    plusRevenueCents,
    gatewayFeesCents,
    unknownFeeCount: Number(fees.rows[0].unknown_count),
    adjustmentsNetCents: Number(ledgerTotals.rows[0].total),
    payoutsMadeCents: Number(payouts.rows[0].total),
    netRevenueCents: commissionEarnedCents + registrationFeesCents + plusRevenueCents - gatewayFeesCents,
    owedToProvidersCents: Number(balances.rows[0].owed_to),
    owedByProvidersCents: Number(balances.rows[0].owed_by),
  };
}

async function getDaily(filters) {
  const range = await resolveRange(filters);
  const { rows } = await query(
    `WITH days AS (
       SELECT day::date AS local_date
       FROM generate_series($1::date, $2::date, interval '1 day') AS series(day)
     ),
     ride_totals AS (
       SELECT (p.paid_at AT TIME ZONE 'Africa/Johannesburg')::date AS local_date,
              COUNT(*)::int AS jobs,
              SUM(p.amount_cents)::bigint AS gross_cents,
              SUM(r.commission_cents)::bigint AS commission_cents,
              SUM(CASE WHEN p.method = 'card' THEN COALESCE(p.gateway_fee_cents, 0) ELSE 0 END)::bigint AS fees_cents
       FROM payments p
       JOIN requests r ON r.id = p.request_id
       WHERE p.status = 'paid'
         AND (p.paid_at AT TIME ZONE 'Africa/Johannesburg')::date BETWEEN $1::date AND $2::date
       GROUP BY local_date
     ),
     charge_totals AS (
       SELECT (paid_at AT TIME ZONE 'Africa/Johannesburg')::date AS local_date,
              SUM(amount_cents)::bigint AS revenue_cents,
              SUM(COALESCE(gateway_fee_cents, 0))::bigint AS fees_cents
       FROM platform_charges
       WHERE status = 'paid'
         AND (paid_at AT TIME ZONE 'Africa/Johannesburg')::date BETWEEN $1::date AND $2::date
       GROUP BY local_date
     )
     SELECT to_char(days.local_date, 'YYYY-MM-DD') AS date,
            COALESCE(ride_totals.jobs, 0)::int AS jobs,
            COALESCE(ride_totals.gross_cents, 0)::bigint AS gross_cents,
            COALESCE(ride_totals.commission_cents, 0)::bigint AS commission_cents,
            (COALESCE(ride_totals.fees_cents, 0) + COALESCE(charge_totals.fees_cents, 0))::bigint AS fees_cents,
            COALESCE(charge_totals.revenue_cents, 0)::bigint AS other_revenue_cents
     FROM days
     LEFT JOIN ride_totals USING (local_date)
     LEFT JOIN charge_totals USING (local_date)
     ORDER BY days.local_date`,
    [range.from, range.to]
  );
  return {
    range,
    rows: rows.map((row) => {
      const commissionCents = Number(row.commission_cents);
      const otherRevenueCents = Number(row.other_revenue_cents);
      const feesCents = Number(row.fees_cents);
      return {
        date: row.date,
        jobs: Number(row.jobs),
        grossCents: Number(row.gross_cents),
        commissionCents,
        feesCents,
        otherRevenueCents,
        netCents: commissionCents + otherRevenueCents - feesCents,
      };
    }),
  };
}

const TRANSACTION_ROWS = `
  SELECT 'ride:' || p.request_id::text AS key, 'ride_payment'::text AS type, p.paid_at AS at,
         p.amount_cents, r.commission_cents, r.provider_earning_cents, p.gateway_fee_cents,
         p.method, p.paystack_ref AS reference, r.id AS request_id,
         concat_ws(' ', d.first_name, d.last_name) AS driver_name,
         concat_ws(' ', pr.first_name, pr.last_name) AS provider_name,
         NULL::text AS note
  FROM payments p
  JOIN requests r ON r.id = p.request_id
  LEFT JOIN users d ON d.id = r.driver_id
  LEFT JOIN users pr ON pr.id = r.provider_id
  WHERE p.status = 'paid'
    AND (p.paid_at AT TIME ZONE 'Africa/Johannesburg')::date BETWEEN $1::date AND $2::date
  UNION ALL
  SELECT 'charge:' || c.id::text,
         CASE c.purpose WHEN 'provider_registration' THEN 'registration_fee' ELSE 'driver_plus' END,
         c.paid_at, c.amount_cents, 0::bigint, 0::bigint, c.gateway_fee_cents,
         'card'::text, c.paystack_ref, NULL::bigint,
         CASE WHEN u.role = 'driver' THEN concat_ws(' ', u.first_name, u.last_name) ELSE NULL END,
         CASE WHEN u.role = 'provider' THEN concat_ws(' ', u.first_name, u.last_name) ELSE NULL END,
         NULL::text
  FROM platform_charges c
  JOIN users u ON u.id = c.user_id
  WHERE c.status = 'paid'
    AND (c.paid_at AT TIME ZONE 'Africa/Johannesburg')::date BETWEEN $1::date AND $2::date
  UNION ALL
  SELECT 'payout:' || p.id::text, 'payout'::text, p.paid_at, p.amount_cents,
         0::bigint, 0::bigint, NULL::integer, p.method, p.reference, NULL::bigint,
         NULL::text, concat_ws(' ', u.first_name, u.last_name), NULL::text
  FROM payouts p
  JOIN users u ON u.id = p.provider_user_id
  WHERE (p.paid_at AT TIME ZONE 'Africa/Johannesburg')::date BETWEEN $1::date AND $2::date
  UNION ALL
  SELECT 'adjustment:' || l.id::text, 'adjustment'::text, l.created_at, l.amount_cents,
         0::bigint, 0::bigint, NULL::integer, NULL::text, NULL::text, l.request_id,
         NULL::text, concat_ws(' ', u.first_name, u.last_name), NULL::text
  FROM provider_ledger l
  JOIN users u ON u.id = l.provider_user_id
  WHERE l.entry_type = 'adjustment'
    AND (l.created_at AT TIME ZONE 'Africa/Johannesburg')::date BETWEEN $1::date AND $2::date
`;

function escapedSearch(value) {
  return `%${value.replace(/[\\%_]/g, '\\$&')}%`;
}

async function getTransactions(filters) {
  const range = await resolveRange(filters);
  const params = [range.from, range.to];
  const conditions = [];
  if (filters.type && filters.type !== 'all') {
    params.push(filters.type);
    conditions.push(`type = $${params.length}`);
  }
  if (filters.q) {
    params.push(escapedSearch(filters.q));
    const p = `$${params.length}`;
    conditions.push(
      `(COALESCE(reference, '') ILIKE ${p} ESCAPE '\\' OR ` +
      `COALESCE(request_id::text, '') ILIKE ${p} ESCAPE '\\' OR ` +
      `COALESCE(driver_name, '') ILIKE ${p} ESCAPE '\\' OR ` +
      `COALESCE(provider_name, '') ILIKE ${p} ESCAPE '\\')`
    );
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const count = await query(`WITH transactions AS (${TRANSACTION_ROWS}) SELECT COUNT(*)::int AS total FROM transactions ${where}`, params);
  const page = filters.page || 1;
  params.push(PAGE_SIZE, (page - 1) * PAGE_SIZE);
  const result = await query(
    `WITH transactions AS (${TRANSACTION_ROWS})
     SELECT * FROM transactions ${where}
     ORDER BY at DESC, key DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return {
    transactions: result.rows.map((row) => ({
      key: row.key,
      type: row.type,
      at: row.at,
      amountCents: Number(row.amount_cents),
      commissionCents: Number(row.commission_cents),
      providerEarningCents: Number(row.provider_earning_cents),
      gatewayFeeCents: row.gateway_fee_cents === null ? null : Number(row.gateway_fee_cents),
      method: row.method,
      reference: row.reference,
      requestId: row.request_id === null ? null : Number(row.request_id),
      driverName: row.driver_name || null,
      providerName: row.provider_name || null,
      note: row.note,
    })),
    page,
    pageSize: PAGE_SIZE,
    total: Number(count.rows[0].total),
  };
}

async function getExportRows(filters) {
  const range = await resolveRange(filters);
  const result = await query(
    `WITH transactions AS (${TRANSACTION_ROWS})
     SELECT * FROM transactions ORDER BY at ASC, key ASC LIMIT 20001`,
    [range.from, range.to]
  );
  return { range, rows: result.rows };
}

async function getReconciliationIssues() {
  const checks = await Promise.all([
    query(
      `SELECT p.request_id
       FROM payments p
       WHERE p.status = 'paid'
         AND ((p.method = 'card' AND NOT EXISTS (
           SELECT 1 FROM provider_ledger l
           WHERE l.request_id = p.request_id AND l.entry_type = 'earning'
         )) OR (p.method IN ('cash','eft') AND EXISTS (
           SELECT 1 FROM audit_log a
           WHERE a.action = 'payment.recorded_offline'
             AND a.entity_id = p.request_id
             AND a.meta->>'receivedBy' = 'provider'
         ) AND NOT EXISTS (
           SELECT 1 FROM provider_ledger l
           WHERE l.request_id = p.request_id AND l.entry_type = 'commission'
         )) OR (p.method IN ('cash','eft') AND EXISTS (
           SELECT 1 FROM audit_log a
           WHERE a.action = 'payment.recorded_offline'
             AND a.entity_id = p.request_id
             AND a.meta->>'receivedBy' = 'platform'
         ) AND NOT EXISTS (
           SELECT 1 FROM provider_ledger l
           WHERE l.request_id = p.request_id AND l.entry_type = 'earning'
         )) OR (p.method IN ('cash','eft') AND NOT EXISTS (
           SELECT 1 FROM provider_ledger l
           WHERE l.request_id = p.request_id AND l.entry_type IN ('earning','commission')
         )))
       ORDER BY p.request_id DESC LIMIT 200`,
    ),
    query(
      `SELECT l.request_id
       FROM provider_ledger l JOIN requests r ON r.id = l.request_id
       WHERE l.entry_type = 'earning' AND l.amount_cents <> r.provider_earning_cents
       ORDER BY l.request_id DESC LIMIT 200`,
    ),
    query(
      `SELECT l.request_id
       FROM provider_ledger l JOIN requests r ON r.id = l.request_id
       WHERE l.entry_type = 'commission' AND l.amount_cents <> -r.commission_cents
       ORDER BY l.request_id DESC LIMIT 200`,
    ),
    query(
      `SELECT p.request_id
       FROM payments p JOIN requests r ON r.id = p.request_id
       WHERE p.amount_cents <> r.total_cents
       ORDER BY p.request_id DESC LIMIT 200`,
    ),
    query(
      `SELECT p.request_id
       FROM payments p JOIN requests r ON r.id = p.request_id
       WHERE p.status = 'paid' AND r.status <> 'completed'
       ORDER BY p.request_id DESC LIMIT 200`,
    ),
    query(
      `WITH payout_totals AS (
         SELECT provider_user_id, SUM(amount_cents)::bigint AS amount_cents
         FROM payouts GROUP BY provider_user_id
       ), ledger_totals AS (
         SELECT provider_user_id, SUM(ABS(amount_cents))::bigint AS amount_cents
         FROM provider_ledger WHERE entry_type = 'payout' GROUP BY provider_user_id
       )
       SELECT COALESCE(p.provider_user_id, l.provider_user_id) AS provider_id
       FROM payout_totals p FULL OUTER JOIN ledger_totals l USING (provider_user_id)
       WHERE COALESCE(p.amount_cents, 0) <> COALESCE(l.amount_cents, 0)
       ORDER BY provider_id LIMIT 200`,
    ),
    query(
      `SELECT r.id AS request_id
       FROM requests r
       LEFT JOIN payments p ON p.request_id = r.id
       WHERE r.status = 'completed'
         AND r.completed_at < now() - interval '7 days'
         AND COALESCE(p.status, 'pending') <> 'paid'
       ORDER BY r.completed_at ASC LIMIT 200`,
    ),
  ]);
  const issues = [];
  const pushRows = (result, code, detail, idColumn = 'request_id') => {
    for (const row of result.rows) {
      if (issues.length >= 200) break;
      issues.push({
        code,
        requestId: row[idColumn] === undefined || row[idColumn] === null ? null : Number(row[idColumn]),
        detail,
      });
    }
  };
  pushRows(checks[0], 'PAYMENT_LEDGER_MISSING', 'Paid payment is missing its expected ledger entry.');
  pushRows(checks[1], 'EARNING_MISMATCH', 'Ledger earning does not match the request provider share.');
  pushRows(checks[2], 'COMMISSION_MISMATCH', 'Ledger commission does not match the request commission.');
  pushRows(checks[3], 'PAYMENT_AMOUNT_MISMATCH', 'Payment amount does not match the request total.');
  pushRows(checks[4], 'PAID_REQUEST_NOT_COMPLETED', 'A paid payment belongs to a request that is not completed.');
  for (const row of checks[5].rows) {
    if (issues.length >= 200) break;
    issues.push({
      code: 'PAYOUT_LEDGER_MISMATCH',
      requestId: null,
      detail: `Payout total does not match payout ledger entries for provider ${Number(row.provider_id)}.`,
    });
  }
  pushRows(checks[6], 'UNPAID_OLD', 'Completed request has remained unpaid for more than seven days.');
  return issues;
}

module.exports = {
  resolveRange,
  getSummary,
  getDaily,
  getTransactions,
  getExportRows,
  getReconciliationIssues,
  shiftDate,
};