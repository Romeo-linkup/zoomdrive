const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { env } = require('./config/env');
const requestId = require('./middleware/requestId');
const apiAudit = require('./middleware/apiAudit');
const { globalWriteLimiter } = require('./middleware/rateLimit');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.set('trust proxy', env.TRUST_PROXY_HOPS);

app.use(requestId);

app.use(helmet());

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }
    if (env.FRONTEND_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({
  limit: '1mb',
  verify: (req, res, buf) => {
    if (req.originalUrl.startsWith('/api/v1/payments/paystack/webhook')) {
      req.rawBody = buf;
    }
  },
}));

app.use(apiAudit);
app.use(globalWriteLimiter);

// later modules mount here, one line each
app.use('/api/v1/health', require('./modules/health/health.routes'));
app.use('/api/v1/auth', require('./modules/auth/auth.routes'));
app.use('/api/v1/users', require('./modules/users/users.routes'));
app.use('/api/v1/drivers', require('./modules/drivers/drivers.routes'));
app.use('/api/v1/providers', require('./modules/providers/providers.routes'));
app.use('/api/v1/requests', require('./modules/requests/requests.routes'));
app.use('/api/v1/requests', require('./modules/ratings/ratings.routes'));
app.use('/api/v1/notifications', require('./modules/notifications/notifications.routes'));
app.use('/api/v1/services', require('./modules/services/services.routes'));
app.use('/api/v1/payments', require('./modules/payments/payments.routes'));
app.use('/api/v1/admin', require('./modules/admin/admin.routes'));

app.use(notFound);
app.use(errorHandler);

module.exports = app;
