const { withTransaction } = require('../../db/pool');
const { writeAudit } = require('../../lib/audit');
const { logger } = require('../../lib/logger');
const { notifyBestEffort } = require('../notifications/notifications.service');
const { enqueueEmail } = require('../notifications/emailOutbox.service');
const { loadSettings, topUpOffers } = require('./dispatch.service');

async function runExpiryOnce() {
  const result = await withTransaction(async (client) => {
    const expiredResult = await client.query(
      `UPDATE requests
       SET status = 'expired'
       WHERE status = 'searching' AND expires_at <= now()
       RETURNING id, driver_id`
    );
    const expiredRequests = expiredResult.rows;

    if (expiredRequests.length > 0) {
      await client.query(
        `UPDATE request_offers SET status = 'expired', responded_at = now()
         WHERE request_id = ANY($1::bigint[]) AND status = 'offered'`,
        [expiredRequests.map((row) => row.id)]
      );

      for (const request of expiredRequests) {
        await writeAudit({
          actorType: 'system',
          action: 'request.expire',
          entity: 'requests',
          entityId: request.id,
        }, client);
      }
    }

    const settings = await loadSettings(client);
    const timeoutResult = await client.query(
      `UPDATE request_offers
       SET status = 'expired', responded_at = now()
       WHERE status = 'offered'
         AND offered_at <= now() - ($1 * interval '1 second')
       RETURNING request_id`,
      [settings.offer_timeout_seconds]
    );

    const topUpRequestIds = [...new Set(timeoutResult.rows.map((row) => row.request_id))];
    for (const requestId of topUpRequestIds) {
      await topUpOffers({ requestId, client, requestIdHeader: null, ip: null });
    }

    return expiredRequests;
  });

  await Promise.all(result.map(async (request) => {
    await notifyBestEffort({
      userId: request.driver_id,
      title: 'No provider was found',
      kind: 'request_expired',
      data: { requestId: request.id },
    });
    await enqueueEmail({
      userId: request.driver_id,
      kind: 'request_expired',
      subject: 'Request expired',
      text: 'No provider was found for your request. It has expired.',
      dedupeKey: `request_expired:${request.id}:${request.driver_id}`,
    });
  }));
  return result.length;
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