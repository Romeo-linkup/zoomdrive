const { pool } = require('../../db/pool');

async function resolveUserAddress(userId) {
  const result = await pool.query(
    'SELECT email FROM users WHERE id = $1',
    [userId]
  );
  return result.rows[0] && result.rows[0].email ? result.rows[0].email : null;
}

async function enqueueEmail({ userId, kind, subject, text, dedupeKey }) {
  try {
    const address = await resolveUserAddress(userId);
    if (!address) return;
    await pool.query(
      `INSERT INTO email_outbox
        (to_user_id, to_admin, to_address, kind, subject, body_text, dedupe_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (dedupe_key) DO NOTHING`,
      [userId, false, address, kind, subject, text, dedupeKey]
    );
  } catch {
    // Never throw to the caller; email queueing is best-effort
  }
}

async function enqueueAdminAlert({ kind, subject, text, dedupeKey }) {
  try {
    if (!envOrDefault('ADMIN_ALERT_EMAIL')) {
      // Admin alerts are skipped when no alert email is configured
      await pool.query(
        `INSERT INTO email_outbox
          (to_user_id, to_admin, to_address, kind, subject, body_text, dedupe_key, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'skipped')
         ON CONFLICT (dedupe_key) DO NOTHING`,
        [null, true, '', kind, subject, text, dedupeKey]
      );
      return;
    }
    await pool.query(
      `INSERT INTO email_outbox
        (to_user_id, to_admin, to_address, kind, subject, body_text, dedupe_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (dedupe_key) DO NOTHING`,
      [null, true, envOrDefault('ADMIN_ALERT_EMAIL'), kind, subject, text, dedupeKey]
    );
  } catch {
    // Never throw to the caller; email queueing is best-effort
  }
}

function envOrDefault(name) {
  const v = process.env[name];
  return v && v.length > 0 ? v : null;
}

module.exports = { enqueueEmail, enqueueAdminAlert };
