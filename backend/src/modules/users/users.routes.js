const express = require('express');
const auth = require('../../middleware/auth');
const { photoUpload } = require('../../middleware/upload');
const { perUserWriteLimiter, uploadLimiter } = require('../../middleware/rateLimit');
const wrap = require('../../lib/asyncHandler');
const users = require('./users.controller');

const router = express.Router();

router.use(auth, perUserWriteLimiter);

router.post('/me/photo', uploadLimiter, photoUpload, wrap(users.uploadPhoto));

module.exports = router;