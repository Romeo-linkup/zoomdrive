const { query } = require('../../db/pool');

async function listUsers(req, res) {
  const { role, status, q, page } = req.validated;
  const pageSize = 25;
  const offset = (page - 1) * pageSize;

  let whereClauses = [];
  let params = [];
  let paramIndex = 1;

  if (role !== 'all') {
    whereClauses.push(`u.role = $${paramIndex}`);
    params.push(role);
    paramIndex++;
  }

  if (status !== 'all') {
    whereClauses.push(`u.status = $${paramIndex}`);
    params.push(status);
    paramIndex++;
  }

  if (q) {
    const escapedQ = q.replace(/%/g, '\\%').replace(/_/g, '\\_');
    whereClauses.push(`(u.phone ILIKE $${paramIndex} OR u.first_name ILIKE $${paramIndex} OR u.last_name ILIKE $${paramIndex})`);
    params.push(`%${escapedQ}%`);
    paramIndex++;
  }

  const whereClause = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

  const { rows } = await query(`
    SELECT
      u.id,
      u.role,
      u.phone,
      u.first_name AS "firstName",
      u.last_name AS "lastName",
      u.photo_url AS "photoUrl",
      u.status,
      u.created_at AS "createdAt",
      u.last_login_at AS "lastLoginAt",
      CASE
        WHEN u.role = 'provider' THEN
          CASE
            WHEN pp.user_id IS NULL THEN 'none'
            WHEN pp.submitted_at IS NULL THEN 'incomplete'
            ELSE pp.verification_status
          END
        ELSE NULL
      END AS "providerStatus"
    FROM users u
    LEFT JOIN provider_profiles pp ON pp.user_id = u.id
    ${whereClause}
    ORDER BY u.created_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `, [...params, pageSize, offset]);

  const countResult = await query(`
    SELECT COUNT(*) FROM users u
    LEFT JOIN provider_profiles pp ON pp.user_id = u.id
    ${whereClause}
  `, params);
  const total = Number(countResult.rows[0].count);

  res.ok({
    users: rows,
    page,
    pageSize,
    total,
  });
}

module.exports = { listUsers };
