const { pool } = require('../../db/pool');

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

module.exports = { createNotification };
