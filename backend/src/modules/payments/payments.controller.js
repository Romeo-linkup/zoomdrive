const ApiError = require('../../lib/ApiError');
const paystack = require('./paystack.service');
const charges = require('./charges.service');

async function paystackWebhook(req, res) {
  const signature = req.get('x-paystack-signature');
  if (!paystack.verifyWebhookSignature(req.rawBody, signature)) {
    throw new ApiError('ZD-PAY-002');
  }

  let event;
  try {
    event = JSON.parse(req.rawBody.toString('utf8'));
  } catch {
    throw new ApiError('ZD-VAL-001', { message: 'Invalid payment webhook body' });
  }

  if (event && event.event === 'charge.success' && event.data && typeof event.data.reference === 'string') {
    try {
      await charges.settleByReference(event.data.reference);
    } catch (err) {
      if (!(err instanceof ApiError) || err.code !== 'ZD-PAY-004') throw err;
    }
  }

  res.ok({ received: true });
}

module.exports = { paystackWebhook };