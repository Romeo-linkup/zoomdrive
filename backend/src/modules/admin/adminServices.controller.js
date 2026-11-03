const { query, withTransaction } = require('../../db/pool');
const ApiError = require('../../lib/ApiError');
const { writeAudit } = require('../../lib/audit');

async function listAll(req, res) {
  const { rows } = await query(`
    SELECT
      id,
      code,
      name,
      icon,
      base_price_cents AS "basePriceCents",
      per_km_cents AS "perKmCents",
      min_distance_fee_cents AS "minDistanceFeeCents",
      active,
      sort_order AS "sortOrder"
    FROM services
    ORDER BY sort_order, id
  `);
  res.ok({ services: rows });
}

async function update(req, res) {
  const id = Number(req.params.id);
  const body = req.body;

  await withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM services WHERE id = $1', [id]);
    if (!rows[0]) {
      throw new ApiError('ZD-ADM-003', { message: 'Service not found' });
    }

    const service = rows[0];
    const updates = [];
    const params = [];
    let paramIndex = 1;
    const changedFields = {};

    if (body.name !== undefined) {
      updates.push(`name = $${paramIndex}`);
      params.push(body.name);
      changedFields.name = { from: service.name, to: body.name };
      paramIndex++;
    }

    if (body.basePriceCents !== undefined) {
      updates.push(`base_price_cents = $${paramIndex}`);
      params.push(body.basePriceCents);
      changedFields.basePriceCents = { from: service.base_price_cents, to: body.basePriceCents };
      paramIndex++;
    }

    if (body.perKmCents !== undefined) {
      updates.push(`per_km_cents = $${paramIndex}`);
      params.push(body.perKmCents);
      changedFields.perKmCents = { from: service.per_km_cents, to: body.perKmCents };
      paramIndex++;
    }

    if (body.minDistanceFeeCents !== undefined) {
      updates.push(`min_distance_fee_cents = $${paramIndex}`);
      params.push(body.minDistanceFeeCents);
      changedFields.minDistanceFeeCents = { from: service.min_distance_fee_cents, to: body.minDistanceFeeCents };
      paramIndex++;
    }

    if (body.active !== undefined) {
      updates.push(`active = $${paramIndex}`);
      params.push(body.active);
      changedFields.active = { from: service.active, to: body.active };
      paramIndex++;
    }

    if (updates.length === 0) {
      return;
    }

    params.push(id);
    await client.query(
      `UPDATE services SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      params
    );

    await writeAudit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'admin.service_update',
      entity: 'services',
      entityId: id,
      meta: { serviceId: id, fields: Object.keys(changedFields) },
      requestId: req.id,
      ip: req.ip,
    }, client);
  });

  const { rows } = await query('SELECT * FROM services WHERE id = $1', [id]);
  res.ok({ service: rows[0] });
}

module.exports = { listAll, update };
