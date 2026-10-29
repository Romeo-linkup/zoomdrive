const ApiError = require('../lib/ApiError');
const { logger } = require('../lib/logger');
const { env } = require('../config/env');
const { mapDbError } = require('../db/pool');

function errorHandler(err, req, res, next) {
  let apiError;

  if (err instanceof ApiError) {
    apiError = err;
  } else if (err.type === 'entity.parse.failed') {
    apiError = new ApiError('ZD-VAL-001', { message: 'Invalid JSON body' });
  } else if (err.type === 'entity.too.large') {
    apiError = new ApiError('ZD-VAL-001', { message: 'Request body too large' });
  } else {
    const mapped = mapDbError(err);
    if (mapped instanceof ApiError) {
      apiError = mapped;
    } else {
      logger.error({
        reqId: req.id,
        module: 'errorHandler',
        message: err.message,
        meta: { stack: err.stack },
      });
      apiError = new ApiError('ZD-SYS-001');
    }
  }

  if (apiError.status >= 500) {
    logger.error({
      reqId: req.id,
      module: 'errorHandler',
      code: apiError.code,
      message: apiError.message,
      meta: { stack: err.stack },
    });
  } else if (apiError.status >= 400) {
    logger.warn({
      reqId: req.id,
      module: 'errorHandler',
      code: apiError.code,
      message: apiError.message,
    });
  }

  const response = {
    ok: false,
    error: {
      code: apiError.code,
      message: apiError.message,
      field: apiError.field,
      details: apiError.details,
    },
    requestId: req.id,
  };

  if (env.NODE_ENV === 'development' && !(err instanceof ApiError)) {
    response.error.stack = err.stack;
  }

  res.status(apiError.status).json(response);
}

module.exports = errorHandler;
