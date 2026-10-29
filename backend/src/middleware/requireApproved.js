const { query } = require('../db/pool');
const ApiError = require('../lib/ApiError');

module.exports = function requireApproved(req, res, next) {
  if (!req.user || !req.user.id) {
    return next(new ApiError('ZD-AUTH-001'));
  }

  query('SELECT verification_status FROM provider_profiles WHERE user_id = $1', [req.user.id])
    .then((result) => {
      if (result.rows.length === 0) {
        return next(new ApiError('ZD-PROV-005'));
      }
      const status = result.rows[0].verification_status;
      if (status !== 'approved') {
        return next(new ApiError('ZD-PROV-005'));
      }
      return next();
    })
    .catch(next);
};
