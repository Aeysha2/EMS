import 'dotenv/config';
import { pool } from '../config/db.js';
import { migrate } from './migrate.js';

migrate()
  .then(() => console.log('✅ Schéma à jour'))
  .catch((err) => { console.error('❌ Migration échouée :', err.message); process.exitCode = 1; })
  .finally(() => pool.end());
