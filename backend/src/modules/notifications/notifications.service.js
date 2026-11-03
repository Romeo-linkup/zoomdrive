const { pool } = require('../../db/pool');
const ApiError = require('../../lib/ApiError');
const { logger } = require('../../lib/logger');
const { writeAudit } = require('../../lib/audit');

async function createNotification({ userId, title, body = null, kind, data = null }, client = pool) {
  const dataJson = data && Object.keys(data).length > 0 ? JSON.stringify(data) : null;
  const result = await client.query(
    `INSERT INTO notifications (user_id, title, body, kind, data)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [userId, title, body, kind, dataJson]
  );
  return result.rows[0].id;
}

async function notifyBestEffort(args) {
  try {
    await createNotification(args);
  } catch (err) {
    logger.warn({
      reqId: '-',
      module: 'notifications',
      code: err && err.code ? err.code : 'ZD-SYS-001',
      message: 'Best-effort notification delivery failed',
      meta: { kind: args && args.kind ? args.kind : null },
    });
  }
}

async function listNotifications({ userId, page, pageSize = 20, unreadOnly = false }) {
  const offset = (page - 1) * pageSize;
  const filters = ['user_id = $1'];
  const values = [userId];
  if (unreadOnly) filters.push('read_at IS NULL');
  const where = filters.join(' AND ');

  const [listResult, countResult, unreadResult] = await Promise.all([
    pool.query(
      `SELECT id, title, body, kind, data, read_at, created_at
       FROM notifications
       WHERE ${where}
       ORDER BY created_at DESC, id DESC
       LIMIT $2 OFFSET $3`,
      [userId, pageSize, offset]
    ),
    pool.query(
      `SELECT COUNT(*) AS total
       FROM notifications
       WHERE ${where}`,
      values
    ),
    pool.query(
      'SELECT COUNT(*) AS unread_count FROM notifications WHERE user_id = $1 AND read_at IS NULL',
      [userId]
    ),
  ]);

  return {
    notifications: listResult.rows.map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      kind: row.kind,
      data: row.data,
      readAt: row.read_at,
      createdAt: row.created_at,
    })),
    unreadCount: Number(unreadResult.rows[0].unread_count),
    page,
    pageSize,
    total: Number(countResult.rows[0].total),
  };
}

async function markRead(userId, id, { requestId = null, ip = null } = {}) {
  const result = await pool.query(
    `UPDATE notifications
     SET read_at = COALESCE(read_at, now())
     WHERE id = $1 AND user_id = $2
     RETURNING id, read_at`,
    [id, userId]
  );
  if (!result.rows[0]) {
    throw new ApiError('ZD-VAL-001', { message: 'Notification not found' });
  }
  await writeAudit({
    actorType: 'user',
    actorId: userId,
    action: 'notification.read',
    entity: 'notifications',
    entityId: id,
    meta: { status: 'read' },
    requestId,
    ip,
  });
  return { id: result.rows[0].id, readAt: result.rows[0].read_at };
}

async function markAllRead(userId) {
  const result = await pool.query(
    `UPDATE notifications
     SET read_at = now()
     WHERE user_id = $1 AND read_at IS NULL`,
    [userId]
  );
  return { updated: result.rowCount };
}

module.exports = { createNotification, notifyBestEffort, listNotifications, markRead, markAllRead };
