const fs = require('fs');
const path = require('path');

const { env } = require('../src/config/env');
const { pool, query, withTransaction } = require('../src/db/pool');

async function main() {
  if (!env.DATABASE_URL) {
    console.log('[ZD][SEED][FAIL] DATABASE_URL missing');
    process.exit(1);
  }

  const migrationsDir = path.join(__dirname, '..', 'db', 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  const appliedMigrations = await query(
    'SELECT filename FROM schema_migrations ORDER BY filename'
  );

  const appliedSet = new Set(appliedMigrations.rows.map(r => r.filename));

  for (const file of files) {
    if (!appliedSet.has(file)) {
      console.log('[ZD][SEED][FAIL] migrations pending. Run: npm run migrate');
      await pool.end();
      process.exit(1);
    }
  }

  const servicesSql = fs.readFileSync(
    path.join(__dirname, '..', 'db', 'seed', 'services.sql'),
    'utf8'
  );

  const settingsSql = fs.readFileSync(
    path.join(__dirname, '..', 'db', 'seed', 'settings.sql'),
    'utf8'
  );

  await withTransaction(async (client) => {
    await client.query(servicesSql);
    await client.query(settingsSql);
  });

  const servicesResult = await query('SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE active = true) as active FROM services');
  const servicesTotal = servicesResult.rows[0].total;
  const servicesActive = servicesResult.rows[0].active;

  const settingsResult = await query('SELECT COUNT(*) as count FROM app_settings');
  const settingsCount = settingsResult.rows[0].count;

  console.log(`services: ${servicesTotal} total, ${servicesActive} active`);
  console.log(`app_settings: ${settingsCount} rows`);

  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('[ZD][SEED][FAIL] Unexpected error:', err.message);
  process.exit(1);
});
