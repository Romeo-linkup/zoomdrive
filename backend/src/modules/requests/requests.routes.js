const express = require('express');
const { z } = require('zod');
const auth = require('../../middleware/auth');
const requireRole = require('../../middleware/requireRole');
const requireApproved = require('../../middleware/requireApproved');
const validate = require('../../middleware/validate');
const wrap = require('../../lib/asyncHandler');
const ctl = require('./requests.controller');

const router = express.Router();

const lat = z.number().min(-90).max(90);
const lng = z.number().min(-180).max(180);
const optText = (max) => z.string().trim().max(max).nullish().transform((v) => v || null);

const quoteSchema = z.object({
  serviceId: z.number().int().positive(),
  lat,
  lng,
});

const createSchema = quoteSchema.extend({
  addressText: optText(200),
  notes: optText(300),
  // The total the driver saw. If the price changed since the quote the server answers ZD-REQ-008.
  expectedTotalCents: z.number().int().min(0).optional(),
});

const cancelSchema = z.object({ reason: optText(200) });
const idParams = z.object({ id: z.coerce.number().int().positive() });
const listQuery = z.object({ page: z.coerce.number().int().min(1).default(1) });

router.use(auth);

// Note: with two validate() calls, read the id from Number(req.params.id) and the body from req.body.
router.post('/quote', requireRole('driver'), validate(quoteSchema), wrap(ctl.quote));
router.post('/', requireRole('driver'), validate(createSchema), wrap(ctl.create));
router.get('/', requireRole('driver'), validate(listQuery, 'query'), wrap(ctl.listMine));

router.get('/:id', validate(idParams, 'params'), wrap(ctl.getOne));
router.post('/:id/cancel', validate(idParams, 'params'), validate(cancelSchema), wrap(ctl.cancel));

router.post('/:id/accept', requireRole('provider'), wrap(requireApproved), validate(idParams, 'params'), wrap(ctl.accept));
router.post('/:id/decline', requireRole('provider'), wrap(requireApproved), validate(idParams, 'params'), wrap(ctl.decline));
router.post('/:id/arrived', requireRole('provider'), validate(idParams, 'params'), wrap(ctl.arrived));
router.post('/:id/complete', requireRole('provider'), validate(idParams, 'params'), wrap(ctl.complete));

module.exports = router;
