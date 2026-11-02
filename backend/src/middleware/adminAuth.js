const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { env } = require('../config/env');
const ApiError = require('../lib/ApiError');
const { query, mapDbError } = require('../db/pool');

// Admin tokens are signed with a key derived from JWT_SECRET, so a driver/provider token can never
// pass as an admin token (and the other way round), even if someone forges the claims.
const ADMIN_KEY = crypto.createHmac('sha256', env.JWT_SECRET).update('zoomdrive-admin-token-v1').digest('hex');
const ADMIN_EXPIRES_IN = '12h';

function signAdminToken(admin) {
  return jwt.sign({ sub: String(admin.id), typ: 'admin' }, ADMIN_KEY, {
    algorithm: 'HS256',
    expiresIn: ADMIN_EXPIRES_IN,
  });
}

async function adminAuth(req, res, next) {
  try {
    const [scheme, token] = (req.headers.authorization || '').split(' ');
    if (scheme !== 'Bearer' || !token) throw new ApiError('ZD-AUTH-001');

    let payload;
    try {
      payload = jwt.verify(token, ADMIN_KEY, { algorithms: ['HS256'] });
    } catch (err) {
      throw new ApiError('ZD-AUTH-001');
    }
    if (payload.typ !== 'admin') throw new ApiError('ZD-AUTH-001');

    const { rows } = await query('SELECT id, email, name FROM admin_users WHERE id = $1', [Number(payload.sub)]);
    if (!rows[0]) throw new ApiError('ZD-AUTH-001');

    req.admin = rows[0];
    next();
  } catch (err) {
    next(err instanceof ApiError ? err : mapDbError(err));
  }
}

module.exports = adminAuth;
module.exports.signAdminToken = signAdminToken;
