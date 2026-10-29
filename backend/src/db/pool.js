const { Pool } = require('pg');
require('pg').types.setTypeParser(20, (v) => Number(v));
const { env } = require('../config/env');
const { logger } = require('../lib/logger');
const ApiError = require('../lib/ApiError');

const connectionString = env.DATABASE_URL;

const isLocalhost = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

const pool = new Pool({
  connectionString,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: isLocalhost ? false : { rejectUnauthorized: true },
});

pool.on('error', (err) => {
  logger.error({
    reqId: '-',
    module: 'db',
    code: 'ZD-SYS-002',
    message: err.message,
    meta: { code: err.code },
  });
});

function query(text, params) {
  return pool.query(text, params);
}

async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function checkDb() {
  const startTime = Date.now();
  try {
    await pool.query('SELECT 1');
    const latencyMs = Date.now() - startTime;
    return { ok: true, latencyMs };
  } catch (err) {
    if (err.code === 'ECONNREFUSED') {
      return { ok: false, reason: 'connection refused' };
    }
    if (err.code === 'ENOTFOUND') {
      return { ok: false, reason: 'host not found' };
    }
    if (err.code === 'ETIMEDOUT') {
      return { ok: false, reason: 'timeout' };
    }
    if (err.code === 'ECONNRESET') {
      return { ok: false, reason: 'connection reset' };
    }
    if (err.code === '57P01') {
      return { ok: false, reason: 'admin shutdown' };
    }
    if (err.code && err.code.startsWith('08')) {
      return { ok: false, reason: 'connection error' };
    }
    return { ok: false, reason: 'unknown error' };
  }
}

function mapDbError(err) {
  const connectionCodes = ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', '57P01'];
  if (connectionCodes.includes(err.code) || (err.code && err.code.startsWith('08'))) {
    return new ApiError('ZD-SYS-002');
  }
  return err;
}

module.exports = { pool, query, withTransaction, checkDb, mapDbError };
