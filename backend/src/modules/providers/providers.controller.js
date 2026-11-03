const { withTransaction } = require('../../db/pool');
const ApiError = require('../../lib/ApiError');
const { getMe } = require('../auth/auth.service');
const { writeAudit } = require('../../lib/audit');
const { uploadDocument, deleteDocumentAsset } = require('../uploads/cloudinary.service');
const { assertValidPhone } = require('../../lib/phone');
const { env } = require('../../config/env');

async function upsertMe(req, res) {
  const userId = req.user.id;
  const body = req.body;

  await withTransaction(async (client) => {
    const userResult = await client.query('SELECT phone FROM users WHERE id = $1 FOR UPDATE', [userId]);
    if (!userResult.rows.length) throw new ApiError('ZD-AUTH-001');
    const currentPhone = userResult.rows[0].phone;
    const phone = body.phone === undefined ? currentPhone : assertValidPhone(body.phone);
    if (!phone) {
      throw new ApiError('ZD-VAL-001', {
        message: 'Enter a valid South African mobile number',
        field: 'phone',
      });
    }

    const existingProfile = await client.query(
      'SELECT consent_at FROM provider_profiles WHERE user_id = $1 FOR UPDATE',
      [userId]
    );

    if (existingProfile.rows.length === 0 && body.consent !== true) {
      throw new ApiError('ZD-VAL-001', { message: 'Please accept the Terms and Privacy Policy to continue', field: 'consent' });
    }

    await client.query(
      'UPDATE users SET first_name = $1, last_name = $2, phone = $3, updated_at = now() WHERE id = $4',
      [body.firstName, body.lastName, phone, userId]
    );

    await client.query(
      `INSERT INTO provider_profiles (user_id, provider_type, vehicle_description, plate, base_lat, base_lng, service_radius_km, consent_at, consent_version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CASE WHEN $8::boolean THEN now() ELSE NULL END, CASE WHEN $8::boolean THEN $9::text ELSE NULL END)
       ON CONFLICT (user_id) DO UPDATE SET
         provider_type = EXCLUDED.provider_type,
         vehicle_description = EXCLUDED.vehicle_description,
         plate = EXCLUDED.plate,
         base_lat = EXCLUDED.base_lat,
         base_lng = EXCLUDED.base_lng,
         service_radius_km = EXCLUDED.service_radius_km,
         consent_at = COALESCE(provider_profiles.consent_at, CASE WHEN $8::boolean THEN now() ELSE NULL END),
         consent_version = CASE
           WHEN provider_profiles.consent_version IS NULL AND $8::boolean THEN $9::text
           ELSE provider_profiles.consent_version
         END`,
      [
        userId,
        body.providerType,
        body.vehicleDescription,
        body.plate,
        body.baseLat,
        body.baseLng,
        body.serviceRadiusKm === undefined ? 25 : body.serviceRadiusKm,
        body.consent === true,
        env.TERMS_VERSION,
      ]
    );

    if (body.providerType === 'individual') {
      await client.query('UPDATE provider_profiles SET organisation_id = NULL WHERE user_id = $1', [userId]);
    }

    await writeAudit(
      {
        actorType: 'user',
        actorId: userId,
        action: 'provider.profile_save',
        entity: 'provider_profiles',
        entityId: userId,
        requestId: req.id,
        ip: req.ip,
      },
      client
    );
  });

  res.ok(await getMe(userId));
}

async function setServices(req, res) {
  const userId = req.user.id;
  const body = req.body;
  let serviceIds = Array.isArray(body.serviceIds) ? body.serviceIds : [];
  // dedupe
  const seen = new Set();
  const deduped = [];
  for (const id of serviceIds) {
    const num = Number(id);
    if (!Number.isInteger(num) || num <= 0) continue;
    if (seen.has(num)) continue;
    seen.add(num);
    deduped.push(num);
  }
  serviceIds = deduped;

  await withTransaction(async (client) => {
    if (serviceIds.length > 0) {
      const result = await client.query('SELECT id, active FROM services WHERE id = ANY($1::int[])', [serviceIds]);
      if (result.rows.length !== serviceIds.length) {
        throw new ApiError('ZD-REQ-002', { field: 'serviceIds' });
      }
      for (const row of result.rows) {
        if (!row.active) {
          throw new ApiError('ZD-REQ-002', { field: 'serviceIds' });
        }
      }
    }

    await client.query('DELETE FROM provider_services WHERE provider_user_id = $1', [userId]);
    for (const serviceId of serviceIds) {
      await client.query('INSERT INTO provider_services (provider_user_id, service_id) VALUES ($1, $2)', [userId, serviceId]);
    }

    await writeAudit(
      {
        actorType: 'user',
        actorId: userId,
        action: 'provider.services_save',
        entity: 'provider_services',
        entityId: userId,
        requestId: req.id,
        ip: req.ip,
      },
      client
    );
  });

  res.ok(await getMe(userId));
}

async function submit(req, res) {
  const userId = req.user.id;

  await withTransaction(async (client) => {
    const profileResult = await client.query('SELECT * FROM provider_profiles WHERE user_id = $1 FOR UPDATE', [userId]);
    if (profileResult.rows.length === 0) {
      throw new ApiError('ZD-USR-001');
    }
    const profile = profileResult.rows[0];

    const userResult = await client.query('SELECT photo_url, first_name, last_name, phone FROM users WHERE id = $1 FOR UPDATE', [userId]);
    const user = userResult.rows[0] || {};

    // 1) users.photo_url is null -> ZD-PROV-001
    if (!user.photo_url) {
      throw new ApiError('ZD-PROV-001');
    }
    // 2) no provider_profiles row, or first_name/last_name empty, or consent_at null -> ZD-USR-001
    if (!profile || !user.first_name || !String(user.first_name).trim() || !user.last_name || !String(user.last_name).trim() || !user.phone || !profile.consent_at) {
      throw new ApiError('ZD-USR-001');
    }
    // 3) provider_type 'company' and (no organisation, or empty name or reg_number) -> ZD-PROV-004
    if (profile.provider_type === 'company') {
      if (!profile.organisation_id) {
        throw new ApiError('ZD-PROV-004');
      }
      const orgResult = await client.query('SELECT name, reg_number FROM organisations WHERE id = $1', [profile.organisation_id]);
      if (orgResult.rows.length === 0) {
        throw new ApiError('ZD-PROV-004');
      }
      const org = orgResult.rows[0];
      if (!org.name || !String(org.name).trim() || !org.reg_number || !String(org.reg_number).trim()) {
        throw new ApiError('ZD-PROV-004');
      }
    }
    // 4) zero provider_services rows -> ZD-PROV-003
    const servicesResult = await client.query('SELECT 1 FROM provider_services WHERE provider_user_id = $1 LIMIT 1', [userId]);
    if (servicesResult.rows.length === 0) {
      throw new ApiError('ZD-PROV-003');
    }
    // 5) required document types
    const required = ['id_document', 'drivers_licence', 'vehicle_insurance'];
    if (profile.provider_type === 'company') {
      required.push('company_registration');
    }
    const docsResult = await client.query(
      "SELECT doc_type FROM provider_documents WHERE provider_user_id = $1 AND status <> 'rejected'",
      [userId]
    );
    const present = new Set(docsResult.rows.map((r) => r.doc_type));
    const missing = [];
    for (const rt of required) {
      if (!present.has(rt)) {
        missing.push(rt);
      }
    }
    if (missing.length > 0) {
      throw new ApiError('ZD-PROV-002', { details: { missing } });
    }

    // If all pass
    if (profile.submitted_at && (profile.verification_status === 'pending' || profile.verification_status === 'approved')) {
      // idempotent, change nothing
    } else {
      await client.query(
        "UPDATE provider_profiles SET submitted_at = now(), verification_status = 'pending', rejection_reason = NULL WHERE user_id = $1",
        [userId]
      );
    }

    await writeAudit(
      {
        actorType: 'user',
        actorId: userId,
        action: 'provider.submit',
        entity: 'provider_profiles',
        entityId: userId,
        requestId: req.id,
        ip: req.ip,
      },
      client
    );
  });

  res.ok(await getMe(userId));
}

module.exports = { upsertMe, setServices, submit };
