// Audit actions that change request.status (for request timeline):
// - request.create (requests.service.js)
// - request.accept (requests.service.js)
// - request.arrived (requests.service.js)
// - request.complete (requests.service.js)
// - request.cancel (requests.service.js)
// - request.offer_decline (requests.service.js, not a status change but relevant)
// - request.expire (dispatch/expiry.job.js)
// - admin.request_assign (dispatch/dispatch.service.js)
// - payment.ride_started (payments/ridePayments.service.js)
// - payment.ride_paid (payments/ridePayments.service.js)
// - payment.recorded_offline (payments/ridePayments.service.js)

const { query } = require('../../db/pool');
const ApiError = require('../../lib/ApiError');

async function getTimeline(requestId) {
  const requestResult = await query('SELECT id, status FROM requests WHERE id = $1', [requestId]);
  if (requestResult.rows.length === 0) {
    throw new ApiError('ZD-REQ-001');
  }
  const request = requestResult.rows[0];

  const events = [];

  const auditResult = await query(
    `SELECT id, actor_type, actor_id, action, entity, entity_id, meta, request_id, created_at
     FROM audit_log
     WHERE (entity = 'requests' AND entity_id = $1)
        OR (entity = 'payments' AND meta->>'requestId' = $1::text)
     ORDER BY created_at ASC`,
    [requestId]
  );

  for (const row of auditResult.rows) {
    let actor = null;
    if (row.actor_type === 'user' || row.actor_type === 'admin') {
      const userResult = await query(
        'SELECT first_name, last_name FROM users WHERE id = $1',
        [row.actor_id]
      );
      if (userResult.rows.length > 0) {
        actor = `${userResult.rows[0].first_name} ${userResult.rows[0].last_name}`;
      }
    } else if (row.actor_type === 'system') {
      actor = 'System';
    }

    events.push({
      at: row.created_at,
      source: 'audit',
      label: row.action,
      actor,
      detail: null,
    });
  }

  const offersResult = await query(
    `SELECT ro.offered_at, ro.responded_at, u.first_name, u.last_name
     FROM request_offers ro
     JOIN users u ON u.id = ro.provider_id
     WHERE ro.request_id = $1
     ORDER BY ro.offered_at ASC`,
    [requestId]
  );

  for (const row of offersResult.rows) {
    events.push({
      at: row.offered_at,
      source: 'offer',
      label: 'offered',
      actor: `${row.first_name} ${row.last_name}`,
      detail: null,
    });
    if (row.responded_at) {
      events.push({
        at: row.responded_at,
        source: 'offer',
        label: 'responded',
        actor: `${row.first_name} ${row.last_name}`,
        detail: null,
      });
    }
  }

  const ratingsResult = await query(
    `SELECT created_at, rater_role, stars
     FROM ratings
     WHERE request_id = $1
     ORDER BY created_at ASC`,
    [requestId]
  );

  for (const row of ratingsResult.rows) {
    events.push({
      at: row.created_at,
      source: 'rating',
      label: `${row.rater_role} rated`,
      actor: null,
      detail: { stars: row.stars },
    });
  }

  const ledgerResult = await query(
    `SELECT created_at, entry_type, amount_cents
     FROM provider_ledger
     WHERE request_id = $1
     ORDER BY created_at ASC`,
    [requestId]
  );

  for (const row of ledgerResult.rows) {
    events.push({
      at: row.created_at,
      source: 'ledger',
      label: row.entry_type,
      actor: null,
      detail: { amountCents: Number(row.amount_cents) },
    });
  }

  events.sort((a, b) => a.at - b.at);

  return {
    request: {
      id: request.id,
      status: request.status,
    },
    events,
  };
}

module.exports = { getTimeline };
