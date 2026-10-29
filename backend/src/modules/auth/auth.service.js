const jwt = require('jsonwebtoken');
const { env } = require('../../config/env');
const { query, withTransaction } = require('../../db/pool');
const ApiError = require('../../lib/ApiError');
const { logger, maskPhone } = require('../../lib/logger');
const { writeAudit } = require('../../lib/audit');

function publicUser(row) {
  return {
    id: row.id,
    role: row.role,
    phone: row.phone,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    photoUrl: row.photo_url,
    status: row.status,
  };
}

function mapOrganisationRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    regNumber: row.reg_number,
    status: row.status,
  };
}

async function assertAppAccess({ phone, app }) {
  const result = await query('SELECT id, role, status FROM users WHERE phone = $1', [phone]);

  if (result.rows.length > 0) {
    const user = result.rows[0];
    if (user.role !== app) {
      const otherApp = user.role === 'driver' ? 'ZoomDrive' : 'ZoomDrive Partner';
      throw new ApiError('ZD-AUTH-004', {
        message: `This number is registered as a ${user.role}. Open the ${otherApp} app instead.`,
      });
    }
    if (user.status === 'suspended') {
      throw new ApiError('ZD-AUTH-005');
    }
    return user;
  }

  if (env.SIGNUP_ENABLED === false) {
    throw new ApiError('ZD-AUTH-009');
  }

  return null;
}

function signToken(user) {
  return jwt.sign(
    { sub: String(user.id), role: user.role },
    env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: env.JWT_EXPIRES_IN }
  );
}

function verifyToken(token) {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
    return decoded;
  } catch (err) {
    throw new ApiError('ZD-AUTH-001', { message: 'Invalid or expired token' });
  }
}

async function getMe(userId, client = null) {
  const q = client ? (text, params) => client.query(text, params) : query;
  const userResult = await q('SELECT * FROM users WHERE id = $1', [userId]);
  if (userResult.rows.length === 0) {
    throw new ApiError('ZD-AUTH-001', { message: 'User not found' });
  }

  const user = userResult.rows[0];
  const role = user.role;

  let profile = null;
  let profileComplete = false;
  let providerStatus = null;

  if (role === 'driver') {
    const profileResult = await q('SELECT * FROM driver_profiles WHERE user_id = $1', [userId]);
    if (profileResult.rows.length > 0) {
      const p = profileResult.rows[0];
      profile = {
        userId: p.user_id,
        vehicleMake: p.vehicle_make,
        vehicleModel: p.vehicle_model,
        vehicleColour: p.vehicle_colour,
        plate: p.plate,
        hailPlatform: p.hail_platform,
        consentAt: p.consent_at,
        createdAt: p.created_at,
      };
      profileComplete = !!(user.first_name && user.last_name && p.consent_at);
    }
  } else   if (role === 'provider') {
    const profileResult = await q('SELECT * FROM provider_profiles WHERE user_id = $1', [userId]);
    if (profileResult.rows.length === 0) {
      providerStatus = 'none';
    } else {
      const p = profileResult.rows[0];
      let organisation = null;
      if (p.organisation_id) {
        const orgResult = await q('SELECT id, name, reg_number, status FROM organisations WHERE id = $1', [p.organisation_id]);
        if (orgResult.rows.length > 0) {
          organisation = mapOrganisationRow(orgResult.rows[0]);
        }
      }
      const serviceIdsResult = await q('SELECT service_id FROM provider_services WHERE provider_user_id = $1 ORDER BY service_id ASC', [userId]);
      const serviceIds = serviceIdsResult.rows.map((r) => r.service_id);
      profile = {
        userId: p.user_id,
        providerType: p.provider_type,
        organisationId: p.organisation_id,
        organisation,
        serviceIds,
        vehicleDescription: p.vehicle_description,
        plate: p.plate,
        baseLat: p.base_lat,
        baseLng: p.base_lng,
        serviceRadiusKm: p.service_radius_km,
        verificationStatus: p.verification_status,
        rejectionReason: p.rejection_reason,
        isOnline: p.is_online,
        lastLat: p.last_lat,
        lastLng: p.last_lng,
        lastSeenAt: p.last_seen_at,
        ratingAvg: p.rating_avg,
        ratingCount: p.rating_count,
        jobsCompleted: p.jobs_completed,
        submittedAt: p.submitted_at,
        approvedAt: p.approved_at,
        approvedBy: p.approved_by,
        consentAt: p.consent_at,
        createdAt: p.created_at,
      };
      if (!p.submitted_at) {
        providerStatus = 'incomplete';
      } else {
        providerStatus = p.verification_status;
      }
      profileComplete = !!p.submitted_at;
    }
  }

  return {
    user: publicUser(user),
    profile,
    profileComplete,
    providerStatus,
  };
}

async function verifyLogin({ phone, code, app, ip, requestId }) {
  const otpService = require('./otp.service');
  await otpService.verifyOtp({ phone, code, app, ip, requestId });

  return await withTransaction(async (client) => {
    let userResult = await client.query('SELECT * FROM users WHERE phone = $1 FOR UPDATE', [phone]);
    let isNewUser = false;

    if (userResult.rows.length === 0) {
      try {
        const insertResult = await client.query(
          `INSERT INTO users (role, phone)
           VALUES ($1, $2)
           RETURNING *`,
          [app, phone]
        );
        userResult = insertResult;
        isNewUser = true;
      } catch (err) {
        if (err.code === '23505') {
          userResult = await client.query('SELECT * FROM users WHERE phone = $1 FOR UPDATE', [phone]);
          isNewUser = false;
        } else {
          throw err;
        }
      }
    }

    const user = userResult.rows[0];

    if (user.role !== app) {
      const otherApp = user.role === 'driver' ? 'ZoomDrive' : 'ZoomDrive Partner';
      throw new ApiError('ZD-AUTH-004', {
        message: `This number is registered as a ${user.role}. Open the ${otherApp} app instead.`,
      });
    }

    if (user.status === 'suspended') {
      throw new ApiError('ZD-AUTH-005');
    }

    await client.query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);

    writeAudit({
      actorType: 'user',
      actorId: user.id,
      action: isNewUser ? 'auth.signup' : 'auth.login',
      entity: 'users',
      entityId: user.id,
      meta: { app },
      requestId,
      ip,
    }, client);

    const token = signToken(user);

    logger.info({
      reqId: requestId,
      module: 'auth',
      action: isNewUser ? 'signup' : 'login',
      meta: { phone: maskPhone(phone), app, userId: user.id },
    });

    const me = await getMe(user.id, client);
    return {
      token,
      user: me.user,
      profile: me.profile,
      profileComplete: me.profileComplete,
      providerStatus: me.providerStatus,
      isNewUser,
    };
  });
}

module.exports = {
  publicUser,
  assertAppAccess,
  verifyLogin,
  signToken,
  verifyToken,
  getMe,
  mapOrganisationRow,
};
