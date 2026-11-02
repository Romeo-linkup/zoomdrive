const EARTH_RADIUS_KM = 6371.0088;
const toRad = (deg) => (deg * Math.PI) / 180;

// Straight-line distance in km between two coordinates.
function haversineKm(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Cheap SQL pre-filter: a square that contains the circle of radiusKm around the point.
function boundingBox(lat, lng, radiusKm) {
  const latDelta = radiusKm / 111.32;
  const lngDelta = radiusKm / (111.32 * Math.max(0.01, Math.cos(toRad(lat))));
  return { minLat: lat - latDelta, maxLat: lat + latDelta, minLng: lng - lngDelta, maxLng: lng + lngDelta };
}

function isValidCoord(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

// Rough South Africa bounding box (includes Lesotho and Eswatini). Pilot-city limits come later (open question 3).
function inServiceArea(lat, lng) {
  return isValidCoord(lat, lng) && lat >= -35.0 && lat <= -22.0 && lng >= 16.3 && lng <= 33.0;
}

function etaMinutes(distanceKm, avgSpeedKmh) {
  return Math.max(1, Math.round((distanceKm / avgSpeedKmh) * 60));
}

module.exports = { haversineKm, boundingBox, isValidCoord, inServiceArea, etaMinutes };
