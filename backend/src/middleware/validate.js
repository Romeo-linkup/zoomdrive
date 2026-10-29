const ApiError = require('../lib/ApiError');

// validate(zodSchema, 'body' | 'query' | 'params')
// Parsed data is stored on req.validated (and req.body for the body source).
function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source] ?? {});
    if (!result.success) {
      const issues = result.error.issues;
      const first = issues[0];
      return next(new ApiError('ZD-VAL-001', {
        message: first.message,
        field: first.path.length ? first.path.join('.') : null,
        details: issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      }));
    }
    req.validated = result.data;
    if (source === 'body') req.body = result.data;
    return next();
  };
}

module.exports = validate;