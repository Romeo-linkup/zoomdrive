const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { env } = require('../src/config/env');
const { pool, query, withTransaction } = require('../src/db/pool');

async function main() {
  if (!env.DATABASE_URL) {
    console.log('[ZD][MIGRATE][FAIL] DATABASE_URL missing');
    process.exit(1);
  }

  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const migrationsDir = path.join(__dirname, '..', 'db', 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  let applied = 0;
  let skipped = 0;

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const content = fs.readFileSync(filePath, 'utf8');

    const trimmed = content.trim();
    if (!trimmed || /^--[\s\S]*$/.test(trimmed)) {
      console.log(`[ZD][MIGRATE][FAIL] ${file} is EMPTY`);
      await pool.end();
      process.exit(1);
    }

    const checksum = crypto.createHash('sha256').update(content).digest('hex');

    const existing = await query(
      'SELECT checksum FROM schema_migrations WHERE filename = $1',
      [file]
    );

    if (existing.rows.length > 0) {
      const existingChecksum = existing.rows[0].checksum;
      if (existingChecksum !== checksum) {
        console.log(`[ZD][MIGRATE][FAIL] ${file} CHECKSUM MISMATCH (file edited after it was applied)`);
        await pool.end();
        process.exit(1);
      }
      console.log(`${file} SKIPPED (already applied)`);
      skipped++;
      continue;
    }

    try {
      await withTransaction(async (client) => {
        await client.query(content);

        const tableRegex = /CREATE TABLE IF NOT EXISTS\s+(\w+)/gi;
        const tableMatches = [...content.matchAll(tableRegex)];
        const tableNames = tableMatches.map(m => m[1]);

        for (const tableName of tableNames) {
          const result = await client.query(
            "SELECT to_regclass('public.' || $1) AS exists",
            [tableName]
          );
          if (!result.rows[0].exists) {
            throw new Error(`Table ${tableName} not found after migration`);
          }
        }

        await client.query(
          'INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)',
          [file, checksum]
        );
      });

      const tableRegex = /CREATE TABLE IF NOT EXISTS\s+(\w+)/gi;
      const tableMatches = [...content.matchAll(tableRegex)];
      const tableCount = tableMatches.length;

      console.log(`${file} APPLIED (${tableCount} tables verified)`);
      applied++;
    } catch (err) {
      console.log(`[ZD][MIGRATE][FAIL] ${file} ${err.message}${err.position ? ` (position ${err.position})` : ''}`);
      await pool.end();
      process.exit(1);
    }
  }

  console.log(`[ZD][MIGRATE] done: ${applied} applied, ${skipped} skipped`);
  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('[ZD][MIGRATE][FAIL] Unexpected error:', err.message);
  process.exit(1);
});
