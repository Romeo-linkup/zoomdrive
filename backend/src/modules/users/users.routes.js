const express = require('express');
const auth = require('../../middleware/auth');
const { photoUpload } = require('../../middleware/upload');
const wrap = require('../../lib/asyncHandler');
const users = require('./users.controller');

const router = express.Router();

router.post('/me/photo', auth, photoUpload, wrap(users.uploadPhoto));

module.exports = router;