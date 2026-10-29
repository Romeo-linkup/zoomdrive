const { uploadProfilePhoto } = require('../uploads/cloudinary.service');
const { query } = require('../../db/pool');
const { getMe } = require('../auth/auth.service');
const { writeAudit } = require('../../lib/audit');
const { withTransaction } = require('../../db/pool');

async function uploadPhoto(req, res) {
  const userId = req.user.id;

  const result = await uploadProfilePhoto(req.file.buffer, userId);

  await withTransaction(async (client) => {
    await client.query('UPDATE users SET photo_url = $1, updated_at = now() WHERE id = $2', [result.url, userId]);

    await writeAudit(
      {
        actorType: 'user',
        actorId: userId,
        action: 'user.photo_update',
        entity: 'users',
        entityId: userId,
        requestId: req.id,
        ip: req.ip,
      },
      client
    );
  });

  res.ok(await getMe(userId));
}

module.exports = { uploadPhoto };
