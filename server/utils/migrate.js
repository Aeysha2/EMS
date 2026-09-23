import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../config/db.js';

const dir = path.dirname(fileURLToPath(import.meta.url));

/** Apply db/schema.sql (idempotent). */
export const migrate = async () => {
  const sql = fs.readFileSync(path.join(dir, '..', 'db', 'schema.sql'), 'utf8');
  await pool.query(sql);
};
