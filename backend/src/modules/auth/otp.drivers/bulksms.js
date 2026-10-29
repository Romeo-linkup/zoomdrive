const ApiError = require('../../../lib/ApiError');

// Placeholder until the SMS provider is chosen (Phase 13).
async function send() {
  throw new ApiError('ZD-SYS-001', { message: 'bulksms not configured' });
}

module.exports = { name: 'bulksms', send };