import pg from 'pg';

// Return DATE columns as plain 'YYYY-MM-DD' strings (avoids timezone shifts)
pg.types.setTypeParser(1082, (v) => v);
// Return NUMERIC as JS numbers (amounts stay well within double precision)
pg.types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
// COUNT(*) returns bigint
pg.types.setTypeParser(20, (v) => parseInt(v, 10));

const useSSL = process.env.DB_SSL === 'true';

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSSL ? { rejectUnauthorized: false } : undefined,
  max: Number(process.env.DB_POOL_MAX || 10),
});

export const query = (text, params) => pool.query(text, params);

/** Run `fn(client)` inside a transaction. */
export const withTransaction = async (fn) => {
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
};
