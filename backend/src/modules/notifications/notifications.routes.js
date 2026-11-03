const express = require('express');
const { z } = require('zod');
const auth = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const wrap = require('../../lib/asyncHandler');
const { perUserWriteLimiter } = require('../../middleware/rateLimit');
const controller = require('./notifications.controller');

const router = express.Router();
const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  unreadOnly: z.enum(['true', 'false']).optional().default('false').transform((value) => value === 'true'),
});
const idParams = z.object({ id: z.coerce.number().int().positive() });

router.use(auth, perUserWriteLimiter);
router.get('/', validate(listQuery, 'query'), wrap(controller.list));
router.post('/read-all', wrap(controller.markAllRead));
router.post('/:id/read', validate(idParams, 'params'), wrap(controller.markRead));

module.exports = router;
