const ApiError = require('../lib/ApiError');
const { query } = require('../db/pool');
const { verifyToken } = require('../modules/auth/auth.service');

async function auth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new ApiError('ZD-AUTH-001', { message: 'Missing or invalid authorization header' }));
  }

  const token = authHeader.slice(7);

  let decoded;
  try {
    decoded = verifyToken(token);
  } catch (err) {
    return next(err);
  }

  const userId = parseInt(decoded.sub, 10);

  const result = await query('SELECT id, role, phone, status FROM users WHERE id = $1', [userId]);

  if (result.rows.length === 0) {
    return next(new ApiError('ZD-AUTH-001', { message: 'User not found' }));
  }

  const user = result.rows[0];

  if (user.status === 'suspended' || user.status === 'deleted') {
    return next(new ApiError('ZD-AUTH-005', { message: 'This account is not active. Contact support.' }));
  }

  req.user = {
    id: user.id,
    role: user.role,
    phone: user.phone,
    status: user.status,
  };

  next();
}

module.exports = auth;
