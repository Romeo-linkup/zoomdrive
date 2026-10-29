const ApiError = require('../lib/ApiError');

// Use after auth middleware: router.put('/me', auth, requireRole('driver'), ...)
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(new ApiError('ZD-AUTH-001'));
    if (!roles.includes(req.user.role)) {
      return next(new ApiError('ZD-AUTH-004', { message: 'This account cannot use this feature.' }));
    }
    return next();
  };
}

module.exports = requireRole;