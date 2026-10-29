const ApiError = require('./ApiError');

// Accepts SA mobile numbers in common formats and returns E.164 (+27XXXXXXXXX), or null.
function normalisePhone(input) {
  if (typeof input !== 'string') return null;
  let s = input.trim().replace(/[\s\-().]/g, '');
  if (s.startsWith('+')) s = s.slice(1);
  if (!/^\d+$/.test(s)) return null;
  if (s.startsWith('0027')) s = s.slice(4);
  else if (s.startsWith('27')) s = s.slice(2);
  if (s.startsWith('0')) s = s.slice(1);
  if (!/^[678]\d{8}$/.test(s)) return null;
  return '+27' + s;
}

function assertValidPhone(input) {
  const phone = normalisePhone(input);
  if (!phone) {
    throw new ApiError('ZD-VAL-001', { message: 'Enter a valid South African mobile number', field: 'phone' });
  }
  return phone;
}

module.exports = { normalisePhone, assertValidPhone };