const { query, withTransaction } = require('../../db/pool');
const ApiError = require('../../lib/ApiError');
const { writeAudit } = require('../../lib/audit');
const { PROTECTED } = require('./pricingPolicy');

const SETTING_RULES = {
  commission_pct: { min: 0, max: 50 },
  road_factor: { min: 1, max: 3 },
  avg_speed_kmh: { min: 10, max: 120 },
  offer_radius_km: { min: 1, max: 200 },
  max_offers_per_request: { min: 1, max: 20, integer: true },
  request_expiry_seconds: { min: 30, max: 1800, integer: true },
  provider_stale_seconds: { min: 30, max: 900, integer: true },
  cancel_fee_cents: { min: 0, max: 100000, integer: true },
};

async function getSettings(req, res) {
  const { rows } = await query(`
    SELECT key, value, updated_at AS "updatedAt"
    FROM app_settings
    ORDER BY key
  `);

  const settings = rows.map((row) => {
    const rule = SETTING_RULES[row.key];
    const value = rule ? Number(row.value) : row.value;
    return {
      key: row.key,
      value,
      updatedAt: row.updatedAt,
      min: rule?.min,
      max: rule?.max,
    };
  });

  res.ok({ settings });
}

async function updateSettings(req, res) {
  const { values } = req.body;
  const protectedKeys = new Set([
    ...Object.keys(PROTECTED),
    ...Object.values(PROTECTED).map((rule) => rule.api),
  ]);
  const protectedKey = Object.keys(values).find((key) => protectedKeys.has(key));
  if (protectedKey) {
    throw new ApiError('ZD-ADM-005', {
      message: 'Pricing settings must be changed through the verified pricing workflow',
      field: 'values.' + protectedKey,
    });
  }

  await withTransaction(async (client) => {
    const changes = {};

    for (const [key, value] of Object.entries(values)) {
      const rule = SETTING_RULES[key];
      if (!rule) {
        throw new ApiError('ZD-VAL-001', { message: 'Unknown setting', field: 'values.' + key });
      }

      const numValue = Number(value);
      if (!isFinite(numValue)) {
        throw new ApiError('ZD-VAL-001', { message: `Must be between ${rule.min} and ${rule.max}`, field: 'values.' + key });
      }

      if (numValue < rule.min || numValue > rule.max) {
        throw new ApiError('ZD-VAL-001', { message: `Must be between ${rule.min} and ${rule.max}`, field: 'values.' + key });
      }

      if (rule.integer && !Number.isInteger(numValue)) {
        throw new ApiError('ZD-VAL-001', { message: `Must be between ${rule.min} and ${rule.max}`, field: 'values.' + key });
      }

      const { rows } = await client.query('SELECT value FROM app_settings WHERE key = $1', [key]);
      const oldValue = rows[0]?.value;

      await client.query(`
        INSERT INTO app_settings (key, value, updated_at, updated_by)
        VALUES ($1, $2, now(), $3)
        ON CONFLICT (key) DO UPDATE SET
          value = EXCLUDED.value,
          updated_at = now(),
          updated_by = EXCLUDED.updated_by
      `, [key, String(value), req.admin.id]);

      if (oldValue !== String(value)) {
        changes[key] = { from: oldValue, to: String(value) };
      }
    }

    if (Object.keys(changes).length > 0) {
      await writeAudit({
        actorType: 'admin',
        actorId: req.admin.id,
        action: 'admin.settings_update',
        meta: { changes },
        requestId: req.id,
        ip: req.ip,
      }, client);
    }
  });

  return getSettings(req, res);
}

module.exports = { getSettings, updateSettings };
