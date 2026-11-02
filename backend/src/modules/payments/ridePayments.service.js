const crypto = require('crypto');
const { pool, withTransaction } = require('../../db/pool');
const ApiError = require('../../lib/ApiError');
const { writeAudit } = require('../../lib/audit');
const { createNotification } = require('../notifications/notifications.service');
const paystack = require('./paystack.service');
const ledger = require('./ledger.service');
const { env } = require('../../config/env');

function paymentView(row) {
  if (!row) return null;
  return {
    method: row.method,
    status: row.status || row.payment_status,
    amountCents: Number(row.amount_cents),
    paidAt: row.paid_at,
  };
}

async function getPaymentView(requestId, client = pool) {
  const result = await client.query(
    'SELECT method, status, amount_cents, paid_at FROM payments WHERE request_id = $1',
    [requestId]
  );
  return paymentView(result.rows[0]);
}

function accountEmail(user) {
  if (user.email) return user.email;
  if (!env.PAYSTACK_FALLBACK_EMAIL_DOMAIN) throw new ApiError('ZD-PAY-003');
  return `u${user.driver_id}@${env.PAYSTACK_FALLBACK_EMAIL_DOMAIN}`;
}

function callbackUrl() {
  const origin = env.FRONTEND_ORIGINS[0];
  if (!origin) throw new ApiError('ZD-PAY-003');
  return `${origin.replace(/\/+$/, '')}/driver/`;
}

async function startRidePayment({ driverId, requestId, requestIdHeader, ip }) {
  if (!paystack.isConfigured()) throw new ApiError('ZD-PAY-003');
  const reference = `zd_ride_${requestId}_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;
  const paymentData = await withTransaction(async (client) => {
    const result = await client.query(
      `SELECT p.request_id, p.status AS payment_status, p.amount_cents, r.driver_id,
              r.status AS request_status, u.email
       FROM payments p
       JOIN requests r ON r.id = p.request_id
       JOIN users u ON u.id = r.driver_id
       WHERE p.request_id = $1
       FOR UPDATE OF p`,
      [requestId]
    );
    const payment = result.rows[0];
    if (!payment) {
      const request = await client.query('SELECT id FROM requests WHERE id = $1', [requestId]);
      if (!request.rows.length) throw new ApiError('ZD-REQ-001');
      throw new ApiError('ZD-PAY-008');
    }
    if (Number(payment.driver_id) !== Number(driverId)) throw new ApiError('ZD-REQ-007');
    if (payment.request_status !== 'completed' || payment.payment_status !== 'pending') {
      throw new ApiError('ZD-PAY-008');
    }

    await client.query(
      `UPDATE payments SET paystack_ref = $1
       WHERE request_id = $2 AND status = 'pending'`,
      [reference, requestId]
    );
    await writeAudit({
      actorType: 'user',
      actorId: driverId,
      action: 'payment.ride_started',
      entity: 'payments',
      entityId: requestId,
      meta: { amountCents: payment.amount_cents },
      requestId: requestIdHeader,
      ip,
    }, client);
    return {
      email: accountEmail({ email: payment.email, driver_id: driverId }),
      amountCents: Number(payment.amount_cents),
    };
  });

  const initialized = await paystack.initializeTransaction({
    email: paymentData.email,
    amountCents: paymentData.amountCents,
    reference,
    callbackUrl: callbackUrl(),
    metadata: { purpose: 'ride', requestId },
  });
  if (initialized.reference !== reference) throw new ApiError('ZD-PAY-001');
  return { authorizationUrl: initialized.authorizationUrl, reference };
}

async function loadPaymentAndRequest(requestId, client = pool, lock = false) {
  const result = await client.query(
    `SELECT p.request_id, p.method, p.status AS payment_status, p.amount_cents,
            p.paystack_ref, p.paid_at, r.driver_id, r.provider_id, r.status AS request_status,
            r.provider_earning_cents, r.commission_cents
     FROM payments p
     JOIN requests r ON r.id = p.request_id
     WHERE p.request_id = $1${lock ? ' FOR UPDATE OF p' : ''}`,
    [requestId]
  );
  if (result.rows[0]) return result.rows[0];
  const request = await client.query('SELECT id FROM requests WHERE id = $1', [requestId]);
  if (!request.rows.length) throw new ApiError('ZD-REQ-001');
  throw new ApiError('ZD-PAY-008');
}

async function settleCard({ requestId, expectDriverId, requestIdHeader, ip }) {
  const initial = await loadPaymentAndRequest(requestId);
  if (expectDriverId !== undefined && Number(initial.driver_id) !== Number(expectDriverId)) {
    throw new ApiError('ZD-REQ-007');
  }
  if (initial.payment_status === 'paid') {
    return { payment: paymentView(initial) };
  }
  if (!initial.paystack_ref) throw new ApiError('ZD-PAY-004');

  const verified = await paystack.verifyTransaction(initial.paystack_ref);
  if (verified.reference !== initial.paystack_ref) throw new ApiError('ZD-PAY-001');
  if (verified.status !== 'success') return { payment: paymentView(initial) };
  if (verified.amountCents !== Number(initial.amount_cents) || verified.currency !== 'ZAR') {
    throw new ApiError('ZD-PAY-001', { message: 'Payment amount could not be verified' });
  }

  const payment = await withTransaction(async (client) => {
    const current = await loadPaymentAndRequest(requestId, client, true);
    if (current.payment_status === 'paid') return paymentView(current);
    if (current.payment_status !== 'pending' || current.request_status !== 'completed') {
      throw new ApiError('ZD-PAY-008');
    }
    if (Number(current.amount_cents) !== verified.amountCents || !current.provider_id) {
      throw new ApiError('ZD-PAY-001', { message: 'Payment amount could not be verified' });
    }

    const updated = await client.query(
      `UPDATE payments
       SET method = 'card', status = 'paid', paid_at = now()
       WHERE request_id = $1 AND status = 'pending'
       RETURNING method, status, amount_cents, paid_at`,
      [requestId]
    );
    if (!updated.rows[0]) {
      const latest = await getPaymentView(requestId, client);
      if (latest && latest.status === 'paid') return latest;
      throw new ApiError('ZD-PAY-008');
    }

    await ledger.postEarning(client, {
      providerId: current.provider_id,
      requestId,
      amountCents: Number(current.provider_earning_cents),
      note: 'Card payment',
    });
    await createNotification({
      userId: current.provider_id,
      title: 'Payment received',
      body: 'Payment for your completed job has been received.',
      kind: 'ride_payment_received',
    }, client);
    await writeAudit({
      actorType: 'system',
      action: 'payment.ride_paid',
      entity: 'payments',
      entityId: requestId,
      meta: { method: 'card', amountCents: current.amount_cents },
      requestId: requestIdHeader,
      ip,
    }, client);
    return paymentView(updated.rows[0]);
  });
  return { payment };
}

async function readBooleanSetting(client, key) {
  const result = await client.query('SELECT value FROM app_settings WHERE key = $1', [key]);
  if (!result.rows[0] || !['true', 'false'].includes(String(result.rows[0].value).toLowerCase())) {
    throw new ApiError('ZD-SYS-001', { message: 'A required payment setting is missing or invalid' });
  }
  return String(result.rows[0].value).toLowerCase() === 'true';
}

async function recordOffline({ requestId, method, actor, receivedBy, note, requestIdHeader, ip }) {
  return withTransaction(async (client) => {
    if (actor.role === 'provider' && !(await readBooleanSetting(client, 'cash_payments_enabled'))) {
      throw new ApiError('ZD-PAY-009');
    }
    const current = await loadPaymentAndRequest(requestId, client, true);
    if (actor.role === 'provider' && Number(current.provider_id) !== Number(actor.id)) {
      throw new ApiError('ZD-REQ-007');
    }
    if (current.request_status !== 'completed' || current.payment_status !== 'pending') {
      throw new ApiError('ZD-PAY-008');
    }
    const finalReceivedBy = actor.role === 'provider' ? 'provider' : receivedBy;
    if (!['provider', 'platform'].includes(finalReceivedBy)) {
      throw new ApiError('ZD-VAL-001', { message: 'Choose who received the payment' });
    }

    const updated = await client.query(
      `UPDATE payments
       SET method = $1, status = 'paid', paid_at = now()
       WHERE request_id = $2 AND status = 'pending'
       RETURNING method, status, amount_cents, paid_at`,
      [method, requestId]
    );
    if (!updated.rows[0]) throw new ApiError('ZD-PAY-008');

    if (finalReceivedBy === 'provider') {
      await ledger.postCashCommission(client, {
        providerId: current.provider_id,
        requestId,
        amountCents: Number(current.commission_cents),
      });
    } else {
      await ledger.postEarning(client, {
        providerId: current.provider_id,
        requestId,
        amountCents: Number(current.provider_earning_cents),
        note: 'Received by platform',
      });
    }

    await writeAudit({
      actorType: actor.role === 'admin' ? 'admin' : 'user',
      actorId: actor.id,
      action: 'payment.recorded_offline',
      entity: 'payments',
      entityId: requestId,
      meta: { method, receivedBy: finalReceivedBy, note: note || null },
      requestId: requestIdHeader,
      ip,
    }, client);
    return { payment: paymentView(updated.rows[0]) };
  });
}

module.exports = { startRidePayment, settleCard, recordOffline, getPaymentView };