const { query } = require('../db/pool');
const ApiError = require('../lib/ApiError');
const { getRegistrationState } = require('../modules/payments/charges.service');

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
      return getRegistrationState(req.user.id)
        .then((registration) => {
          if (registration.required) {
            return next(new ApiError('ZD-PROV-006', {
              message: 'Pay your one-time registration fee to go online',
            }));
          }
          return next();
        });
    })
    .catch(next);
};
