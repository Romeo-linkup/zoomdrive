const { withTransaction } = require('../../db/pool');
const { writeAudit } = require('../../lib/audit');
const { logger } = require('../../lib/logger');

async function runExpiryOnce() {
  return withTransaction(async (client) => {
    const result = await client.query(
      `UPDATE requests
       SET status = 'expired'
       WHERE status = 'searching' AND expires_at <= now()
       RETURNING id`
    );
    const requestIds = result.rows.map((row) => row.id);
    if (requestIds.length === 0) return 0;

    await client.query(
      `UPDATE request_offers SET status = 'expired', responded_at = now()
       WHERE request_id = ANY($1::bigint[]) AND status = 'offered'`,
      [requestIds]
    );

    for (const requestId of requestIds) {
      await writeAudit({
        actorType: 'system',
        action: 'request.expire',
        entity: 'requests',
        entityId: requestId,
      }, client);
    }
    return requestIds.length;
  });
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