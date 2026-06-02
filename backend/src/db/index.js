const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('Unexpected DB pool error:', err);
});

/**
 * Execute a query with optional params.
 * Returns rows array.
 */
async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (duration > 1000) {
    console.warn('Slow query detected', { text: text.slice(0, 80), duration });
  }
  return res;
}

/**
 * Get a client for transactions.
 */
async function getClient() {
  const client = await pool.connect();
  const origQuery = client.query.bind(client);
  const origRelease = client.release.bind(client);
  const timeout = setTimeout(() => {
    console.error('Client checked out for >10s — possible leak');
  }, 10000);
  client.release = () => { clearTimeout(timeout); origRelease(); };
  return client;
}

module.exports = { query, getClient, pool };
