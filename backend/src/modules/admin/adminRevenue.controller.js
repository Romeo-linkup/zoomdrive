const ApiError = require('../../lib/ApiError');
const { writeAudit } = require('../../lib/audit');
const { toCsv } = require('../../lib/csv');
const revenue = require('./revenue.service');

async function summary(req, res) {
  res.ok(await revenue.getSummary(req.validated));
}

async function daily(req, res) {
  res.ok(await revenue.getDaily(req.validated));
}

async function transactions(req, res) {
  res.ok(await revenue.getTransactions(req.validated));
}

function localIsoTime(value) {
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Johannesburg',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type) => parts.find((entry) => entry.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:${part('second')}+02:00`;
}

async function exportCsv(req, res) {
  const { range, rows } = await revenue.getExportRows(req.validated);
  if (rows.length > 20000) {
    throw new ApiError('ZD-VAL-001', {
      message: 'This export exceeds 20,000 rows. Choose a shorter date range.',
    });
  }
  const csv = toCsv(
    ['time', 'type', 'amount_cents', 'commission_cents', 'provider_share_cents',
      'gateway_fee_cents', 'method', 'reference', 'request_id', 'driver', 'provider', 'note'],
    rows.map((row) => [
      localIsoTime(row.at),
      row.type,
      row.amount_cents,
      row.commission_cents,
      row.provider_earning_cents,
      row.gateway_fee_cents,
      row.method,
      row.reference,
      row.request_id,
      row.driver_name,
      row.provider_name,
      row.note,
    ])
  );
  await writeAudit({
    actorType: 'admin',
    actorId: req.admin.id,
    action: 'admin.revenue_export',
    entity: 'revenue',
    meta: { from: range.from, to: range.to, rows: rows.length },
    requestId: req.id,
    ip: req.ip,
  });
  res.ok({
    filename: `zoomdrive-revenue-${range.from}-${range.to}.csv`,
    csv,
  });
}

async function reconcile(req, res) {
  const issues = await revenue.getReconciliationIssues();
  const checkedAt = new Date().toISOString();
  res.ok({
    ok: issues.every((issue) => issue.code === 'UNPAID_OLD'),
    checkedAt,
    issues,
  });
}

module.exports = { summary, daily, transactions, exportCsv, reconcile };