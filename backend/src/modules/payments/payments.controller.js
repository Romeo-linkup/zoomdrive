const ApiError = require('../../lib/ApiError');
const { query } = require('../../db/pool');
const { writeAudit } = require('../../lib/audit');
const paystack = require('./paystack.service');
const charges = require('./charges.service');
const ridePayments = require('./ridePayments.service');
const { enqueueAdminAlert } = require('../notifications/emailOutbox.service');

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
  const callbackReference = req.query.reference || req.query.trxref;
  const result = await ridePayments.settleCard({
    requestId: Number(req.params.requestId),
    expectDriverId: req.user.id,
    requestIdHeader: req.id,
    ip: req.ip,
    paystackRef: callbackReference || undefined,
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
    const reference = event.data.reference;
    const amountCents = Number(event.data.amount);
    const currency = event.data.currency;
    const metadata = event.data.metadata && typeof event.data.metadata === 'object'
      ? event.data.metadata : {};

    const adminAlert = async (kind, subject, text, dedupeKey) => {
      await enqueueAdminAlert({ kind, subject, text, dedupeKey });
    };

    const auditUnmatched = async () => {
      await writeAudit({
        actorType: 'system', action: 'payment.payment_unmatched', entity: 'payments', entityId: null,
        meta: { reference, amountCents },
      });
      await adminAlert('payment_attention', 'Unmatched payment reference',
        `A Paystack charge.success webhook arrived for reference ${reference} (amount ${amountCents}) that matches no payment or charge.`,
        `admin_alert:payment_unmatched:${reference}`);
      return res.ok({ received: true });
    };

    const auditMismatch = async (entity, entityId, expectedCents) => {
      await writeAudit({
        actorType: 'system', action: 'payment.payment_mismatch', entity, entityId,
        meta: { reference, expectedCents, receivedCents: amountCents, currency },
      });
      await adminAlert('payment_attention', 'Payment amount mismatch',
        `Reference ${reference}: expected ${expectedCents} cents, received ${amountCents} cents (currency ${currency}).`,
        `admin_alert:payment_mismatch:${reference}`);
      return res.ok({ received: true });
    };

    const auditDuplicate = async (entity, entityId, meta) => {
      await writeAudit({
        actorType: 'system', action: 'payment.duplicate_charge', entity, entityId,
        meta: { reference, amountCents, ...meta },
      });
      await adminAlert('payment_attention', 'Duplicate charge reference',
        `Reference ${reference} was already settled (amount ${amountCents}). No refund issued; refunds are manual.`,
        `admin_alert:duplicate_charge:${reference}`);
      return res.ok({ received: true });
    };

    const auditOverpayment = async (entity, entityId, expectedCents) => {
      await writeAudit({
        actorType: 'system', action: 'payment.webhook_overpayment', entity, entityId,
        meta: { reference, expectedCents, receivedCents: amountCents },
      });
    };

    // Platform charge (registration fee / Driver Plus)
    const chargeRow = await query(
      'SELECT id, user_id, amount_cents, status, purpose FROM platform_charges WHERE paystack_ref = $1',
      [reference]
    );
    if (chargeRow.rows[0]) {
      const charge = chargeRow.rows[0];
      const expectedCents = Number(charge.amount_cents);
      if (charge.status === 'paid') {
        return auditDuplicate('platform_charges', charge.id, { existingReference: reference });
      }
      if (!Number.isFinite(amountCents) || currency !== 'ZAR' || amountCents < expectedCents) {
        return auditMismatch('platform_charges', charge.id, expectedCents);
      }
      await charges.settleByReference(reference);
      if (amountCents > expectedCents) {
        await auditOverpayment('platform_charges', charge.id, expectedCents);
      }
      return res.ok({ received: true });
    }

    // Ride payment
    if (reference.startsWith('zd_ride_')) {
      const paymentRow = await query(
        'SELECT id, request_id, status, paystack_ref, amount_cents FROM payments WHERE paystack_ref = $1',
        [reference]
      );
      if (paymentRow.rows[0]) {
        const payment = paymentRow.rows[0];
        const expectedCents = Number(payment.amount_cents);
        if (payment.status === 'paid') {
          return auditDuplicate('payments', payment.request_id, { existingReference: payment.paystack_ref });
        }
        if (!Number.isFinite(amountCents) || currency !== 'ZAR' || amountCents < expectedCents) {
          return auditMismatch('payments', payment.request_id, expectedCents);
        }
        await ridePayments.settleCard({ requestId: payment.request_id });
        if (amountCents > expectedCents) {
          await auditOverpayment('payments', payment.request_id, expectedCents);
        }
        return res.ok({ received: true });
      }

      // Metadata fallback: reference matches no payment. Check metadata.requestId.
      const metadataRequestId = metadata.requestId;
      if (metadataRequestId !== undefined && metadataRequestId !== null) {
        const reqId = Number(metadataRequestId);
        if (Number.isFinite(reqId)) {
          const pendingPayment = await query(
            'SELECT id, request_id, status, paystack_ref, amount_cents FROM payments WHERE request_id = $1',
            [reqId]
          );
          if (pendingPayment.rows[0]) {
            const payment = pendingPayment.rows[0];
            if (payment.status === 'paid') {
              return auditDuplicate('payments', payment.request_id, { existingReference: payment.paystack_ref });
            }
            if (payment.status !== 'pending') {
              return auditUnmatched();
            }
            // Verify the paid reference against our own payment row (never trust metadata for amounts/users)
            const expectedCents = Number(payment.amount_cents);
            if (!Number.isFinite(amountCents) || currency !== 'ZAR' || amountCents < expectedCents) {
              return auditMismatch('payments', payment.request_id, expectedCents);
            }
            await ridePayments.settleCard({
              requestId: reqId,
              paystackRef: reference,
            });
            if (amountCents > expectedCents) {
              await auditOverpayment('payments', payment.request_id, expectedCents);
            }
            await writeAudit({
              actorType: 'system', action: 'payment_settled_via_metadata', entity: 'payments',
              entityId: payment.request_id,
              meta: { webhookReference: reference, storedReference: payment.paystack_ref },
              requestId: req.id,
              ip: req.ip,
            });
            return res.ok({ received: true });
          }
        }
      }

      return auditUnmatched();
    }

    // Unknown reference
    return auditUnmatched();
  }

  res.ok({ received: true });
}

module.exports = { startRidePayment, verifyRidePayment, paystackWebhook };
