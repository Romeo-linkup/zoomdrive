const ApiError = require('../lib/ApiError');

function notFound(req, res, next) {
  next(new ApiError('ZD-SYS-003', { message: `Route not found: ${req.method} ${req.path}` }));
}

module.exports = notFound;
