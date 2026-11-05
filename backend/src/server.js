const { env, validateEnv } = require('./config/env');
const { logger } = require('./lib/logger');
const { checkDb, query } = require('./db/pool');
const { startExpiryJob } = require('./modules/dispatch/expiry.job');
const { startEmailDispatchJob } = require('./modules/notifications/emailDispatch.job');
const paystack = require('./modules/payments/paystack.service');
const fs = require('fs');
const path = require('path');
const app = require('./app');

async function boot() {
  const problems = validateEnv();
  if (problems.length > 0) {
    for (const p of problems) {
      console.log(`[ZD][BOOT][FAIL] env: ${p.name} ${p.problem}`);
    }
    process.exit(1);
  }

  console.log('[ZD][BOOT] env ........ OK');
  if (env.NODE_ENV === 'production' && env.OTP_DRIVER === 'console') {
    console.warn('[ZD][BOOT][WARN] OTP codes are written to the server logs. Private testing only.');
  }
  console.log(paystack.isConfigured()
    ? '[ZD][BOOT] paystack .. OK'
    : '[ZD][BOOT] paystack .. NOT CONFIGURED (ok until keys are set)');

  const dbCheck = await checkDb();
  if (dbCheck.ok) {
    console.log(`[ZD][BOOT] database ... OK (latency ${dbCheck.latencyMs}ms)`);
  } else {
    console.log(`[ZD][BOOT][FAIL] database: ${dbCheck.reason}`);
    process.exit(1);
  }

  let migrationApplied = 0;
  let migrationPending = 0;
  try {
    const migrationResult = await query('SELECT COUNT(*) as count FROM schema_migrations');
    migrationApplied = parseInt(migrationResult.rows[0].count, 10);
  } catch (err) {
    migrationApplied = 0;
  }

  const migrationsDir = path.join(__dirname, '..', 'db', 'migrations');
  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();
  migrationPending = migrationFiles.length - migrationApplied;

  if (migrationPending === 0) {
    console.log(`[ZD][BOOT] migrations . OK (${migrationApplied} applied, 0 pending)`);
  } else {
    console.log(`[ZD][BOOT][FAIL] migrations: ${migrationPending} pending. Run: npm run migrate`);
    process.exit(1);
  }

  try {
    const { ping } = require('./modules/uploads/cloudinary.service');
    await ping();
    console.log('[ZD][BOOT] cloudinary . OK');
  } catch (err) {
    const shortReason = (err && err.message) ? String(err.message).split('\n')[0].substring(0, 80) : 'unknown error';
    console.log(`[ZD][BOOT] cloudinary . WARN ${shortReason}`);
  }

  const server = app.listen(env.PORT, () => {
    startExpiryJob();
    console.log('[ZD][BOOT] expiry job . started (30s)');
    startEmailDispatchJob();
    console.log('[ZD][BOOT] email dispatch job . started (30s)');
    console.log(`[ZD][BOOT] listening on :${env.PORT}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`[ZD][BOOT][PORT_IN_USE] ${env.PORT} busy. Run: npx kill-port ${env.PORT}`);
      process.exit(1);
    } else {
      logger.error({
        reqId: '-',
        module: 'server',
        message: err.message,
        meta: { code: err.code },
      });
      process.exit(1);
    }
  });
}

boot().catch((err) => {
  console.error('[ZD][BOOT][FAIL] Unexpected error:', err.message);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  logger.error({
    reqId: '-',
    module: 'server',
    message: err.message,
    meta: { stack: err.stack },
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error({
    reqId: '-',
    module: 'server',
    message: 'Unhandled rejection',
    meta: { reasonType: typeof reason },
  });
});
