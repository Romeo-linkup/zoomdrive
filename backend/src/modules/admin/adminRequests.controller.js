const { query } = require('../../db/pool');
const ApiError = require('../../lib/ApiError');
const geo = require('../../lib/geo');
const dispatch = require('../dispatch/dispatch.service');
const requests = require('../requests/requests.service');
const ridePayments = require('../payments/ridePayments.service');

async function listRequests(req, res) {
  const { status, q, page } = req.validated;
  const pageSize = 25;
  const offset = (page - 1) * pageSize;
  const clauses = [];
  const params = [];
  let index = 1;

  if (status !== 'all') {
    clauses.push(`r.status = $${index}`);
    params.push(status);
    index += 1;
  }
  if (q) {
    const escaped = q.replace(/[%_]/g, '\\$&');
    const textParam = index;
    clauses.push(
      `(d.phone ILIKE $${textParam} ESCAPE '\\' OR d.first_name ILIKE $${textParam} ESCAPE '\\' ` +
      `OR d.last_name ILIKE $${textParam} ESCAPE '\\'${/^\d+$/.test(q) ? ` OR r.id = $${index + 1}` : ''})`
    );
    params.push(`%${escaped}%`);
    index += 1;
    if (/^\d+$/.test(q)) {
      params.push(q);
      index += 1;
    }
  }

  const whereSql = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
  const result = await query(
    `SELECT r.id, r.status, s.name AS service_name, s.icon AS service_icon,
            d.id AS driver_id, d.first_name AS driver_first_name,
            d.last_name AS driver_last_name, d.phone AS driver_phone,
            p.id AS provider_id, p.first_name AS provider_first_name,
            p.last_name AS provider_last_name, r.total_cents, r.address_text,
            r.assigned_by_admin, r.created_at, r.expires_at,
            (SELECT COUNT(*) FROM request_offers ro WHERE ro.request_id = r.id) AS offers_sent
     FROM requests r
     JOIN services s ON s.id = r.service_id
     JOIN users d ON d.id = r.driver_id
     LEFT JOIN users p ON p.id = r.provider_id
     ${whereSql}
     ORDER BY r.created_at DESC
     LIMIT $${index} OFFSET $${index + 1}`,
    [...params, pageSize, offset]
  );
  const countResult = await query(
    `SELECT COUNT(*) AS total
     FROM requests r
     JOIN users d ON d.id = r.driver_id
     ${whereSql}`,
    params
  );

  res.ok({
    requests: result.rows.map((row) => {
      const offersSent = Number(row.offers_sent);
      return {
        id: row.id,
        status: row.status,
        service: { name: row.service_name, icon: row.service_icon },
        driver: {
          id: row.driver_id,
          firstName: row.driver_first_name,
          lastName: row.driver_last_name,
          phone: row.driver_phone,
        },
        provider: row.provider_id === null ? null : {
          id: row.provider_id,
          firstName: row.provider_first_name,
          lastName: row.provider_last_name,
        },
        totalCents: row.total_cents,
        addressText: row.address_text,
        assignedByAdmin: row.assigned_by_admin,
        offersSent,
        noProvidersOffered: row.status === 'searching' && offersSent === 0,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
      };
    }),
    page,
    pageSize,
    total: Number(countResult.rows[0].total),
  });
}

async function loadAdminRequest(requestId) {
  const request = await requests.getRequestView({
    requestId,
    user: { id: null, role: 'admin' },
  });
  const offersResult = await query(
    `SELECT ro.provider_id, u.first_name, u.last_name, ro.status, ro.offered_at, ro.responded_at
     FROM request_offers ro
     JOIN users u ON u.id = ro.provider_id
     WHERE ro.request_id = $1
     ORDER BY ro.offered_at ASC`,
    [requestId]
  );
  const candidates = await getCandidates(requestId);
  return {
    request,
    offers: offersResult.rows.map((row) => ({
      providerId: row.provider_id,
      firstName: row.first_name,
      lastName: row.last_name,
      status: row.status,
      offeredAt: row.offered_at,
      respondedAt: row.responded_at,
    })),
    candidates,
  };
}

async function getCandidates(requestId) {
  const requestResult = await query(
    'SELECT service_id, lat, lng FROM requests WHERE id = $1',
    [requestId]
  );
  const request = requestResult.rows[0];
  if (!request) throw new ApiError('ZD-REQ-001');

  const result = await query(
    `SELECT pp.user_id, u.first_name, u.last_name, u.phone, pp.is_online,
            pp.last_lat, pp.last_lng, pp.base_lat, pp.base_lng,
            EXISTS (
              SELECT 1 FROM requests busy
              WHERE busy.provider_id = pp.user_id AND busy.status IN ('accepted', 'arrived')
            ) AS is_busy
     FROM provider_profiles pp
     JOIN users u ON u.id = pp.user_id
     JOIN provider_services ps ON ps.provider_user_id = pp.user_id
     WHERE pp.verification_status = 'approved'
       AND u.status = 'active'
       AND ps.service_id = $1`,
    [request.service_id]
  );
  const candidates = result.rows.map((row) => {
    let distanceKm = null;
    const hasLivePosition = row.last_lat !== null && row.last_lat !== undefined &&
      row.last_lng !== null && row.last_lng !== undefined;
    const pointLat = hasLivePosition ? row.last_lat : row.base_lat;
    const pointLng = hasLivePosition ? row.last_lng : row.base_lng;
    if (pointLat !== null && pointLat !== undefined && pointLng !== null && pointLng !== undefined) {
      distanceKm = geo.haversineKm(
        Number(request.lat),
        Number(request.lng),
        Number(pointLat),
        Number(pointLng)
      );
    }
    return {
      providerId: row.user_id,
      firstName: row.first_name,
      lastName: row.last_name,
      phone: row.phone,
      isOnline: row.is_online,
      isBusy: row.is_busy,
      distanceKm,
    };
  });
  candidates.sort((a, b) => {
    if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
    if (a.distanceKm === null) return b.distanceKm === null ? 0 : 1;
    if (b.distanceKm === null) return -1;
    return a.distanceKm - b.distanceKm;
  });
  return candidates;
}

async function getRequest(req, res) {
  const detail = await loadAdminRequest(Number(req.params.id));
  res.ok(detail);
}

async function assign(req, res) {
  const requestId = Number(req.params.id);
  await dispatch.manualAssign({
    requestId,
    providerId: req.body.providerId,
    admin: req.admin,
    requestIdHeader: req.id,
    ip: req.ip,
  });
  const detail = await loadAdminRequest(requestId);
  res.ok({ request: detail.request });
}

async function cancel(req, res) {
  const result = await requests.cancelRequest({
    requestId: Number(req.params.id),
    actor: { role: 'admin', id: req.admin.id },
    reason: req.body.reason,
    requestIdHeader: req.id,
    ip: req.ip,
  });
  const detail = await loadAdminRequest(Number(req.params.id));
  res.ok({ request: detail.request });
}

async function markPaid(req, res) {
  const result = await ridePayments.recordOffline({
    requestId: Number(req.params.id),
    method: req.body.method,
    actor: { role: 'admin', id: req.admin.id },
    receivedBy: req.body.receivedBy,
    note: req.body.note,
    requestIdHeader: req.id,
    ip: req.ip,
  });
  res.ok(result);
}

module.exports = { listRequests, getRequest, assign, cancel, markPaid };