const express = require('express');
const wrap = require('../../lib/asyncHandler');
const payments = require('./payments.controller');

const router = express.Router();

router.post('/paystack/webhook', wrap(payments.paystackWebhook));

module.exports = router;