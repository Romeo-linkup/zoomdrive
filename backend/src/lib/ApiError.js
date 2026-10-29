const { ERRORS } = require('./errors');

class ApiError extends Error {
  constructor(code, { message, field, details } = {}) {
    const registry = ERRORS[code];
    if (!registry) {
      throw new Error('Unregistered error code: ' + code);
    }

    super(message || registry.message);
    this.code = code;
    this.status = registry.status;
    this.message = message || registry.message;
    this.field = field || null;
    this.details = details || null;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = ApiError;
