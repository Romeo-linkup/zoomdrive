const { query } = require('../../db/pool');
const ApiError = require('../../lib/ApiError');
const { writeAudit, redactMeta } = require('../../lib/audit');
const { toCsv } = require('../../lib/csv');
const { shiftDate } = require('./revenue.service');

const PAGE_SIZE = 50;

function addFilters(filters) {
  const clauses = [];
  const params = [];
  const append = (sql, value) => {
    params.push(value);
    clauses.push(sql.replace('?', `$${params.length}`));
  };
  if (filters.actorType) append('actor_type = ?', filters.actorType);
  if (filters.actorId) append('actor_id = ?', filters.actorId);
  if (filters.action) {
    const escapedAction = filters.action.replace(/[\\%_]/g, '\\$&');
    append("action ILIKE ? ESCAPE '\\'", `${escapedAction}%`);
  }
  if (filters.entity) append('entity = ?', filters.entity);
  if (filters.entityId) append('entity_id = ?', filters.entityId);
  if (filters.requestId) append('request_id = ?', filters.requestId);
  if (filters.from) {
    append("(created_at >= (?::date::timestamp AT TIME ZONE 'Africa/Johannesburg'))", filters.from);
  }
  if (filters.to) {
    append("(created_at < ((?::date + 1)::timestamp AT TIME ZONE 'Africa/Johannesburg'))", filters.to);
  }
  if (filters.kind === 'events') clauses.push("action NOT LIKE 'api.%'");
  if (filters.kind === 'api') clauses.push("action LIKE 'api.%'");
  if (filters.kind === 'denied') clauses.push("meta->>'result' IN ('denied','rejected','error')");
  return {
    sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    params,
  };
}

async function list(req, res) {
  const filters = req.validated;
  const { sql, params } = addFilters(filters);
  const page = filters.page;
  const pageSize = filters.pageSize || PAGE_SIZE;
  const offset = (page - 1) * pageSize;
  const [result, countResult] = await Promise.all([
    query(
      `SELECT id, actor_type, actor_id, action, entity, entity_id, meta, request_id, created_at
       FROM audit_log ${sql}
       ORDER BY created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset]
    ),
    query(`SELECT COUNT(*) FROM audit_log ${sql}`, params),
  ]);
  res.ok({
    entries: result.rows.map((row) => ({
      id: row.id,
      actorType: row.actor_type,
      actorId: row.actor_id,
      action: row.action,
      entity: row.entity,
      entityId: row.entity_id,
      meta: redactMeta(row.meta),
      requestId: row.request_id,
      createdAt: row.created_at,
    })),
    page,
    pageSize: PAGE_SIZE,
    total: Number(countResult.rows[0].count),
  });
}

async function exportCsv(req, res) {
  const todayResult = await query(
    "SELECT to_char(timezone('Africa/Johannesburg', now())::date, 'YYYY-MM-DD') AS today"
  );
  const today = todayResult.rows[0].today;
  const to = req.validated.to || today;
  const from = req.validated.from || shiftDate(to, -30);
  const days = (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86400000 + 1;
  if (from > to || days > 366) {
    throw new ApiError('ZD-VAL-001', {
      message: 'Choose a valid date range of no more than 366 days',
      field: 'from',
    });
  }

  const filters = { ...req.validated, from, to };
  const { sql, params } = addFilters(filters);
  const { rows } = await query(
    `SELECT to_char(created_at AT TIME ZONE 'Africa/Johannesburg',
                    'YYYY-MM-DD"T"HH24:MI:SS.MS') || '+02:00' AS time,
            actor_type, actor_id, action, entity, entity_id,
            meta->>'result' AS result, ip, request_id, meta, created_at
     FROM audit_log ${sql}
     ORDER BY created_at DESC
     LIMIT 20001`,
    params
  );
  if (rows.length > 20000) {
    throw new ApiError('ZD-VAL-001', {
      message: 'This export exceeds 20,000 rows. Choose a shorter date range.',
    });
  }

  const csv = toCsv(
    ['time', 'actor_type', 'actor_id', 'action', 'entity', 'entity_id',
      'result', 'ip', 'request_ref', 'meta_json'],
    rows.map((row) => [
      row.time,
      row.actor_type,
      row.actor_id,
      row.action,
      row.entity,
      row.entity_id,
      row.result,
      row.ip,
      row.request_id,
      row.meta ? JSON.stringify(redactMeta(row.meta)) : null,
    ])
  );
  await writeAudit({
    actorType: 'admin',
    actorId: req.admin.id,
    action: 'admin.audit_export',
    entity: 'audit_log',
    meta: { from, to, rows: rows.length },
    requestId: req.id,
    ip: req.ip,
  });
  res.ok({
    filename: `zoomdrive-audit-${from}-${to}.csv`,
    csv,
  });
}

module.exports = { list, exportCsv };
