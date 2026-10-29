const { withTransaction } = require('../../db/pool');
const ApiError = require('../../lib/ApiError');
const { getMe } = require('../auth/auth.service');
const { writeAudit } = require('../../lib/audit');

async function upsertOrganisation(req, res) {
  const userId = req.user.id;
  const body = req.body;

  await withTransaction(async (client) => {
    const profileResult = await client.query('SELECT * FROM provider_profiles WHERE user_id = $1 FOR UPDATE', [userId]);
    if (profileResult.rows.length === 0) {
      throw new ApiError('ZD-PROV-004', { message: 'Choose "Company or organisation" and save your profile first' });
    }
    const profile = profileResult.rows[0];
    if (profile.provider_type !== 'company') {
      throw new ApiError('ZD-PROV-004', { message: 'Choose "Company or organisation" and save your profile first' });
    }

    if (profile.organisation_id) {
      await client.query('UPDATE organisations SET name = $1, reg_number = $2 WHERE id = $3', [body.name, body.regNumber, profile.organisation_id]);
    } else {
      const orgResult = await client.query(
        "INSERT INTO organisations (name, reg_number, status, owner_user_id) VALUES ($1, $2, 'pending', $3) RETURNING id",
        [body.name, body.regNumber, userId]
      );
      const orgId = orgResult.rows[0].id;
      await client.query('UPDATE provider_profiles SET organisation_id = $1 WHERE user_id = $2', [orgId, userId]);
    }

    await writeAudit(
      {
        actorType: 'user',
        actorId: userId,
        action: 'provider.organisation_save',
        entity: 'organisations',
        entityId: userId,
        requestId: req.id,
        ip: req.ip,
      },
      client
    );
  });

  res.ok(await getMe(userId));
}

module.exports = { upsertOrganisation };
