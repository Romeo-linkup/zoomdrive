const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { env } = require('../src/config/env');
const { pool, query } = require('../src/db/pool');

async function main() {
  if (!env.DATABASE_URL) {
    console.log('[ZD][SCHEMA-AUDIT][FAIL] DATABASE_URL missing');
    process.exit(1);
  }

  const migrationsDir = path.join(__dirname, '..', 'db', 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  const expectedTables = {};

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const content = fs.readFileSync(filePath, 'utf8');

    const tableRegex = /CREATE TABLE IF NOT EXISTS\s+(\w+)\s*\(([\s\S]*?)\);/gi;
    const tableMatches = [...content.matchAll(tableRegex)];

    for (const match of tableMatches) {
      const tableName = match[1];
      const columnsBlock = match[2];
      const columns = new Set();

      const lines = columnsBlock.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('PRIMARY') || trimmed.startsWith('UNIQUE') ||
            trimmed.startsWith('CONSTRAINT') || trimmed.startsWith('FOREIGN') ||
            trimmed.startsWith('CHECK') || trimmed.startsWith(')')) {
          continue;
        }
        const firstWord = trimmed.split(/\s+/)[0];
        if (firstWord) {
          columns.add(firstWord);
        }
      }

      expectedTables[tableName] = columns;
    }

    const alterRegex = /ALTER TABLE\s+(\w+)\s+ADD COLUMN(?:\s+IF NOT EXISTS)?\s+(\w+)/gi;
    const alterMatches = [...content.matchAll(alterRegex)];

    for (const match of alterMatches) {
      const tableName = match[1];
      const columnName = match[2];
      if (!expectedTables[tableName]) {
        expectedTables[tableName] = new Set();
      }
      expectedTables[tableName].add(columnName);
    }
  }

  const liveColumns = await query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, column_name
  `);

  const liveTables = {};
  for (const row of liveColumns.rows) {
    const tableName = row.table_name;
    const columnName = row.column_name;
    if (!liveTables[tableName]) {
      liveTables[tableName] = new Set();
    }
    liveTables[tableName].add(columnName);
  }

  let hasIssues = false;

  for (const tableName of Object.keys(expectedTables)) {
    if (!liveTables[tableName]) {
      console.log(`MISSING TABLE ${tableName}`);
      hasIssues = true;
    } else {
      for (const column of expectedTables[tableName]) {
        if (!liveTables[tableName].has(column)) {
          console.log(`MISSING COLUMN ${tableName}.${column}`);
          hasIssues = true;
        }
      }
    }
  }

  for (const tableName of Object.keys(liveTables)) {
    if (tableName === 'schema_migrations') continue;
    if (!expectedTables[tableName]) {
      console.log(`EXTRA TABLE ${tableName}`);
      hasIssues = true;
    } else {
      for (const column of liveTables[tableName]) {
        if (!expectedTables[tableName].has(column)) {
          console.log(`EXTRA COLUMN ${tableName}.${column}`);
          hasIssues = true;
        }
      }
    }
  }

  const appliedMigrations = await query(
    'SELECT filename, checksum FROM schema_migrations ORDER BY filename'
  );

  const appliedMap = new Map();
  for (const row of appliedMigrations.rows) {
    appliedMap.set(row.filename, row.checksum);
  }

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const checksum = crypto.createHash('sha256').update(content).digest('hex');

    if (appliedMap.has(file)) {
      const appliedChecksum = appliedMap.get(file);
      if (appliedChecksum !== checksum) {
        console.log(`CHECKSUM DRIFT ${file}`);
        hasIssues = true;
      }
    } else {
      console.log(`UNAPPLIED ${file}`);
      hasIssues = true;
    }
  }

  await pool.end();

  if (hasIssues) {
    process.exit(1);
  }

  const tableCount = Object.keys(expectedTables).length;
  console.log(`SCHEMA AUDIT PASSED (${tableCount} tables)`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[ZD][SCHEMA-AUDIT][FAIL] Unexpected error:', err.message);
  process.exit(1);
});
