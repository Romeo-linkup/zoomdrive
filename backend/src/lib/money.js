// Money is always integer cents (ZAR). Never use floats for amounts. Formatting happens only in the UI.
function isCents(value) {
  return Number.isInteger(value) && Number.isSafeInteger(value);
}

// percentOf(18000, 12) -> 2160. Percentages may have up to 2 decimals (12.5). Half cents round up.
function percentOf(cents, pct) {
  const basisPoints = Math.round(Number(pct) * 100);
  return Math.round((cents * basisPoints) / 10000);
}

function sumCents(values) {
  return values.reduce((total, v) => total + v, 0);
}

module.exports = { isCents, percentOf, sumCents };
