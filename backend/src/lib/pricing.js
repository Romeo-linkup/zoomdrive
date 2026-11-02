const { percentOf } = require('./money');

// Used when no provider is online near the driver (blueprint 9.3).
const DEFAULT_DISTANCE_KM = 5;

const round2 = (n) => Math.round(n * 100) / 100;

// Road distance in km. nearestStraightKm is the straight-line distance to the nearest candidate provider,
// or null/undefined when nobody is available (then the flat default applies).
function quoteDistanceKm({ nearestStraightKm, roadFactor }) {
  if (nearestStraightKm === null || nearestStraightKm === undefined) return DEFAULT_DISTANCE_KM;
  return round2(nearestStraightKm * roadFactor);
}

// Pure price calculation (blueprint 9.3). service = { basePriceCents, perKmCents, minDistanceFeeCents }.
// The result is stored on the request at creation and never recalculated.
function computeQuote({ service, distanceKm, commissionPct }) {
  const servicePriceCents = service.basePriceCents;
  const distanceFeeCents = Math.max(service.minDistanceFeeCents, Math.round(distanceKm * service.perKmCents));
  const totalCents = servicePriceCents + distanceFeeCents;
  const commissionCents = percentOf(totalCents, commissionPct);
  return {
    distanceKm: round2(distanceKm),
    servicePriceCents,
    distanceFeeCents,
    totalCents,
    commissionPct: Number(commissionPct),
    commissionCents,
    providerEarningCents: totalCents - commissionCents,
  };
}

module.exports = { DEFAULT_DISTANCE_KM, quoteDistanceKm, computeQuote };
