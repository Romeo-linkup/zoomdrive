const { pool, withTransaction } = require('../../db/pool');
const ApiError = require('../../lib/ApiError');
const { writeAudit } = require('../../lib/audit');
const geo = require('../../lib/geo');
const stateMachine = require('../requests/stateMachine');

const SETTING_DEFAULTS = Object.freeze({
  commission_pct: 12,
  road_factor: 1.3,
  avg_speed_kmh: 40,
  offer_radius_km: 25,
  max_offers_per_request: 5,
  request_expiry_seconds: 180,
  provider_stale_seconds: 120,
  cancel_fee_cents: 0,
});

async function loadSettings(client = pool) {
  const result = await client.query('SELECT key, value FROM app_settings');
  const settings = { ...SETTING_DEFAULTS };
  for (const row of result.rows) {
    if (Object.prototype.hasOwnProperty.call(settings, row.key)) {
      const value = Number(row.value);
      if (Number.isFinite(value)) settings[row.key] = value;
    }
  }
  return settings;
}

async function findCandidates({ serviceId, lat, lng, settings, client = pool }) {
  const box = geo.boundingBox(lat, lng, settings.offer_radius_km);
  const result = await client.query(
    `SELECT pp.user_id, pp.last_lat, pp.last_lng, pp.base_lat, pp.base_lng,
            pp.service_radius_km
     FROM provider_profiles pp
     JOIN users u ON u.id = pp.user_id
     JOIN provider_services ps ON ps.provider_user_id = pp.user_id
     WHERE pp.verification_status = 'approved'
       AND pp.is_online = true
       AND u.status = 'active'
       AND ps.service_id = $1
       AND pp.last_seen_at >= now() - ($2 * interval '1 second')
       AND pp.last_lat IS NOT NULL AND pp.last_lng IS NOT NULL
       AND pp.last_lat BETWEEN $3 AND $4
       AND pp.last_lng BETWEEN $5 AND $6
       AND NOT EXISTS (
         SELECT 1 FROM requests r
         WHERE r.provider_id = pp.user_id AND r.status IN ('accepted', 'arrived')
       )`,
    [serviceId, settings.provider_stale_seconds, box.minLat, box.maxLat, box.minLng, box.maxLng]
  );

  const candidates = [];
  for (const row of result.rows) {
    const lastLat = Number(row.last_lat);
    const lastLng = Number(row.last_lng);
    const straightKm = geo.haversineKm(lat, lng, lastLat, lastLng);
    if (straightKm > settings.offer_radius_km) continue;

    if (row.base_lat !== null && row.base_lat !== undefined &&
        row.base_lng !== null && row.base_lng !== undefined) {
      const baseDistanceKm = geo.haversineKm(lat, lng, Number(row.base_lat), Number(row.base_lng));
      if (baseDistanceKm > Number(row.service_radius_km)) continue;
    }

    candidates.push({
      providerId: row.user_id,
      straightKm,
      lastLat,
      lastLng,
    });
  }

  candidates.sort((a, b) => a.straightKm - b.straightKm);
  return candidates;
}

async function createOffers(client, requestId, candidates, max) {
  const offered = [];
  for (const candidate of candidates.slice(0, Math.max(0, Number(max) || 0))) {
    const result = await client.query(
      `INSERT INTO request_offers (request_id, provider_id, status)
       VALUES ($1, $2, 'offered')
       ON CONFLICT (request_id, provider_id) DO NOTHING
       RETURNING provider_id`,
      [requestId, candidate.providerId]
    );
    if (result.rows.length > 0) offered.push(result.rows[0].provider_id);
  }
  return offered;
}

async function assignWithClient({ requestId, providerId, admin, requestIdHeader, ip }, client) {
  try {
    const requestResult = await client.query(
      'SELECT id, service_id, status FROM requests WHERE id = $1 FOR UPDATE',
      [requestId]
    );
    if (requestResult.rows.length === 0) throw new ApiError('ZD-REQ-001');
    stateMachine.assertTransition(requestResult.rows[0].status, 'accepted');

    const providerResult = await client.query(
      `SELECT pp.user_id, pp.verification_status, u.status
       FROM provider_profiles pp
       JOIN users u ON u.id = pp.user_id
       WHERE pp.user_id = $1
       FOR UPDATE OF pp, u`,
      [providerId]
    );
    const provider = providerResult.rows[0];
    if (!provider || provider.verification_status !== 'approved' || provider.status !== 'active') {
      throw new ApiError('ZD-PROV-005');
    }

    const serviceResult = await client.query(
      'SELECT 1 FROM provider_services WHERE provider_user_id = $1 AND service_id = $2',
      [providerId, requestResult.rows[0].service_id]
    );
    if (serviceResult.rows.length === 0) {
      throw new ApiError('ZD-VAL-001', {
        message: 'That provider does not offer this service',
        field: 'providerId',
      });
    }

    const busyResult = await client.query(
      `SELECT 1 FROM requests
       WHERE provider_id = $1 AND status IN ('accepted', 'arrived')
       LIMIT 1`,
      [providerId]
    );
    if (busyResult.rows.length > 0) throw new ApiError('ZD-REQ-009');

    const updateResult = await client.query(
      `UPDATE requests
       SET status = 'accepted', provider_id = $1, accepted_at = now(), assigned_by_admin = true
       WHERE id = $2 AND status = 'searching' AND provider_id IS NULL
       RETURNING *`,
      [providerId, requestId]
    );
    if (updateResult.rows.length === 0) throw new ApiError('ZD-REQ-006');

    await client.query(
      `INSERT INTO request_offers (request_id, provider_id, status, responded_at)
       VALUES ($1, $2, 'accepted', now())
       ON CONFLICT (request_id, provider_id)
       DO UPDATE SET status = 'accepted', responded_at = now()`,
      [requestId, providerId]
    );
    await client.query(
      `UPDATE request_offers SET status = 'expired', responded_at = now()
       WHERE request_id = $1 AND provider_id <> $2 AND status = 'offered'`,
      [requestId, providerId]
    );
    await writeAudit({
      actorType: 'admin',
      actorId: admin.id,
      action: 'admin.request_assign',
      entity: 'requests',
      entityId: requestId,
      meta: { providerId },
      requestId: requestIdHeader,
      ip,
    }, client);
    return updateResult.rows[0];
  } catch (err) {
    if (err && err.code === '23505' && err.constraint === 'uq_requests_one_active_job_per_provider') {
      throw new ApiError('ZD-REQ-009');
    }
    throw err;
  }
}

async function manualAssign(args, client = null) {
  if (client) return assignWithClient(args, client);
  return withTransaction((tx) => assignWithClient(args, tx));
}

module.exports = { loadSettings, findCandidates, createOffers, manualAssign };