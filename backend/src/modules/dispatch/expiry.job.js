const { withTransaction } = require('../../db/pool');
const { writeAudit } = require('../../lib/audit');
const { logger } = require('../../lib/logger');
const { notifyBestEffort } = require('../notifications/notifications.service');

async function runExpiryOnce() {
  const expiredRequests = await withTransaction(async (client) => {
    const result = await client.query(
      `UPDATE requests
       SET status = 'expired'
       WHERE status = 'searching' AND expires_at <= now()
       RETURNING id, driver_id`
    );
    if (result.rows.length === 0) return [];

    await client.query(
      `UPDATE request_offers SET status = 'expired', responded_at = now()
       WHERE request_id = ANY($1::bigint[]) AND status = 'offered'`,
      [result.rows.map((row) => row.id)]
    );

    for (const request of result.rows) {
      await writeAudit({
        actorType: 'system',
        action: 'request.expire',
        entity: 'requests',
        entityId: request.id,
      }, client);
    }
    return result.rows;
  });
  await Promise.all(expiredRequests.map((request) => notifyBestEffort({
    userId: request.driver_id,
    title: 'No provider was found',
    kind: 'request_expired',
    data: { requestId: request.id },
  })));
  return expiredRequests.length;
}

function startExpiryJob() {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const expiredCount = await runExpiryOnce();
      if (expiredCount > 0) {
        logger.info({
          reqId: '-',
          module: 'dispatch.expiry',
          message: 'Expired searching requests',
          meta: { count: expiredCount },
        });
      }
    } catch (err) {
      logger.error({
        reqId: '-',
        module: 'dispatch.expiry',
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

module.exports = { runExpiryOnce, startExpiryJob };