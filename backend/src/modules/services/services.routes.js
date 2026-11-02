const express = require('express');
const wrap = require('../../lib/asyncHandler');
const { listServices } = require('./services.controller');

const router = express.Router();

router.get('/', wrap(listServices));

module.exports = router;