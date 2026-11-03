const { query, withTransaction } = require('../../db/pool');
const ApiError = require('../../lib/ApiError');
const { writeAudit } = require('../../lib/audit');
const { notifyBestEffort } = require('../notifications/notifications.service');

async function listUsers(req, res) {
  const { role, status, q, page } = req.validated;
  const pageSize = req.validated.pageSize || 25;
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
    const escapedQ = q.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
    whereClauses.push(`(u.phone ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex} OR u.first_name ILIKE $${paramIndex} OR u.last_name ILIKE $${paramIndex})`);
    params.push(`%${escapedQ}%`);
    paramIndex++;
  }

  const whereClause = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

  const { rows } = await query(`
    SELECT
      u.id,
      u.role,
      u.phone,
      u.email,
      u.first_name AS "firstName",
      u.last_name AS "lastName",
      u.photo_url AS "photoUrl",
      u.status,
      u.suspended_reason AS "suspendedReason",
      u.deleted_at AS "deletedAt",
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

async function suspendUser(req, res) {
  const userId = Number(req.params.userId);
  const { reason } = req.body;

  await withTransaction(async (client) => {
    const userResult = await client.query(
      'SELECT id, role, status FROM users WHERE id = $1 FOR UPDATE',
      [userId]
    );
    if (userResult.rows.length === 0) {
      throw new ApiError('ZD-ADM-003', { message: 'User not found' });
    }
    const user = userResult.rows[0];

    if (user.status !== 'active') {
      throw new ApiError('ZD-ADM-010', { message: 'User is not active' });
    }

    const activeRequestResult = await client.query(
      `SELECT 1 FROM requests
       WHERE (driver_id = $1 OR provider_id = $1)
         AND status IN ('searching', 'accepted', 'arrived')
       LIMIT 1`,
      [userId]
    );
    if (activeRequestResult.rows.length > 0) {
      throw new ApiError('ZD-ADM-009');
    }

    await client.query(
      `UPDATE users
       SET status = 'suspended',
           suspended_reason = $1,
           suspended_at = now()
       WHERE id = $2`,
      [reason, userId]
    );

    if (user.role === 'provider') {
      await client.query(
        'UPDATE provider_profiles SET is_online = false WHERE user_id = $1',
        [userId]
      );
      await client.query(
        `UPDATE request_offers
         SET status = 'expired', responded_at = now()
         WHERE provider_id = $1 AND status = 'offered'`,
        [userId]
      );
    }

    await writeAudit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'admin.user_suspend',
      entity: 'users',
      entityId: userId,
      meta: { userId, status: 'suspended' },
      requestId: req.id,
      ip: req.ip,
    }, client);
  });

  const updatedResult = await query(
    `SELECT id, role, phone, first_name AS "firstName", last_name AS "lastName",
            photo_url AS "photoUrl", status, suspended_reason AS "suspendedReason",
            deleted_at AS "deletedAt", created_at AS "createdAt", last_login_at AS "lastLoginAt"
     FROM users WHERE id = $1`,
    [userId]
  );
  res.ok(updatedResult.rows[0]);
}

async function unsuspendUser(req, res) {
  const userId = Number(req.params.userId);

  await withTransaction(async (client) => {
    const userResult = await client.query(
      'SELECT id, status FROM users WHERE id = $1 FOR UPDATE',
      [userId]
    );
    if (userResult.rows.length === 0) {
      throw new ApiError('ZD-ADM-003', { message: 'User not found' });
    }
    const user = userResult.rows[0];

    if (user.status !== 'suspended') {
      throw new ApiError('ZD-ADM-010', { message: 'User is not suspended' });
    }

    await client.query(
      `UPDATE users
       SET status = 'active',
           suspended_reason = NULL,
           suspended_at = NULL
       WHERE id = $1`,
      [userId]
    );

    await writeAudit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'admin.user_unsuspend',
      entity: 'users',
      entityId: userId,
      requestId: req.id,
      ip: req.ip,
    }, client);

  });

  await notifyBestEffort({
    userId,
    title: 'Your account is active again',
    body: 'Your ZoomDrive account has been reactivated.',
    kind: 'security',
  });
  const updatedResult = await query(
    `SELECT id, role, phone, first_name AS "firstName", last_name AS "lastName",
            photo_url AS "photoUrl", status, suspended_reason AS "suspendedReason",
            deleted_at AS "deletedAt", created_at AS "createdAt", last_login_at AS "lastLoginAt"
     FROM users WHERE id = $1`,
    [userId]
  );
  res.ok(updatedResult.rows[0]);
}

module.exports = { listUsers, suspendUser, unsuspendUser };
