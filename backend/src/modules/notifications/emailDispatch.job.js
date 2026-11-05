const { pool } = require('../../db/pool');
const { sendMail } = require('../../lib/mailer');
const { logger } = require('../../lib/logger');
const { env } = require('../../config/env');

const DISPATCH_LIMIT = 20;
const BACKOFF_MINUTES = [1, 5, 30];
const MAX_ATTEMPTS = 5;

function saSTodayBounds() {
  const sastOffsetMs = 2 * 60 * 60 * 1000;
  const now = new Date();
  const sastNow = new Date(now.getTime() + sastOffsetMs);
  const sastStart = new Date(sastNow.getFullYear(), sastNow.getMonth(), sastNow.getDate());
  const sastEnd = new Date(sastStart.getTime() + 24 * 60 * 60 * 1000);
  const utcStart = new Date(sastStart.getTime() - sastOffsetMs);
  const utcEnd = new Date(sastEnd.getTime() - sastOffsetMs);
  return { utcStart, utcEnd };
}

async function countSentToday() {
  const { utcStart, utcEnd } = saSTodayBounds();
  const result = await pool.query(
    `SELECT COUNT(*) AS cnt FROM email_outbox
      WHERE status = 'sent'
        AND sent_at >= $1
        AND sent_at < $2`,
    [utcStart, utcEnd]
  );
  return parseInt(result.rows[0].cnt, 10);
}

async function pickDueRows(limit) {
  const result = await pool.query(
    `SELECT id, to_address, kind, subject, body_text, attempts
       FROM email_outbox
      WHERE status = 'pending'
        AND next_attempt_at <= now()
      ORDER BY next_attempt_at ASC, id ASC
      LIMIT $1`,
    [limit]
  );
  return result.rows;
}

async function markSent(id) {
  await pool.query(
    `UPDATE email_outbox
       SET status = 'sent', sent_at = now()
     WHERE id = $1`,
    [id]
  );
}

async function markFailed(id, attempts, lastErrorCode) {
  const newAttempts = attempts + 1;
  const status = newAttempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
  let nextAttempt = null;
  if (status === 'pending') {
    const backoffMs = BACKOFF_MINUTES[Math.min(newAttempts - 1, BACKOFF_MINUTES.length - 1)] * 60 * 1000;
    nextAttempt = new Date(Date.now() + backoffMs);
  }
  await pool.query(
    `UPDATE email_outbox
       SET status = $1, attempts = $2, last_error_code = $3, next_attempt_at = $4
     WHERE id = $5`,
    [status, newAttempts, lastErrorCode, nextAttempt, id]
  );
}

async function dispatchOnce() {
  const sentToday = await countSentToday();
  const capReached = sentToday >= env.TRANSACTIONAL_EMAIL_DAILY_CAP;

  const rows = await pickDueRows(DISPATCH_LIMIT);
  if (rows.length === 0) return 0;

  let dispatched = 0;
  for (const row of rows) {
    const isLoginCode = row.kind === 'login_code';
    if (capReached && !isLoginCode) {
      await pool.query(
        `UPDATE email_outbox SET status = 'skipped' WHERE id = $1`,
        [row.id]
      );
      continue;
    }

    try {
      await sendMail({
        to: row.to_address,
        subject: row.subject,
        text: row.body_text,
      });
      await markSent(row.id);
      dispatched++;
    } catch (err) {
      const code = err && err.code ? err.code : 'ZD-EML-001';
      await markFailed(row.id, row.attempts, code);
      logger.error({
        reqId: '-',
        module: 'notifications.emailDispatch',
        code,
        message: 'Email dispatch failed',
        meta: { emailId: row.id, kind: row.kind },
      });
    }
  }
  return dispatched;
}

let running = false;
function startEmailDispatchJob() {
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await dispatchOnce();
    } catch (err) {
      logger.error({
        reqId: '-',
        module: 'notifications.emailDispatch',
        code: err.code || 'ZD-SYS-001',
        message: err.message,
      });
    } finally {
      running = false;
    }
  }, 30000);
  timer.unref();
  return timer;
}

module.exports = { startEmailDispatchJob, runEmailDispatchOnce: dispatchOnce };
