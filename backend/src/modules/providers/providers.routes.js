const express = require('express');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const auth = require('../../middleware/auth');
const requireRole = require('../../middleware/requireRole');
const requireApproved = require('../../middleware/requireApproved');
const validate = require('../../middleware/validate');
const ApiError = require('../../lib/ApiError');
const { documentUpload } = require('../../middleware/upload');
const wrap = require('../../lib/asyncHandler');
const providers = require('./providers.controller');
const docs = require('./documents.controller');
const orgs = require('./organisations.controller');
const jobs = require('./jobs.controller');
const registrationFee = require('./registrationFee.controller');
const earnings = require('./earnings.controller');
const bankDetails = require('./bankDetails.controller');

const router = express.Router();

const personName = (msg) => z.string().trim().min(1, msg).max(60);

const profileSchema = z.object({
  providerType: z.enum(['individual', 'company'], { message: 'Choose individual or company' }),
  firstName: personName('Enter your first name'),
  lastName: personName('Enter your surname'),
  vehicleDescription: z.string().trim().min(2, 'Describe your vehicle').max(120),
  plate: z.string().trim().min(2, 'Enter your number plate').max(15),
  baseLat: z.number().min(-90).max(90),
  baseLng: z.number().min(-180).max(180),
  serviceRadiusKm: z.number().int().min(1).max(100).default(25),
  consent: z.boolean().optional(),
});

const orgSchema = z.object({
  name: z.string().trim().min(2, 'Enter the company name').max(120),
  regNumber: z.string().trim().min(3, 'Enter the registration number').max(40),
});

const servicesSchema = z.object({
  serviceIds: z.array(z.number().int().positive()).max(10),
});

const docSchema = z.object({
  doc_type: z.enum(['id_document', 'drivers_licence', 'vehicle_insurance', 'company_registration'], {
    message: 'Choose a document type',
  }),
});

const onlineSchema = z.object({
  online: z.boolean(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
}).refine((value) => !value.online || (value.lat !== undefined && value.lng !== undefined), {
  message: 'Location is required to go online',
  path: ['lat'],
});
const heartbeatSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
const registrationVerifySchema = z.object({
  reference: z.string().trim().min(5).max(100),
});
const bankDetailsSchema = z.object({
  accountHolder: z.string().trim().min(2).max(80),
  bankName: z.string().trim().min(2).max(60),
  accountType: z.enum(['cheque', 'savings', 'transmission']),
  branchCode: z.string().regex(/^\d{6}$/, 'Enter a 6-digit branch code'),
  accountNumber: z.preprocess(
    (value) => typeof value === 'string' ? value.replace(/[ -]/g, '') : value,
    z.string().regex(/^\d{6,16}$/, 'Enter an account number with 6 to 16 digits')
  ),
});

const bankDetailsWriteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `provider:${req.user.id}`,
  handler: (req, res, next) => next(new ApiError('ZD-AUTH-003', {
    message: 'Too many bank detail changes. Try again later.',
  })),
});

router.use(auth, requireRole('provider'));

router.put('/me', validate(profileSchema), wrap(providers.upsertMe));
router.put('/me/organisation', validate(orgSchema), wrap(orgs.upsertOrganisation));
router.put('/me/services', validate(servicesSchema), wrap(providers.setServices));
router.get('/me/documents', wrap(docs.listDocuments));
router.post('/me/documents', documentUpload, validate(docSchema), wrap(docs.uploadDocument));
router.post('/me/submit', wrap(providers.submit));

router.get('/me/registration-fee', wrap(registrationFee.status));
router.post('/me/registration-fee/pay', wrap(registrationFee.pay));
router.post('/me/registration-fee/verify', validate(registrationVerifySchema), wrap(registrationFee.verify));
router.get('/me/earnings', wrap(earnings.earnings));
router.get('/me/bank-details', wrap(bankDetails.get));
router.put('/me/bank-details', bankDetailsWriteLimiter, validate(bankDetailsSchema), wrap(bankDetails.put));

router.post('/me/online', wrap(requireApproved), validate(onlineSchema), wrap(jobs.online));
router.post('/me/heartbeat', wrap(requireApproved), validate(heartbeatSchema), wrap(jobs.heartbeat));
router.get('/me/offers', wrap(requireApproved), wrap(jobs.offers));
router.get('/me/jobs', wrap(jobs.jobs));

module.exports = router;