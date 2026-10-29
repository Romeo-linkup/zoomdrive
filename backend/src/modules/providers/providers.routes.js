const express = require('express');
const { z } = require('zod');
const auth = require('../../middleware/auth');
const requireRole = require('../../middleware/requireRole');
const requireApproved = require('../../middleware/requireApproved');
const validate = require('../../middleware/validate');
const { documentUpload } = require('../../middleware/upload');
const wrap = require('../../lib/asyncHandler');
const providers = require('./providers.controller');
const docs = require('./documents.controller');
const orgs = require('./organisations.controller');

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

router.use(auth, requireRole('provider'));

router.put('/me', validate(profileSchema), wrap(providers.upsertMe));
router.put('/me/organisation', validate(orgSchema), wrap(orgs.upsertOrganisation));
router.put('/me/services', validate(servicesSchema), wrap(providers.setServices));
router.get('/me/documents', wrap(docs.listDocuments));
router.post('/me/documents', documentUpload, validate(docSchema), wrap(docs.uploadDocument));
router.post('/me/submit', wrap(providers.submit));

// Phase 8 replaces these stubs. Until a provider is approved they answer ZD-PROV-005.
const stub = (req, res) => res.ok({ stub: true });
router.post('/me/online', wrap(requireApproved), stub);
router.post('/me/heartbeat', wrap(requireApproved), stub);
router.get('/me/offers', wrap(requireApproved), stub);

module.exports = router;