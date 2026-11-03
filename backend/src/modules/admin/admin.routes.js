const express = require('express');
const { z } = require('zod');
const rateLimit = require('express-rate-limit');
const adminAuth = require('../../middleware/adminAuth');
const validate = require('../../middleware/validate');
const { adminLoginLimiter, adminWriteLimiter } = require('../../middleware/rateLimit');
const wrap = require('../../lib/asyncHandler');
const ApiError = require('../../lib/ApiError');
const authCtl = require('./adminAuth.controller');
const overview = require('./adminOverview.controller');
const providers = require('./providersReview.controller');
const users = require('./adminUsers.controller');
const services = require('./adminServices.controller');
const settings = require('./adminSettings.controller');
const adminRequests = require('./adminRequests.controller');
const adminPricing = require('./adminPricing.controller');
const adminPayouts = require('./adminPayouts.controller');
const adminAudit = require('./adminAudit.controller');
const adminRevenue = require('./adminRevenue.controller');
const requestTimeline = require('./requestTimeline.service');
const accountDeletion = require('./accountDeletion.service');

const router = express.Router();

const page = z.coerce.number().int().min(1).default(1);
const pageSize = z.coerce.number().int().min(1).max(100).default(25);
const search = z.string().trim().max(80).optional();

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(254),
  password: z.string().min(1, 'Enter your password').max(200),
});

const userIdParams = z.object({ userId: z.coerce.number().int().positive() });
const idParams = z.object({ id: z.coerce.number().int().positive() });
const providerIdParams = z.object({ providerId: z.coerce.number().int().positive() });

const providerListQuery = z.object({
  status: z.enum(['all', 'incomplete', 'pending', 'approved', 'rejected']).default('pending'),
  pageSize,
  q: search,
  page,
});

const userListQuery = z.object({
  role: z.enum(['all', 'driver', 'provider']).default('all'),
  pageSize,
  status: z.enum(['all', 'active', 'suspended', 'deleted']).default('all'),
  q: search,
  page,
});

const requestListQuery = z.object({
  status: z.enum(['all', 'searching', 'accepted', 'arrived', 'completed', 'cancelled', 'expired']).default('all'),
  pageSize,
  q: search,
  page,
});
const payoutListQuery = z.object({
  filter: z.enum(['all', 'owed', 'owing']).default('all'),
  pageSize,
  q: search,
  page,
});
const payoutSchema = z.object({
  amountCents: z.number().int().positive(),
  method: z.enum(['eft', 'cash', 'other']),
  reference: z.string().trim().min(3).max(60),
  note: z.string().max(200).optional(),
});
const adjustmentSchema = z.object({
  amountCents: z.number().int().min(-10000000).max(10000000).refine((value) => value !== 0),
  note: z.string().trim().min(3).max(200),
});
function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
const payoutExportQuery = z.object({
  from: z.string().max(40).refine(isIsoDate, 'Enter a valid ISO date').optional(),
  to: z.string().max(40).refine(isIsoDate, 'Enter a valid ISO date').optional(),
});
const assignSchema = z.object({ providerId: z.number().int().positive() });
const adminCancelSchema = z.object({
  reason: z.string().trim().min(3, 'Give a short reason').max(200),
});
const markPaidSchema = z.object({
  method: z.enum(['cash', 'eft']),
  receivedBy: z.enum(['provider', 'platform']),
  note: z.string().trim().min(3).max(200),
});

const suspendSchema = z.object({
  reason: z.string().trim().min(3).max(200),
});

const deleteSchema = z.object({
  confirm: z.literal('DELETE'),
  reason: z.string().trim().min(3).max(200),
});

const auditQuery = z.object({
  actorType: z.enum(['user', 'admin', 'system', 'anonymous']).optional(),
  actorId: z.string().max(40).optional(),
  action: z.string().max(80).optional(),
  entity: z.string().max(40).optional(),
  entityId: z.string().max(40).optional(),
  requestId: z.string().max(64).optional(),
  pageSize,
  from: z.string().max(40).refine(isIsoDate, 'Enter a valid ISO date').optional(),
  to: z.string().max(40).refine(isIsoDate, 'Enter a valid ISO date').optional(),
  kind: z.enum(['all', 'events', 'api', 'denied']).default('all'),
  page,
});
const auditExportQuery = z.object({
  actorType: z.enum(['user', 'admin', 'system', 'anonymous']).optional(),
  actorId: z.string().max(40).optional(),
  action: z.string().max(80).optional(),
  entity: z.string().max(40).optional(),
  from: z.string().max(40).refine(isIsoDate, 'Enter a valid ISO date').optional(),
  to: z.string().max(40).refine(isIsoDate, 'Enter a valid ISO date').optional(),
  kind: z.enum(['all', 'events', 'api', 'denied']).default('all'),
});
const revenueRangeQuery = z.object({
  from: z.string().max(40).refine(isIsoDate, 'Enter a valid ISO date').optional(),
  to: z.string().max(40).refine(isIsoDate, 'Enter a valid ISO date').optional(),
});
const revenueTransactionsQuery = revenueRangeQuery.extend({
  type: z.enum(['all', 'ride_payment', 'registration_fee', 'driver_plus', 'payout', 'adjustment']).default('all'),
  q: z.string().trim().max(80).optional(),
  pageSize,
  page,
});

const rejectSchema = z.object({
  reason: z.string().trim().min(3, 'Give a short reason').max(200),
});

const docReviewSchema = z
  .object({
    status: z.enum(['approved', 'rejected']),
    note: z.string().trim().max(300).nullish(),
  })
  .refine((v) => v.status !== 'rejected' || (v.note && v.note.length >= 3), {
    message: 'Tell the provider what is wrong with this document',
    path: ['note'],
  });

const cents = z.number().int().min(0).max(1000000);
const serviceSchema = z
  .object({
    name: z.string().trim().min(2).max(40).optional(),
    basePriceCents: cents.optional(),
    perKmCents: cents.optional(),
    minDistanceFeeCents: cents.optional(),
    active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

const settingsSchema = z.object({
  values: z.record(z.string().max(80), z.union([z.string().max(500), z.number(), z.boolean()])),
});
const pricingChallengeSchema = z.object({
  password: z.string().min(1).max(200),
}).strict();
const pricingVerifySchema = z.object({
  challengeId: z.string().uuid(),
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
}).strict();
const pricingApplySchema = z.object({
  challengeId: z.string().uuid(),
  changes: z.record(z.string().max(80), z.union([z.number(), z.boolean()])), 
}).strict();

function pricingLimiter(windowMs, limit, message) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `admin:${req.admin.id}`,
    handler: (req, res, next) => next(new ApiError('ZD-ADM-008', { message })),
  });
}

const pricingChallengeLimiter = pricingLimiter(
  10 * 60 * 1000,
  3,
  'Too many pricing challenges. Try again later.'
);
const pricingVerifyLimiter = pricingLimiter(
  15 * 60 * 1000,
  5,
  'Too many pricing verification attempts. Try again later.'
);

// Public: admin login (rate limited). Everything below requires a valid admin token.
router.post('/auth/login', adminLoginLimiter, validate(loginSchema), wrap(authCtl.login));

router.use(adminAuth, adminWriteLimiter);

// Note: when a route uses two validate() calls, read ids from req.params and the body from req.body;
// req.validated only holds the result of the LAST validate() call (used for query strings).
router.get('/auth/me', wrap(authCtl.me));
router.get('/overview', wrap(overview.getOverview));

router.get('/revenue/export', validate(revenueRangeQuery, 'query'), wrap(adminRevenue.exportCsv));
router.get('/revenue/reconcile', wrap(adminRevenue.reconcile));
router.get('/revenue/summary', validate(revenueRangeQuery, 'query'), wrap(adminRevenue.summary));
router.get('/revenue/daily', validate(revenueRangeQuery, 'query'), wrap(adminRevenue.daily));
router.get('/revenue/transactions', validate(revenueTransactionsQuery, 'query'), wrap(adminRevenue.transactions));

router.get('/providers', validate(providerListQuery, 'query'), wrap(providers.listProviders));
router.get('/providers/:userId', validate(userIdParams, 'params'), wrap(providers.getProvider));
router.post('/providers/:userId/approve', validate(userIdParams, 'params'), wrap(providers.approve));
router.post('/providers/:userId/reject', validate(userIdParams, 'params'), validate(rejectSchema), wrap(providers.reject));
router.post('/providers/:userId/waive-registration', validate(userIdParams, 'params'), wrap(providers.waiveRegistration));
router.post('/documents/:id/review', validate(idParams, 'params'), validate(docReviewSchema), wrap(providers.reviewDocument));

router.get('/users', validate(userListQuery, 'query'), wrap(users.listUsers));
router.post('/users/:userId/suspend', validate(userIdParams, 'params'), validate(suspendSchema), wrap(users.suspendUser));
router.post('/users/:userId/unsuspend', validate(userIdParams, 'params'), wrap(users.unsuspendUser));
router.post('/users/:userId/delete', validate(userIdParams, 'params'), validate(deleteSchema), wrap(async (req, res) => {
  const { publicIds } = await accountDeletion.deleteAccount({
    adminId: req.admin.id,
    userId: Number(req.params.userId),
    reason: req.body.reason,
  });
  await accountDeletion.cleanupDeletedAssets(publicIds);
  res.ok({ deleted: true });
}));

router.get('/services', wrap(services.listAll));
router.put('/services/:id', validate(idParams, 'params'), validate(serviceSchema), wrap(services.update));

router.get('/requests', validate(requestListQuery, 'query'), wrap(adminRequests.listRequests));
router.get('/requests/:id', validate(idParams, 'params'), wrap(adminRequests.getRequest));
router.post('/requests/:id/assign', validate(idParams, 'params'), validate(assignSchema), wrap(adminRequests.assign));
router.post('/requests/:id/cancel', validate(idParams, 'params'), validate(adminCancelSchema), wrap(adminRequests.cancel));
router.post('/requests/:id/mark-paid', validate(idParams, 'params'), validate(markPaidSchema), wrap(adminRequests.markPaid));
router.get('/requests/:id/timeline', validate(idParams, 'params'), wrap(async (req, res) => {
  const timeline = await requestTimeline.getTimeline(Number(req.params.id));
  res.ok(timeline);
}));

router.get('/audit/export', validate(auditExportQuery, 'query'), wrap(adminAudit.exportCsv));
router.get('/audit', validate(auditQuery, 'query'), wrap(adminAudit.list));

router.get('/payouts', validate(payoutListQuery, 'query'), wrap(adminPayouts.list));
router.get('/payouts/export', validate(payoutExportQuery, 'query'), wrap(adminPayouts.exportCsv));
router.get('/payouts/:providerId/bank-details', validate(providerIdParams, 'params'), wrap(adminPayouts.revealBank));
router.get('/payouts/:providerId', validate(providerIdParams, 'params'), wrap(adminPayouts.detail));
router.post('/payouts/:providerId', validate(providerIdParams, 'params'), validate(payoutSchema), wrap(adminPayouts.createPayout));
router.post('/payouts/:providerId/adjustment', validate(providerIdParams, 'params'), validate(adjustmentSchema), wrap(adminPayouts.createAdjustment));

router.get('/settings', wrap(settings.getSettings));
router.put('/settings', validate(settingsSchema), wrap(settings.updateSettings));

router.get('/pricing', wrap(adminPricing.getPricing));
router.post(
  '/pricing/challenge',
  pricingChallengeLimiter,
  validate(pricingChallengeSchema),
  wrap(adminPricing.createChallenge)
);
router.post(
  '/pricing/verify',
  pricingVerifyLimiter,
  validate(pricingVerifySchema),
  wrap(adminPricing.verifyChallenge)
);
router.post(
  '/pricing/apply',
  validate(pricingApplySchema),
  wrap(adminPricing.applyChanges)
);

module.exports = router;
