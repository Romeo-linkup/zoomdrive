const express = require('express');
const { z } = require('zod');
const auth = require('../../middleware/auth');
const requireRole = require('../../middleware/requireRole');
const validate = require('../../middleware/validate');
const wrap = require('../../lib/asyncHandler');
const driver = require('./drivers.controller');
const places = require('./savedPlaces.controller');

const router = express.Router();

const optText = (max) => z.string().trim().max(max).nullish().transform((v) => v || null);
const optEmail = z.string().trim().max(120).nullish()
  .refine((v) => !v || z.string().email().safeParse(v).success, 'Enter a valid email address')
  .transform((v) => v || null);

const profileSchema = z.object({
  firstName: z.string().trim().min(1, 'Enter your first name').max(60),
  lastName: z.string().trim().min(1, 'Enter your surname').max(60),
  email: optEmail,
  vehicleMake: optText(40),
  vehicleModel: optText(40),
  vehicleColour: optText(30),
  plate: optText(15),
  hailPlatform: z.enum(['uber', 'bolt', 'indrive', 'other']).nullish().transform((v) => v ?? null),
  consent: z.boolean().optional(),
});

const placeSchema = z.object({
  label: z.string().trim().min(1, 'Give this place a name').max(40),
  address: z.string().trim().min(1, 'Enter an address').max(200),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const idParams = z.object({ id: z.coerce.number().int().positive() });

router.use(auth, requireRole('driver'));

router.put('/me', validate(profileSchema), wrap(driver.upsertMe));
router.get('/me/saved-places', wrap(places.list));
router.post('/me/saved-places', validate(placeSchema), wrap(places.create));
router.delete('/me/saved-places/:id', validate(idParams, 'params'), wrap(places.remove));

module.exports = router;