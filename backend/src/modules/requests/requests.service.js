const { query, withTransaction } = require('../../db/pool');
const ApiError = require('../../lib/ApiError');
const { writeAudit } = require('../../lib/audit');
const geo = require('../../lib/geo');
const pricing = require('../../lib/pricing');
const stateMachine = require('./stateMachine');
const { loadSettings, findCandidates, createOffers } = require('../dispatch/dispatch.service');
const { isPlusActive } = require('../plus/plus.service');
const pricingPolicy = require('../admin/pricingPolicy');
const paystack = require('../payments/paystack.service');
const ridePayments = require('../payments/ridePayments.service');

function queryWith(client, text, params) {
  return client ? client.query(text, params) : query(text, params);
}

async function computeForRequest({ serviceId, lat, lng, client }) {
  if (!geo.inServiceArea(lat, lng)) {
    throw new ApiError('ZD-REQ-004', { message: 'We do not operate at that location yet' });
  }

  const serviceResult = await queryWith(
    client,
    'SELECT id, code, name, icon, base_price_cents, per_km_cents, min_distance_fee_cents, active FROM services WHERE id = $1',
    [serviceId]
  );
  const service = serviceResult.rows[0];
  if (!service || !service.active) throw new ApiError('ZD-REQ-002');

  const settings = await loadSettings(client || undefined);
  const candidates = await findCandidates({ serviceId, lat, lng, settings, client: client || undefined });
  const distanceKm = pricing.quoteDistanceKm({
    nearestStraightKm: candidates.length > 0 ? candidates[0].straightKm : null,
    roadFactor: settings.road_factor,
  });
  const quoteResult = pricing.computeQuote({
    service: {
      basePriceCents: service.base_price_cents,
      perKmCents: service.per_km_cents,
      minDistanceFeeCents: service.min_distance_fee_cents,
    },
    distanceKm,
    commissionPct: settings.commission_pct,
  });
  return { service, settings, candidates, quote: quoteResult };
}

const REQUEST_VIEW_SQL = `
  SELECT r.*, s.code AS service_code, s.name AS service_name, s.icon AS service_icon,
         d.first_name AS driver_first_name, d.last_name AS driver_last_name,
         d.photo_url AS driver_photo_url, d.phone AS driver_phone,
         p.first_name AS provider_first_name, p.last_name AS provider_last_name,
         p.photo_url AS provider_photo_url, p.phone AS provider_phone,
         pp.provider_type, pp.rating_avg, pp.rating_count, pp.jobs_completed,
         pp.vehicle_description, pp.plate, pp.last_lat, pp.last_lng, pp.last_seen_at,
         org.name AS company_name
  FROM requests r
  JOIN services s ON s.id = r.service_id
  JOIN users d ON d.id = r.driver_id
  LEFT JOIN users p ON p.id = r.provider_id
  LEFT JOIN provider_profiles pp ON pp.user_id = r.provider_id
  LEFT JOIN organisations org ON org.id = pp.organisation_id
`;

async function getJoinedRequest(requestId, client) {
  const result = await queryWith(client, REQUEST_VIEW_SQL + ' WHERE r.id = $1', [requestId]);
  return result.rows[0] || null;
}

async function buildView(requestRow, viewerRole, client = null) {
  const settings = await loadSettings(client || undefined);
  const row = requestRow;
  const assigned = row.provider_id !== null && row.provider_id !== undefined;
  const acceptedOrLater = ['accepted', 'arrived', 'completed', 'cancelled'].includes(row.status) && assigned;
  let etaMinutes = null;
  if (row.status === 'accepted' && row.last_lat !== null && row.last_lat !== undefined &&
      row.last_lng !== null && row.last_lng !== undefined) {
    const distance = geo.haversineKm(
      Number(row.lat),
      Number(row.lng),
      Number(row.last_lat),
      Number(row.last_lng)
    ) * settings.road_factor;
    etaMinutes = geo.etaMinutes(distance, settings.avg_speed_kmh);
  }

  const price = {
    servicePriceCents: row.service_price_cents,
    distanceFeeCents: row.distance_fee_cents,
    totalCents: row.total_cents,
  };
  if (viewerRole === 'provider' || viewerRole === 'admin') {
    price.providerEarningCents = row.provider_earning_cents;
  }
  if (viewerRole === 'admin') {
    price.commissionCents = row.commission_cents;
    price.commissionPct = Number(row.commission_pct);
  }

  let provider = null;
  if ((viewerRole === 'driver' || viewerRole === 'admin') && assigned) {
    provider = {
      id: row.provider_id,
      firstName: row.provider_first_name,
      lastName: row.provider_last_name,
      photoUrl: row.provider_photo_url,
      phone: row.provider_phone,
      ratingAvg: Number(row.rating_avg || 0),
      ratingCount: Number(row.rating_count || 0),
      jobsCompleted: Number(row.jobs_completed || 0),
      vehicleDescription: row.vehicle_description,
      plate: row.plate,
      companyName: row.provider_type === 'company' ? row.company_name : null,
      verified: true,
      lastLat: row.last_lat === null ? null : Number(row.last_lat),
      lastLng: row.last_lng === null ? null : Number(row.last_lng),
      lastSeenAt: row.last_seen_at,
    };
  }

  let driver = null;
  if ((viewerRole === 'provider' || viewerRole === 'admin') && acceptedOrLater) {
    driver = {
      id: row.driver_id,
      firstName: row.driver_first_name,
      photoUrl: row.driver_photo_url,
      phone: row.driver_phone,
    };
  }

  return {
    id: row.id,
    status: row.status,
    service: {
      id: row.service_id,
      code: row.service_code,
      name: row.service_name,
      icon: row.service_icon,
    },
    lat: Number(row.lat),
    lng: Number(row.lng),
    addressText: row.address_text,
    notes: row.notes,
    distanceKm: row.distance_km === null ? null : Number(row.distance_km),
    price,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at,
    arrivedAt: row.arrived_at,
    completedAt: row.completed_at,
    cancelledAt: row.cancelled_at,
    cancelledBy: row.cancelled_by,
    cancelReason: row.cancel_reason,
    assignedByAdmin: row.assigned_by_admin,
    etaMinutes,
    provider,
    driver,
    payment: await ridePayments.getPaymentView(row.id, client || undefined),
  };
}

async function quote({ serviceId, lat, lng }) {
  const computed = await computeForRequest({ serviceId, lat, lng });
  const service = computed.service;
  return {
    service: {
      id: service.id,
      code: service.code,
      name: service.name,
      icon: service.icon,
    },
    distanceKm: computed.quote.distanceKm,
    servicePriceCents: computed.quote.servicePriceCents,
    distanceFeeCents: computed.quote.distanceFeeCents,
    totalCents: computed.quote.totalCents,
    etaMinutes: computed.candidates.length > 0
      ? geo.etaMinutes(computed.quote.distanceKm, computed.settings.avg_speed_kmh)
      : null,
    providersNearby: computed.candidates.length,
  };
}

async function createRequest({ driverId, body, requestId, ip }) {
  const profileResult = await query(
    `SELECT u.first_name, u.last_name, dp.consent_at
     FROM users u
     LEFT JOIN driver_profiles dp ON dp.user_id = u.id
     WHERE u.id = $1 AND u.role = 'driver'`,
    [driverId]
  );
  const profile = profileResult.rows[0];
  if (!profile || !profile.first_name || !String(profile.first_name).trim() ||
      !profile.last_name || !String(profile.last_name).trim() || !profile.consent_at) {
    throw new ApiError('ZD-USR-001', { message: 'Complete your profile to request help' });
  }

  if (paystack.isConfigured()) {
    const settingResult = await query(
      'SELECT value FROM app_settings WHERE key = $1',
      ['block_new_requests_when_unpaid']
    );
    if (!settingResult.rows[0] || !['true', 'false'].includes(String(settingResult.rows[0].value).toLowerCase())) {
      throw new ApiError('ZD-SYS-001', { message: 'The unpaid-request setting is missing or invalid' });
    }
    if (String(settingResult.rows[0].value).toLowerCase() === 'true') {
      const unpaidResult = await query(
        `SELECT r.id, r.total_cents
         FROM requests r
         JOIN payments p ON p.request_id = r.id
         WHERE r.driver_id = $1
           AND r.status = 'completed'
           AND p.status = 'pending'
         ORDER BY r.completed_at DESC
         LIMIT 1`,
        [driverId]
      );
      if (unpaidResult.rows[0]) {
        throw new ApiError('ZD-PAY-006', {
          message: 'Please pay for your last job before requesting help again',
          details: {
            requestId: unpaidResult.rows[0].id,
            totalCents: Number(unpaidResult.rows[0].total_cents),
          },
        });
      }
    }
  }

  const computed = await computeForRequest({
    serviceId: body.serviceId,
    lat: body.lat,
    lng: body.lng,
  });
  if (typeof body.expectedTotalCents === 'number' &&
      body.expectedTotalCents !== computed.quote.totalCents) {
    throw new ApiError('ZD-REQ-008', {
      message: 'The price changed. Please confirm the new price.',
      details: { newTotalCents: computed.quote.totalCents },
    });
  }

  const [plusActive, pricingValues] = await Promise.all([
    isPlusActive(driverId),
    pricingPolicy.readValues(),
  ]);
  const offerLimit = computed.settings.max_offers_per_request
    + (plusActive ? pricingValues.driverPlusExtraOffers : 0);

  try {
    return await withTransaction(async (client) => {
      const insertResult = await client.query(
        `INSERT INTO requests (
           driver_id, service_id, status, lat, lng, address_text, notes, distance_km,
           service_price_cents, distance_fee_cents, total_cents, commission_pct,
           commission_cents, provider_earning_cents, expires_at
         )
         VALUES (
           $1, $2, 'searching', $3, $4, $5, $6, $7,
           $8, $9, $10, $11, $12, $13,
           now() + make_interval(secs => $14)
         )
         RETURNING id`,
        [
          driverId,
          body.serviceId,
          body.lat,
          body.lng,
          body.addressText || null,
          body.notes || null,
          computed.quote.distanceKm,
          computed.quote.servicePriceCents,
          computed.quote.distanceFeeCents,
          computed.quote.totalCents,
          computed.quote.commissionPct,
          computed.quote.commissionCents,
          computed.quote.providerEarningCents,
          computed.settings.request_expiry_seconds,
        ]
      );
      const id = insertResult.rows[0].id;
      const offersSent = await createOffers(
        client,
        id,
        computed.candidates,
        offerLimit
      );
      await writeAudit({
        actorType: 'user',
        actorId: driverId,
        action: 'request.create',
        entity: 'requests',
        entityId: id,
        meta: {
          serviceId: body.serviceId,
          totalCents: computed.quote.totalCents,
          offersSent: offersSent.length,
          plus: plusActive,
        },
        requestId,
        ip,
      }, client);
      const row = await getJoinedRequest(id, client);
      return {
        request: await buildView(row, 'driver', client),
        offersSent: offersSent.length,
      };
    });
  } catch (err) {
    if (err && err.code === '23505') throw new ApiError('ZD-REQ-003');
    throw err;
  }
}

async function getRequestView({ requestId, user }) {
  const row = await getJoinedRequest(requestId);
  if (!row) throw new ApiError('ZD-REQ-001');
  const isDriver = user.role === 'driver' && row.driver_id === user.id;
  const isProvider = user.role === 'provider' && row.provider_id === user.id;
  const isAdmin = user.role === 'admin';
  if (!isDriver && !isProvider && !isAdmin) throw new ApiError('ZD-REQ-007');
  return buildView(row, user.role);
}

async function listDriverRequests({ driverId, page = 1 }) {
  const pageSize = 20;
  const offset = (page - 1) * pageSize;
  const [listResult, countResult] = await Promise.all([
    query(
      `SELECT r.id, r.status, s.name AS service_name, s.icon AS service_icon,
              r.total_cents, r.address_text, r.created_at, r.completed_at,
              p.status AS payment_status
       FROM requests r
       JOIN services s ON s.id = r.service_id
       LEFT JOIN payments p ON p.request_id = r.id
       WHERE r.driver_id = $1
       ORDER BY r.created_at DESC
       LIMIT $2 OFFSET $3`,
      [driverId, pageSize, offset]
    ),
    query('SELECT COUNT(*) AS total FROM requests WHERE driver_id = $1', [driverId]),
  ]);
  return {
    requests: listResult.rows.map((row) => ({
      id: row.id,
      status: row.status,
      service: { name: row.service_name, icon: row.service_icon },
      totalCents: row.total_cents,
      addressText: row.address_text,
      createdAt: row.created_at,
      completedAt: row.completed_at,
      paymentStatus: row.payment_status || null,
    })),
    page,
    pageSize,
    total: Number(countResult.rows[0].total),
  };
}

async function acceptRequest({ providerId, requestId, requestIdHeader, ip }) {
  try {
    return await withTransaction(async (client) => {
      const busyResult = await client.query(
        `SELECT 1 FROM requests
         WHERE provider_id = $1 AND status IN ('accepted', 'arrived')
         LIMIT 1`,
        [providerId]
      );
      if (busyResult.rows.length > 0) throw new ApiError('ZD-REQ-009');

      const offerResult = await client.query(
        `SELECT status FROM request_offers
         WHERE request_id = $1 AND provider_id = $2
         FOR UPDATE`,
        [requestId, providerId]
      );
      if (offerResult.rows.length === 0) {
        throw new ApiError('ZD-REQ-007', { message: 'This request was not offered to you' });
      }
      if (offerResult.rows[0].status !== 'offered') throw new ApiError('ZD-REQ-006');

      const updateResult = await client.query(
        `UPDATE requests
         SET status = 'accepted', provider_id = $1, accepted_at = now()
         WHERE id = $2 AND status = 'searching' AND provider_id IS NULL AND expires_at > now()
         RETURNING *`,
        [providerId, requestId]
      );
      if (updateResult.rows.length === 0) {
        throw new ApiError('ZD-REQ-006', { message: 'This request is no longer available' });
      }

      await client.query(
        `UPDATE request_offers SET status = 'accepted', responded_at = now()
         WHERE request_id = $1 AND provider_id = $2`,
        [requestId, providerId]
      );
      await client.query(
        `UPDATE request_offers SET status = 'expired', responded_at = now()
         WHERE request_id = $1 AND provider_id <> $2 AND status = 'offered'`,
        [requestId, providerId]
      );
      await writeAudit({
        actorType: 'user',
        actorId: providerId,
        action: 'request.accept',
        entity: 'requests',
        entityId: requestId,
        requestId: requestIdHeader,
        ip,
      }, client);
      const row = await getJoinedRequest(requestId, client);
      return { request: await buildView(row, 'provider', client) };
    });
  } catch (err) {
    if (err && err.code === '23505' && err.constraint === 'uq_requests_one_active_job_per_provider') {
      throw new ApiError('ZD-REQ-009');
    }
    throw err;
  }
}

async function declineRequest({ providerId, requestId, requestIdHeader, ip }) {
  return withTransaction(async (client) => {
    const result = await client.query(
      `SELECT status FROM request_offers
       WHERE request_id = $1 AND provider_id = $2
       FOR UPDATE`,
      [requestId, providerId]
    );
    if (result.rows.length === 0) throw new ApiError('ZD-REQ-007');
    if (result.rows[0].status === 'offered') {
      await client.query(
        `UPDATE request_offers SET status = 'declined', responded_at = now()
         WHERE request_id = $1 AND provider_id = $2`,
        [requestId, providerId]
      );
      await writeAudit({
        actorType: 'user',
        actorId: providerId,
        action: 'request.offer_decline',
        entity: 'request_offers',
        entityId: requestId,
        requestId: requestIdHeader,
        ip,
      }, client);
    }
    return { declined: true };
  });
}

async function transitionProviderRequest({ providerId, requestId, requestIdHeader, ip }, to) {
  return withTransaction(async (client) => {
    const locked = await client.query('SELECT * FROM requests WHERE id = $1 FOR UPDATE', [requestId]);
    if (locked.rows.length === 0) throw new ApiError('ZD-REQ-001');
    const request = locked.rows[0];
    if (request.provider_id !== providerId) throw new ApiError('ZD-REQ-007');
    stateMachine.assertActor(to, 'provider');
    stateMachine.assertTransition(request.status, to);
    const timestampColumn = stateMachine.TIMESTAMP_COLUMN[to];
    const result = await client.query(
      `UPDATE requests SET status = $1, ${timestampColumn} = now() WHERE id = $2 RETURNING id`,
      [to, requestId]
    );

    if (to === 'completed') {
      await client.query(
        `INSERT INTO payments (request_id, method, status, amount_cents)
         VALUES ($1, 'unpaid', 'pending', $2)
         ON CONFLICT (request_id) DO NOTHING`,
        [requestId, request.total_cents]
      );
      await client.query(
        'UPDATE provider_profiles SET jobs_completed = jobs_completed + 1 WHERE user_id = $1',
        [providerId]
      );
      // Earnings are credited only when the ride payment is settled in ridePayments.service.
    }

    await writeAudit({
      actorType: 'user',
      actorId: providerId,
      action: to === 'arrived' ? 'request.arrived' : 'request.complete',
      entity: 'requests',
      entityId: requestId,
      requestId: requestIdHeader,
      ip,
    }, client);
    const row = await getJoinedRequest(result.rows[0].id, client);
    return { request: await buildView(row, 'provider', client) };
  });
}

async function markArrived(args) {
  return transitionProviderRequest(args, 'arrived');
}

async function completeRequest(args) {
  return transitionProviderRequest(args, 'completed');
}

async function cancelRequest({ requestId, actor, reason, requestIdHeader, ip }) {
  return withTransaction(async (client) => {
    const locked = await client.query('SELECT * FROM requests WHERE id = $1 FOR UPDATE', [requestId]);
    if (locked.rows.length === 0) throw new ApiError('ZD-REQ-001');
    const request = locked.rows[0];
    const isDriver = actor.role === 'driver' && request.driver_id === actor.id;
    const isProvider = actor.role === 'provider' && request.provider_id === actor.id;
    const isOperator = actor.role === 'admin' || actor.role === 'system';
    if (!isDriver && !isProvider && !isOperator) throw new ApiError('ZD-REQ-007');
    stateMachine.assertActor('cancelled', actor.role);
    stateMachine.assertTransition(request.status, 'cancelled');

    const updateResult = await client.query(
      `UPDATE requests
       SET status = 'cancelled', cancelled_at = now(), cancelled_by = $1, cancel_reason = $2
       WHERE id = $3
       RETURNING id`,
      [actor.role, reason || null, requestId]
    );
    await client.query(
      `UPDATE request_offers SET status = 'expired', responded_at = now()
       WHERE request_id = $1 AND status = 'offered'`,
      [requestId]
    );
    await writeAudit({
      actorType: actor.role === 'admin' ? 'admin' : actor.role === 'system' ? 'system' : 'user',
      actorId: actor.id,
      action: 'request.cancel',
      entity: 'requests',
      entityId: requestId,
      meta: { by: actor.role, reason: reason || null },
      requestId: requestIdHeader,
      ip,
    }, client);
    const row = await getJoinedRequest(updateResult.rows[0].id, client);
    return { request: await buildView(row, actor.role, client) };
  });
}

async function listProviderOffers(providerId) {
  const settings = await loadSettings();
  const profileResult = await query(
    'SELECT last_lat, last_lng FROM provider_profiles WHERE user_id = $1',
    [providerId]
  );
  const profile = profileResult.rows[0] || {};
  const hasPosition = profile.last_lat !== null && profile.last_lat !== undefined &&
    profile.last_lng !== null && profile.last_lng !== undefined;
  const result = await query(
    `SELECT ro.request_id, ro.offered_at, r.expires_at, r.service_id, s.code,
            s.name, s.icon, r.address_text, r.lat, r.lng, r.notes, r.distance_km,
            r.provider_earning_cents, r.total_cents, d.first_name
     FROM request_offers ro
     JOIN requests r ON r.id = ro.request_id
     JOIN services s ON s.id = r.service_id
     JOIN users d ON d.id = r.driver_id
     WHERE ro.provider_id = $1 AND ro.status = 'offered'
       AND r.status = 'searching' AND r.expires_at > now()
     ORDER BY ro.offered_at DESC`,
    [providerId]
  );
  return result.rows.map((row) => {
    let distanceKm = null;
    if (hasPosition) {
      distanceKm = Math.round(
        geo.haversineKm(Number(profile.last_lat), Number(profile.last_lng), Number(row.lat), Number(row.lng)) *
        settings.road_factor * 10
      ) / 10;
    }
    return {
      requestId: row.request_id,
      service: { id: row.service_id, code: row.code, name: row.name, icon: row.icon },
      addressText: row.address_text,
      lat: Number(row.lat),
      lng: Number(row.lng),
      notes: row.notes,
      distanceKm,
      earningCents: row.provider_earning_cents,
      totalCents: row.total_cents,
      offeredAt: row.offered_at,
      expiresAt: row.expires_at,
      driver: { firstName: row.first_name },
    };
  });
}

async function listProviderJobs(providerId) {
  const activeResult = await query(
    `SELECT id FROM requests
     WHERE provider_id = $1 AND status IN ('accepted', 'arrived')
     ORDER BY accepted_at DESC`,
    [providerId]
  );
  const active = [];
  for (const row of activeResult.rows) {
    const joined = await getJoinedRequest(row.id);
    active.push(await buildView(joined, 'provider'));
  }

  const pastResult = await query(
    `SELECT r.id, r.status, s.name AS service_name, s.icon AS service_icon,
            r.total_cents, r.provider_earning_cents, r.address_text,
            r.completed_at, r.cancelled_at, r.created_at
     FROM requests r
     JOIN services s ON s.id = r.service_id
     WHERE r.provider_id = $1 AND r.status IN ('completed', 'cancelled')
     ORDER BY r.created_at DESC
     LIMIT 50`,
    [providerId]
  );
  const past = pastResult.rows.map((row) => ({
    id: row.id,
    status: row.status,
    service: { name: row.service_name, icon: row.service_icon },
    totalCents: row.total_cents,
    earningCents: row.provider_earning_cents,
    addressText: row.address_text,
    completedAt: row.completed_at,
    cancelledAt: row.cancelled_at,
  }));
  return { active, past };
}

async function setOnline({ providerId, online, lat, lng, requestIdHeader, ip }) {
  if (online && !geo.isValidCoord(lat, lng)) {
    throw new ApiError('ZD-VAL-001', {
      message: 'Location is required to go online',
      field: 'lat',
    });
  }
  return withTransaction(async (client) => {
    const profileResult = await client.query(
      'SELECT verification_status FROM provider_profiles WHERE user_id = $1 FOR UPDATE',
      [providerId]
    );
    if (!profileResult.rows[0] || profileResult.rows[0].verification_status !== 'approved') {
      throw new ApiError('ZD-PROV-005');
    }
    const result = online
      ? await client.query(
        `UPDATE provider_profiles
         SET is_online = true, last_lat = $1, last_lng = $2, last_seen_at = now()
         WHERE user_id = $3
         RETURNING last_seen_at`,
        [lat, lng, providerId]
      )
      : await client.query(
        `UPDATE provider_profiles SET is_online = false
         WHERE user_id = $1 RETURNING last_seen_at`,
        [providerId]
      );
    await writeAudit({
      actorType: 'user',
      actorId: providerId,
      action: online ? 'provider.online' : 'provider.offline',
      entity: 'provider_profiles',
      entityId: providerId,
      requestId: requestIdHeader,
      ip,
    }, client);
    return {
      isOnline: online,
      lastSeenAt: result.rows[0] ? result.rows[0].last_seen_at : null,
    };
  });
}

async function heartbeat({ providerId, lat, lng }) {
  const result = await query(
    `UPDATE provider_profiles
     SET last_lat = $1, last_lng = $2, last_seen_at = now()
     WHERE user_id = $3 AND is_online = true
     RETURNING last_seen_at`,
    [lat, lng, providerId]
  );
  if (result.rows.length === 0) return { isOnline: false };
  return { isOnline: true, lastSeenAt: result.rows[0].last_seen_at };
}

module.exports = {
  quote,
  createRequest,
  getRequestView,
  listDriverRequests,
  acceptRequest,
  declineRequest,
  markArrived,
  completeRequest,
  cancelRequest,
  listProviderOffers,
  listProviderJobs,
  setOnline,
  heartbeat,
};