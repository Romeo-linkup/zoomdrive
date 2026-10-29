// Wraps an async handler so rejected promises reach the error handler (works on Express 4 and 5).
module.exports = function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
};