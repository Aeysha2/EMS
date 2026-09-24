import { pool, query } from '../config/db.js';
import { sha256 } from './crypto.js';

const GENESIS = '0'.repeat(64);

const rowHash = (prev, r) =>
  sha256([prev, r.user_id ?? '', r.action, r.entity ?? '', r.entity_id ?? '', r.details ?? '', r.ip ?? '', r.created_at].join('|'));

/**
 * Journal d'audit infalsifiable : chaque entrée contient l'empreinte SHA-256 de la précédente.
 * Modifier ou supprimer une ligne casse la chaîne, ce que verifyAuditChain détecte.
 * Un verrou consultatif sérialise les écritures pour garantir l'ordre de la chaîne. Ne lève jamais d'erreur.
 */
export const logActivity = async (userId, action, entity = null, entityId = null, details = null, ip = null) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(424242)');
    const { rows } = await client.query('SELECT hash FROM activity_logs ORDER BY id DESC LIMIT 1');
    const prev = rows[0]?.hash || GENESIS;
    const createdAt = new Date().toISOString();
    const entry = { user_id: userId ?? null, action, entity, entity_id: entityId, details, ip, created_at: createdAt };
    await client.query(
      `INSERT INTO activity_logs (user_id, action, entity, entity_id, details, ip, prev_hash, hash, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [entry.user_id, action, entity, entityId, details, ip, prev, rowHash(prev, entry), createdAt]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('audit log failed:', err.message);
  } finally {
    client.release();
  }
};

/** Recalcule toute la chaîne. Renvoie { valid, checked, brokenAt }. */
export const verifyAuditChain = async () => {
  const { rows } = await query(
    `SELECT id, user_id, action, entity, entity_id, details, ip, prev_hash, hash,
            to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at
       FROM activity_logs ORDER BY id`
  );
  let prev = GENESIS;
  for (const r of rows) {
    const ok = r.prev_hash === prev && r.hash === rowHash(prev, r);
    if (!ok) return { valid: false, checked: rows.length, brokenAt: r.id };
    prev = r.hash;
  }
  return { valid: true, checked: rows.length, brokenAt: null };
};
