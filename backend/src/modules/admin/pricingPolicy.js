const ApiError = require('../../lib/ApiError');
const { env } = require('../../config/env');
const { pool } = require('../../db/pool');

const PROTECTED = Object.freeze({
  commission_pct: Object.freeze({ api: 'commissionPct', type: 'number', min: 0, max: 50 }),
  road_factor: Object.freeze({ api: 'roadFactor', type: 'number', min: 1, max: 3 }),
  avg_speed_kmh: Object.freeze({ api: 'avgSpeedKmh', type: 'number', min: 10, max: 120 }),
  offer_radius_km: Object.freeze({ api: 'offerRadiusKm', type: 'number', min: 1, max: 200 }),
  max_offers_per_request: Object.freeze({ api: 'maxOffersPerRequest', type: 'integer', min: 1, max: 20 }),
  request_expiry_seconds: Object.freeze({ api: 'requestExpirySeconds', type: 'integer', min: 30, max: 1800 }),
  provider_stale_seconds: Object.freeze({ api: 'providerStaleSeconds', type: 'integer', min: 30, max: 900 }),
  cancel_fee_cents: Object.freeze({ api: 'cancelFeeCents', type: 'integer', min: 0, max: 100000 }),
  provider_registration_fee_cents: Object.freeze({ api: 'providerRegistrationFeeCents', type: 'integer', min: 0, max: 1000000 }),
  provider_registration_fee_enabled: Object.freeze({ api: 'providerRegistrationFeeEnabled', type: 'boolean' }),
  provider_registration_waiver_enabled: Object.freeze({ api: 'providerRegistrationWaiverEnabled', type: 'boolean' }),
  driver_plus_monthly_cents: Object.freeze({ api: 'driverPlusMonthlyCents', type: 'integer', min: 0, max: 1000000 }),
  driver_plus_trial_days: Object.freeze({ api: 'driverPlusTrialDays', type: 'integer', min: 0, max: 365 }),
  driver_plus_enabled: Object.freeze({ api: 'driverPlusEnabled', type: 'boolean' }),
  driver_plus_extra_offers: Object.freeze({ api: 'driverPlusExtraOffers', type: 'integer', min: 0, max: 20 }),
});

const DEFAULTS = Object.freeze({
  commission_pct: 15,
  road_factor: 1.3,
  avg_speed_kmh: 40,
  offer_radius_km: 25,
  max_offers_per_request: 5,
  request_expiry_seconds: 180,
  provider_stale_seconds: 120,
  cancel_fee_cents: 0,
  provider_registration_fee_cents: 0,
  provider_registration_fee_enabled: false,
  provider_registration_waiver_enabled: true,
  driver_plus_monthly_cents: 0,
  driver_plus_trial_days: 0,
  driver_plus_enabled: false,
  driver_plus_extra_offers: 0,
});

function parseValue(key, value) {
  const rule = PROTECTED[key];
  if (rule.type === 'boolean') {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
  } else {
    if (typeof value === 'string' && value.trim() === '') {
      throw new ApiError('ZD-SYS-001', { message: `Stored pricing setting ${key} is invalid` });
    }
    const parsed = Number(value);
    if (Number.isFinite(parsed)
      && parsed >= (rule.min ?? Number.MIN_SAFE_INTEGER)
      && parsed <= (rule.max ?? Number.MAX_SAFE_INTEGER)
      && (rule.type !== 'integer' || Number.isInteger(parsed))) {
      return parsed;
    }
  }
  throw new ApiError('ZD-SYS-001', { message: `Stored pricing setting ${key} is invalid` });
}

function valueToString(value) {
  return String(value);
}

async function readValues(client = pool) {
  const { rows } = await client.query(
    'SELECT key, value FROM app_settings WHERE key = ANY($1::text[])',
    [Object.keys(PROTECTED)]
  );
  const stored = new Map(rows.map((row) => [row.key, row.value]));
  const values = {};
  for (const [key, rule] of Object.entries(PROTECTED)) {
    values[rule.api] = parseValue(key, stored.has(key) ? stored.get(key) : DEFAULTS[key]);
  }
  return values;
}

function validateChanges(changes) {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes) || Object.keys(changes).length === 0) {
    throw new ApiError('ZD-VAL-001', { message: 'Provide at least one pricing change', field: 'changes' });
  }

  const normalized = {};
  for (const [apiKey, value] of Object.entries(changes)) {
    const [dbKey, rule] = Object.entries(PROTECTED).find(([, item]) => item.api === apiKey) || [];
    if (!rule) {
      throw new ApiError('ZD-VAL-001', { message: 'Unknown pricing field', field: `changes.${apiKey}` });
    }
    if (rule.type === 'boolean') {
      if (typeof value !== 'boolean') {
        throw new ApiError('ZD-VAL-001', { message: 'Must be a boolean', field: `changes.${apiKey}` });
      }
    } else if (typeof value !== 'number'
      || !Number.isFinite(value)
      || value < rule.min
      || value > rule.max
      || (rule.type === 'integer' && !Number.isInteger(value))) {
      throw new ApiError('ZD-VAL-001', {
        message: `Must be ${rule.type === 'integer' ? 'an integer ' : ''}between ${rule.min} and ${rule.max}`,
        field: `changes.${apiKey}`,
      });
    }
    normalized[dbKey] = value;
  }
  return normalized;
}

function diffValues(current, changes) {
  const diff = {};
  for (const [dbKey, value] of Object.entries(changes)) {
    const apiKey = PROTECTED[dbKey].api;
    if (current[apiKey] !== value) {
      diff[dbKey] = { from: current[apiKey], to: value };
    }
  }
  return diff;
}

function nextAllowedAt(lastChangedAt) {
  if (!lastChangedAt) return null;
  return new Date(new Date(lastChangedAt).getTime() + env.PRICING_CHANGE_COOLDOWN_HOURS * 60 * 60 * 1000);
}

async function getLastChange(client) {
  const { rows } = await client.query(
    `SELECT pcl.created_at AS "changedAt", pcl.changes,
            au.name AS "adminName"
     FROM pricing_change_log pcl
     JOIN admin_users au ON au.id = pcl.admin_id
     ORDER BY pcl.created_at DESC
     LIMIT 1`
  );
  return rows[0] || null;
}

async function assertChangeAllowed(client) {
  const lastChange = await getLastChange(client);
  const nextAt = nextAllowedAt(lastChange && lastChange.changedAt);
  if (nextAt && nextAt.getTime() > Date.now()) {
    throw new ApiError('ZD-ADM-007', {
      details: { nextAllowedAt: nextAt.toISOString() },
    });
  }
}

async function lockPricing(client) {
  await client.query("SELECT pg_advisory_xact_lock(hashtext('zoomdrive:pricing'))");
}

module.exports = {
  PROTECTED,
  DEFAULTS,
  readValues,
  validateChanges,
  diffValues,
  valueToString,
  getLastChange,
  nextAllowedAt,
  assertChangeAllowed,
  lockPricing,
};