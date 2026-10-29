const { withTransaction } = require('../../db/pool');
const ApiError = require('../../lib/ApiError');
const { writeAudit } = require('../../lib/audit');

async function list(req, res) {
  const result = await req.app.locals.pool ? null : null;
}

async function list(req, res) {
  const { query } = require('../../db/pool');
  const result = await query(
    'SELECT id, label, address, lat, lng, created_at FROM saved_places WHERE user_id = $1 ORDER BY created_at DESC',
    [req.user.id]
  );
  const places = result.rows.map((row) => ({
    id: row.id,
    label: row.label,
    address: row.address,
    lat: Number(row.lat),
    lng: Number(row.lng),
    createdAt: row.created_at,
  }));
  res.ok({ places });
}

async function create(req, res) {
  const { query, withTransaction } = require('../../db/pool');
  const userId = req.user.id;
  const body = req.body;

  const countResult = await query('SELECT COUNT(*) as count FROM saved_places WHERE user_id = $1', [userId]);
  const count = parseInt(countResult.rows[0].count, 10);
  if (count >= 20) {
    throw new ApiError('ZD-VAL-001', { message: 'You can save up to 20 places' });
  }

  let place;
  await withTransaction(async (client) => {
    const insertResult = await client.query(
      'INSERT INTO saved_places (user_id, label, address, lat, lng) VALUES ($1, $2, $3, $4, $5) RETURNING id, label, address, lat, lng, created_at',
      [userId, body.label, body.address, body.lat, body.lng]
    );
    place = insertResult.rows[0];

    await writeAudit(
      {
        actorType: 'user',
        actorId: userId,
        action: 'driver.place_add',
        entity: 'saved_places',
        entityId: place.id,
        requestId: req.id,
        ip: req.ip,
      },
      client
    );
  });

  res.ok(
    {
      place: {
        id: place.id,
        label: place.label,
        address: place.address,
        lat: Number(place.lat),
        lng: Number(place.lng),
        createdAt: place.created_at,
      },
    },
    201
  );
}

async function remove(req, res) {
  const { query } = require('../../db/pool');
  const userId = req.user.id;
  const id = req.validated.id;

  let rowCount = 0;
  await withTransaction(async (client) => {
    const result = await client.query('DELETE FROM saved_places WHERE id = $1 AND user_id = $2', [id, userId]);
    rowCount = result.rowCount;

    await writeAudit(
      {
        actorType: 'user',
        actorId: userId,
        action: 'driver.place_remove',
        entity: 'saved_places',
        entityId: id,
        requestId: req.id,
        ip: req.ip,
      },
      client
    );
  });

  res.ok({ deleted: rowCount > 0 });
}

module.exports = { list, create, remove };
