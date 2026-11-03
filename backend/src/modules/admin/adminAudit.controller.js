const { query } = require('../../db/pool');

function redactMeta(meta) {
  if (!meta || typeof meta !== 'object') return meta;
  const redacted = {};
  const sensitiveKeyPattern = /phone|password|token|code|accountNumber|comment/i;

  for (const [key, value] of Object.entries(meta)) {
    if (sensitiveKeyPattern.test(key)) {
      continue;
    }
    redacted[key] = value;
  }
  return redacted;
}

async function list(req, res) {
  const { actorType, actorId, action, entity, entityId, requestId, from, to, page } = req.validated;
  const pageSize = 50;
  const offset = (page - 1) * pageSize;

  let whereClauses = [];
  let params = [];
  let paramIndex = 1;

  if (actorType) {
    whereClauses.push(`actor_type = $${paramIndex}`);
    params.push(actorType);
    paramIndex++;
  }

  if (actorId) {
    whereClauses.push(`actor_id = $${paramIndex}`);
    params.push(actorId);
    paramIndex++;
  }

  if (action) {
    const escapedAction = action.replace(/%/g, '\\%').replace(/_/g, '\\_');
    whereClauses.push(`action ILIKE $${paramIndex}`);
    params.push(`${escapedAction}%`);
    paramIndex++;
  }

  if (entity) {
    whereClauses.push(`entity = $${paramIndex}`);
    params.push(entity);
    paramIndex++;
  }

  if (entityId) {
    whereClauses.push(`entity_id = $${paramIndex}`);
    params.push(entityId);
    paramIndex++;
  }

  if (requestId) {
    whereClauses.push(`request_id = $${paramIndex}`);
    params.push(requestId);
    paramIndex++;
  }

  if (from) {
    whereClauses.push(`created_at >= $${paramIndex}::timestamptz`);
    params.push(`${from}T00:00:00+00:00`);
    paramIndex++;
  }

  if (to) {
    whereClauses.push(`created_at <= $${paramIndex}::timestamptz`);
    params.push(`${to}T23:59:59.999999+00:00`);
    paramIndex++;
  }

  const whereClause = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

  const { rows } = await query(
    `SELECT id, actor_type, actor_id, action, entity, entity_id, meta, request_id, created_at
     FROM audit_log
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, pageSize, offset]
  );

  const countResult = await query(
    `SELECT COUNT(*) FROM audit_log ${whereClause}`,
    params
  );
  const total = Number(countResult.rows[0].count);

  const entries = rows.map((row) => ({
    id: row.id,
    actorType: row.actor_type,
    actorId: row.actor_id,
    action: row.action,
    entity: row.entity,
    entityId: row.entity_id,
    meta: redactMeta(row.meta),
    requestId: row.request_id,
    createdAt: row.created_at,
  }));

  res.ok({
    entries,
    page,
    pageSize,
    total,
  });
}

module.exports = { list };
