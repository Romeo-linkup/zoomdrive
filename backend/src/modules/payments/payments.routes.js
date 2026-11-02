const express = require('express');
const { z } = require('zod');
const auth = require('../../middleware/auth');
const requireRole = require('../../middleware/requireRole');
const validate = require('../../middleware/validate');
const wrap = require('../../lib/asyncHandler');
const payments = require('./payments.controller');

const router = express.Router();

router.post('/paystack/webhook', wrap(payments.paystackWebhook));

router.use(auth);

const requestParams = z.object({ requestId: z.coerce.number().int().positive() });

router.post('/:requestId/pay', requireRole('driver'), validate(requestParams, 'params'), wrap(payments.startRidePayment));
router.post('/:requestId/verify', requireRole('driver'), validate(requestParams, 'params'), wrap(payments.verifyRidePayment));

module.exports = router;