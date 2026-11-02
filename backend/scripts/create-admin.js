// Creates an admin account (or resets its password with --reset). Interactive: the password is never echoed or logged.
// Usage (from backend/):  node scripts/create-admin.js        or        node scripts/create-admin.js --reset
const readline = require('readline');
const bcrypt = require('bcryptjs');
const { env } = require('../src/config/env');
const { pool } = require('../src/db/pool');

const MIN_PASSWORD = 12;

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

// Reads a line from the terminal without echoing the characters.
function askHidden(prompt) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener('data', onData);
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (ch === '\u0003') {
          process.stdout.write('\n');
          process.exit(130);
        }
        if (ch === '\u007f' || ch === '\b') {
          value = value.slice(0, -1);
          continue;
        }
        value += ch;
      }
    };
    stdin.on('data', onData);
  });
}

async function main() {
  if (!process.stdin.isTTY) {
    console.error('[ZD][ADMIN][FAIL] Run this in an interactive terminal.');
    process.exit(1);
  }
  if (!env.DATABASE_URL) {
    console.error('[ZD][ADMIN][FAIL] DATABASE_URL missing');
    process.exit(1);
  }

  const reset = process.argv.includes('--reset');
  const email = (await ask('Admin email: ')).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) {
    console.error('[ZD][ADMIN][FAIL] That does not look like an email address.');
    process.exit(1);
  }

  const existing = await pool.query('SELECT id FROM admin_users WHERE email = $1', [email]);
  if (existing.rows[0] && !reset) {
    console.error('[ZD][ADMIN][FAIL] That admin already exists. Run with --reset to change its password.');
    process.exit(1);
  }
  if (!existing.rows[0] && reset) {
    console.error('[ZD][ADMIN][FAIL] No admin with that email. Run without --reset to create one.');
    process.exit(1);
  }

  const name = existing.rows[0] ? null : ((await ask('Display name: ')).trim() || email);

  const password = await askHidden(`Password (at least ${MIN_PASSWORD} characters): `);
  if (password.length < MIN_PASSWORD) {
    console.error(`[ZD][ADMIN][FAIL] Password must be at least ${MIN_PASSWORD} characters.`);
    process.exit(1);
  }
  const again = await askHidden('Repeat password: ');
  if (again !== password) {
    console.error('[ZD][ADMIN][FAIL] The two passwords do not match.');
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 12);
  let id;
  if (existing.rows[0]) {
    id = existing.rows[0].id;
    await pool.query('UPDATE admin_users SET password_hash = $1 WHERE id = $2', [hash, id]);
  } else {
    const inserted = await pool.query(
      'INSERT INTO admin_users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id',
      [email, hash, name]
    );
    id = inserted.rows[0].id;
  }
  await pool.query(
    "INSERT INTO audit_log (actor_type, action, entity, entity_id, meta) VALUES ('system', $1, 'admin_users', $2, '{}'::jsonb)",
    [reset ? 'admin.password_reset' : 'admin.create', id]
  );
  console.log(`[ZD][ADMIN] ${reset ? 'Password updated for' : 'Admin created:'} ${email}`);
}

main()
  .catch((err) => {
    console.error('[ZD][ADMIN][FAIL] ' + (err && err.message ? err.message : 'unexpected error'));
    process.exitCode = 1;
  })
  .finally(() => pool.end());
