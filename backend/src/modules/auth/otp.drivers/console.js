const { logger, maskPhone } = require('../../../lib/logger');

// Development driver: prints the code to the server log instead of sending an SMS.
async function send({ phone, code }) {
  logger.info({ module: 'otp', message: `OTP for ${maskPhone(phone)}: ${code}` });
  return { delivered: true };
}

module.exports = { name: 'console', send };