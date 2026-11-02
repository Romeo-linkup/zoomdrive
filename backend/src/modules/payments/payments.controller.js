const ApiError = require('../../lib/ApiError');
const { query } = require('../../db/pool');
const paystack = require('./paystack.service');
const charges = require('./charges.service');
const ridePayments = require('./ridePayments.service');

async function startRidePayment(req, res) {
  const result = await ridePayments.startRidePayment({
    driverId: req.user.id,
    requestId: Number(req.params.requestId),
    requestIdHeader: req.id,
    ip: req.ip,
  });
  res.ok(result);
}

async function verifyRidePayment(req, res) {
  const result = await ridePayments.settleCard({
    requestId: Number(req.params.requestId),
    expectDriverId: req.user.id,
    requestIdHeader: req.id,
    ip: req.ip,
  });
  res.ok(result);
}

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
      if (event.data.reference.startsWith('zd_ride_')) {
        const result = await query(
          'SELECT request_id FROM payments WHERE paystack_ref = $1',
          [event.data.reference]
        );
        if (!result.rows[0]) throw err;
        await ridePayments.settleCard({ requestId: result.rows[0].request_id });
      }
    }
  }

  res.ok({ received: true });
}

module.exports = { startRidePayment, verifyRidePayment, paystackWebhook };