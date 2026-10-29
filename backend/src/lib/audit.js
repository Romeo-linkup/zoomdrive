const { pool } = require('../db/pool');
const ApiError = require('./ApiError');

const validActorTypes = ['user', 'admin', 'system'];

function redactMeta(meta) {
  if (!meta || typeof meta !== 'object') return meta;
  const redacted = {};
  const sensitiveKeyPattern = /token|secret|password|authorization|code_hash|file_url|api_key/i;

  for (const [key, value] of Object.entries(meta)) {
    if (sensitiveKeyPattern.test(key)) {
      continue;
    }
    redacted[key] = value;
  }
  return redacted;
}

async function writeAudit(
  { actorType, actorId = null, action, entity = null, entityId = null, meta = {}, requestId = null, ip = null },
  client = pool
) {
  if (!validActorTypes.includes(actorType)) {
    throw new ApiError('ZD-SYS-001', { message: 'Invalid audit actorType' });
  }

  const cleanMeta = redactMeta(meta);
  const metaJson = cleanMeta && Object.keys(cleanMeta).length > 0 ? JSON.stringify(cleanMeta) : null;

  const text = `
    INSERT INTO audit_log (actor_type, actor_id, action, entity, entity_id, meta, request_id, ip)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING id
  `;
  const values = [actorType, actorId, action, entity, entityId, metaJson, requestId, ip];

  const result = await client.query(text, values);
  return result.rows[0].id;
}

module.exports = { writeAudit };
