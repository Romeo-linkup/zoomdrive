const { writeAudit } = require('../lib/audit');
const { logger } = require('../lib/logger');

// Semantic actions: auth.otp_requested, auth.otp_failed, auth.signup, auth.login,
// auth.logout, admin.login, admin.login_failed, admin.provider_approve,
// admin.provider_reject, admin.document_review, admin.view_document,
// admin.provider_waive_registration, admin.user_suspend, admin.user_unsuspend,
// admin.account_delete, admin.settings_update, admin.service_update,
// admin.request_assign, admin.pricing_update, admin.view_bank_details,
// admin.payout_record, admin.ledger_adjustment, admin.ledger_export,
// admin.audit_export, admin.revenue_export, user.photo_update,
// driver.profile_save, driver.place_add, driver.place_remove,
// provider.profile_save, provider.services_save, provider.submit,
// provider.organisation_save, provider.document_upload, provider.document_delete,
// provider.bank_details_update, provider.online, provider.offline,
// provider.registration_fee_started, provider.registration_fee_paid,
// request.create, request.accept, request.offer_decline, request.arrived,
// request.complete, request.cancel, request.expire, request.rated,
// payment.ride_started, payment.ride_paid, payment.recorded_offline,
// payment.charge_started, payment.charge_paid, plus.join,
// plus.payment_started, plus.payment_paid, notification.read.
function apiAudit(req, res, next) {
  const startedAt = Date.now();
  const path = req.path || '';
  if (req.method === 'OPTIONS' || /\/health\/?$/.test(path) || /\/heartbeat\/?$/.test(path)) {
    return next();
  }

  res.on('finish', () => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return;

    const matchedRoute = req.route && req.route.path;
    const routePath = typeof matchedRoute === 'string'
      ? `${req.baseUrl || ''}${matchedRoute}`
      : (req.originalUrl || path).split('?')[0].replace(/\d+/g, ':n');
    const entity = routePath.slice(0, 120);
    const status = res.statusCode;
    const result = status >= 200 && status < 400
      ? 'ok'
      : status === 401 || status === 403
        ? 'denied'
        : status >= 400 && status < 500
          ? 'rejected'
          : 'error';
    const isPaystackWebhook = /\/payments\/paystack\/webhook\/?$/.test(path);
    const actorType = req.admin
      ? 'admin'
      : req.user
        ? 'user'
        : isPaystackWebhook
          ? 'system'
          : 'anonymous';
    const actorId = req.admin ? req.admin.id : req.user ? req.user.id : null;
    const userAgent = String(req.get('user-agent') || '')
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted]')
      .replace(/(?:\+27|0)\s?\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/g, '[redacted]')
      .trim()
      .slice(0, 200);

    writeAudit({
      actorType,
      actorId,
      action: `api.${req.method}`,
      entity,
      entityId: null,
      ip: req.ip,
      requestId: req.id,
      meta: {
        status,
        result,
        ms: Date.now() - startedAt,
        ua: userAgent,
      },
    }).catch(() => {
      logger.warn({
        reqId: req.id,
        module: 'apiAudit',
        message: 'API audit write failed',
      });
    });
  });

  return next();
}

module.exports = apiAudit;