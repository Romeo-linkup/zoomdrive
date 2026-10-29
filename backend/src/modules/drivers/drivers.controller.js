const { withTransaction } = require('../../db/pool');
const ApiError = require('../../lib/ApiError');
const { getMe } = require('../auth/auth.service');
const { writeAudit } = require('../../lib/audit');

async function upsertMe(req, res) {
  const userId = req.user.id;
  const body = req.body;

  await withTransaction(async (client) => {
    const existingProfile = await client.query('SELECT consent_at FROM driver_profiles WHERE user_id = $1 FOR UPDATE', [userId]);

    if (existingProfile.rows.length === 0 && body.consent !== true) {
      throw new ApiError('ZD-VAL-001', { message: 'Please accept the Terms and Privacy Policy to continue', field: 'consent' });
    }

    await client.query(
      'UPDATE users SET first_name = $1, last_name = $2, email = $3, updated_at = now() WHERE id = $4',
      [body.firstName, body.lastName, body.email || null, userId]
    );

    await client.query(
      `INSERT INTO driver_profiles (user_id, vehicle_make, vehicle_model, vehicle_colour, plate, hail_platform, consent_at)
       VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $7::boolean THEN now() ELSE NULL END)
       ON CONFLICT (user_id) DO UPDATE SET
         vehicle_make = EXCLUDED.vehicle_make,
         vehicle_model = EXCLUDED.vehicle_model,
         vehicle_colour = EXCLUDED.vehicle_colour,
         plate = EXCLUDED.plate,
         hail_platform = EXCLUDED.hail_platform,
         consent_at = COALESCE(driver_profiles.consent_at, CASE WHEN $7::boolean THEN now() ELSE NULL END)`,
      [
        userId,
        body.vehicleMake || null,
        body.vehicleModel || null,
        body.vehicleColour || null,
        body.plate || null,
        body.hailPlatform || null,
        body.consent === true,
      ]
    );

    await writeAudit(
      {
        actorType: 'user',
        actorId: userId,
        action: 'driver.profile_save',
        entity: 'driver_profiles',
        entityId: userId,
        requestId: req.id,
        ip: req.ip,
      },
      client
    );
  });

  res.ok(await getMe(userId));
}

module.exports = { upsertMe };
