const express = require('express');
const { z } = require('zod');
const auth = require('../../middleware/auth');
const requireRole = require('../../middleware/requireRole');
const validate = require('../../middleware/validate');
const wrap = require('../../lib/asyncHandler');
const controller = require('./ratings.controller');

const router = express.Router();
const idParams = z.object({ id: z.coerce.number().int().positive() });
const rateSchema = z.object({
  stars: z.number().int().min(1).max(5),
  comment: z.string().trim().max(300).optional(),
});

router.use(auth);
router.post('/:id/rate', requireRole('driver', 'provider'), validate(idParams, 'params'),
  validate(rateSchema), wrap(controller.rate));

module.exports = router;
