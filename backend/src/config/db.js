/**
 * PostgreSQL connection pool (Supabase-hosted Postgres).
 * All queries elsewhere in the app MUST go through this pool using
 * parameterized queries ($1, $2, ...) — never string-concatenated SQL.
 */
const { Pool } = require('pg');
const env = require('./env');

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  // A background/idle client failing should never crash the process silently unlogged.
  // eslint-disable-next-line no-console
  console.error('[db] Unexpected error on idle client', err);
});

/**
 * Run a query with parameter binding. Always use placeholders — never
 * interpolate user input into the SQL string.
 */
async function query(text, params = []) {
  return pool.query(text, params);
}

/**
 * Run a set of operations inside a single transaction.
 * `fn` receives a client and must use it (not the pool) for every query.
 */
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

module.exports = { pool, query, withTransaction };
