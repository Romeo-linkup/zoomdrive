const express = require('express');
const { env, validateEnv } = require('../../config/env');
const { checkDb, query } = require('../../db/pool');
const fs = require('fs');
const path = require('path');

const router = express.Router();

router.get('/', async (req, res) => {
  let dbStatus = 'down';
  let applied = 0;
  let pending = 0;

  const dbCheck = await Promise.race([
    checkDb(),
    new Promise((resolve) => setTimeout(() => resolve({ ok: false, reason: 'timeout' }), 3000)),
  ]);

  if (dbCheck.ok) {
    dbStatus = 'up';
    try {
      const migrationResult = await query('SELECT COUNT(*) as count FROM schema_migrations');
      applied = parseInt(migrationResult.rows[0].count, 10);
    } catch (err) {
      applied = 0;
    }

    const migrationsDir = path.join(__dirname, '..', '..', '..', 'db', 'migrations');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();
    pending = migrationFiles.length - applied;
  }

  res.ok({
    status: 'ok',
    version: env.APP_VERSION,
    env: env.NODE_ENV,
    uptimeSeconds: Math.round(process.uptime()),
    db: dbStatus,
    migrations: { applied, pending },
    missingEnv: validateEnv().map(p => p.name),
  });
});

module.exports = router;
