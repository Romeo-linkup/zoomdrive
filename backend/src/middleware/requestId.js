const crypto = require('crypto');
const { logger } = require('../lib/logger');

function requestId(req, res, next) {
  const headerId = req.get('x-request-id');
  const idPattern = /^[A-Za-z0-9-]{6,64}$/;

  if (headerId && idPattern.test(headerId)) {
    req.id = headerId;
  } else {
    req.id = crypto.randomBytes(4).toString('hex');
  }

  res.setHeader('X-Request-Id', req.id);

  const startTime = Date.now();

  res.ok = (data, status = 200) => {
    res.status(status).json({ ok: true, data, requestId: req.id });
  };

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.info({
      reqId: req.id,
      module: 'http',
      message: `${req.method} ${req.path} ${res.statusCode} ${duration}ms`,
    });
  });

  next();
}

module.exports = requestId;
