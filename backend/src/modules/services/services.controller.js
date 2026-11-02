const { query } = require('../../db/pool');

// Public list of active services with prices (fuel is seeded inactive, so it is not returned).
async function listServices(req, res) {
  const { rows } = await query(
    `SELECT id, code, name, icon, base_price_cents, per_km_cents, min_distance_fee_cents
       FROM services
      WHERE active = true
      ORDER BY sort_order, id`
  );
  res.ok({
    services: rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      icon: r.icon,
      basePriceCents: r.base_price_cents,
      perKmCents: r.per_km_cents,
      minDistanceFeeCents: r.min_distance_fee_cents,
    })),
  });
}

module.exports = { listServices };