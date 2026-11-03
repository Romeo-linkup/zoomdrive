const { sendOtpEmail } = require('../../../lib/mailer');

async function send({ email, code }) {
  await sendOtpEmail({ to: email, code, minutes: 5 });
  return { delivered: true };
}

module.exports = { name: 'email', send };