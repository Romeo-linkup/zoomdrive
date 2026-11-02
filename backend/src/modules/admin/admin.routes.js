const express = require('express');
const { z } = require('zod');
const adminAuth = require('../../middleware/adminAuth');
const validate = require('../../middleware/validate');
const { adminLoginLimiter } = require('../../middleware/rateLimit');
const wrap = require('../../lib/asyncHandler');
const authCtl = require('./adminAuth.controller');
const overview = require('./adminOverview.controller');
const providers = require('./providersReview.controller');
const users = require('./adminUsers.controller');
const services = require('./adminServices.controller');
const settings = require('./adminSettings.controller');
const adminRequests = require('./adminRequests.controller');

const router = express.Router();

const page = z.coerce.number().int().min(1).default(1);
const search = z.string().trim().max(60).optional();

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(120),
  password: z.string().min(1, 'Enter your password').max(200),
});

const userIdParams = z.object({ userId: z.coerce.number().int().positive() });
const idParams = z.object({ id: z.coerce.number().int().positive() });

const providerListQuery = z.object({
  status: z.enum(['all', 'incomplete', 'pending', 'approved', 'rejected']).default('pending'),
  q: search,
  page,
});

const userListQuery = z.object({
  role: z.enum(['all', 'driver', 'provider']).default('all'),
  status: z.enum(['all', 'active', 'suspended']).default('all'),
  q: search,
  page,
});

const requestListQuery = z.object({
  status: z.enum(['all', 'searching', 'accepted', 'arrived', 'completed', 'cancelled', 'expired']).default('all'),
  q: search,
  page,
});
const assignSchema = z.object({ providerId: z.number().int().positive() });
const adminCancelSchema = z.object({
  reason: z.string().trim().min(3, 'Give a short reason').max(200),
});

const rejectSchema = z.object({
  reason: z.string().trim().min(3, 'Give a short reason').max(300),
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
  values: z.record(z.string(), z.union([z.string(), z.number()])),
});

// Public: admin login (rate limited). Everything below requires a valid admin token.
router.post('/auth/login', adminLoginLimiter, validate(loginSchema), wrap(authCtl.login));

router.use(adminAuth);

// Note: when a route uses two validate() calls, read ids from req.params and the body from req.body;
// req.validated only holds the result of the LAST validate() call (used for query strings).
router.get('/auth/me', wrap(authCtl.me));
router.get('/overview', wrap(overview.getOverview));

router.get('/providers', validate(providerListQuery, 'query'), wrap(providers.listProviders));
router.get('/providers/:userId', validate(userIdParams, 'params'), wrap(providers.getProvider));
router.post('/providers/:userId/approve', validate(userIdParams, 'params'), wrap(providers.approve));
router.post('/providers/:userId/reject', validate(userIdParams, 'params'), validate(rejectSchema), wrap(providers.reject));
router.post('/documents/:id/review', validate(idParams, 'params'), validate(docReviewSchema), wrap(providers.reviewDocument));

router.get('/users', validate(userListQuery, 'query'), wrap(users.listUsers));

router.get('/services', wrap(services.listAll));
router.put('/services/:id', validate(idParams, 'params'), validate(serviceSchema), wrap(services.update));

router.get('/requests', validate(requestListQuery, 'query'), wrap(adminRequests.listRequests));
router.get('/requests/:id', validate(idParams, 'params'), wrap(adminRequests.getRequest));
router.post('/requests/:id/assign', validate(idParams, 'params'), validate(assignSchema), wrap(adminRequests.assign));
router.post('/requests/:id/cancel', validate(idParams, 'params'), validate(adminCancelSchema), wrap(adminRequests.cancel));

router.get('/settings', wrap(settings.getSettings));
router.put('/settings', validate(settingsSchema), wrap(settings.updateSettings));

module.exports = router;
