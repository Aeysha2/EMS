import crypto from 'node:crypto';

/**
 * Chiffrement des données sensibles au repos (NIN, secrets 2FA) : AES-256-GCM.
 * DATA_ENCRYPTION_KEY = 32 octets en base64 (openssl rand -base64 32).
 * En développement, si la clé est absente, une clé est dérivée de JWT_SECRET (avec avertissement).
 */
let cachedKey;
const key = () => {
  if (cachedKey) return cachedKey;
  if (process.env.DATA_ENCRYPTION_KEY) {
    cachedKey = Buffer.from(process.env.DATA_ENCRYPTION_KEY, 'base64');
    if (cachedKey.length !== 32) throw new Error('DATA_ENCRYPTION_KEY doit faire 32 octets (base64)');
  } else {
    if (process.env.NODE_ENV === 'production') throw new Error('DATA_ENCRYPTION_KEY est obligatoire en production');
    cachedKey = crypto.createHash('sha256').update(`${process.env.JWT_SECRET}:data`).digest();
  }
  return cachedKey;
};

export const encrypt = (plain) => {
  if (plain === null || plain === undefined || plain === '') return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), enc.toString('base64')].join(':');
};

export const decrypt = (payload) => {
  if (!payload) return null;
  const [, iv, tag, data] = payload.split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
};

/** Empreinte déterministe (HMAC) : permet de rechercher / dédoublonner sans stocker la valeur en clair. */
export const blindIndex = (value) => {
  if (!value) return null;
  const normalized = String(value).replace(/\s+/g, '').toUpperCase();
  return crypto.createHmac('sha256', key()).update(`idx:${normalized}`).digest('hex');
};

export const mask = (value, visible = 4) =>
  value ? `${'•'.repeat(Math.max(0, value.length - visible))}${value.slice(-visible)}` : null;

export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

export const randomToken = (bytes = 24) => crypto.randomBytes(bytes).toString('base64url');

// ---------------------------------------------------------------- TOTP (RFC 6238), compatible Google Authenticator

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const base32Encode = (buf) => {
  let bits = 0; let value = 0; let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
};

const base32Decode = (str) => {
  let bits = 0; let value = 0; const out = [];
  for (const c of str.replace(/=+$/, '').toUpperCase()) {
    const idx = B32.indexOf(c);
    if (idx < 0) continue;
    value = (value << 5) | idx; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
};

export const generateTotpSecret = () => base32Encode(crypto.randomBytes(20));

export const totpCode = (secret, time = Date.now(), step = 30) => {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(time / 1000 / step)));
  const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, '0');
};

/** Vérifie un code en tolérant ±1 intervalle de 30 s (décalage d'horloge). */
export const verifyTotp = (secret, code) => {
  if (!/^\d{6}$/.test(String(code || ''))) return false;
  const now = Date.now();
  return [-1, 0, 1].some((w) => {
    const expected = totpCode(secret, now + w * 30_000);
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(code)));
  });
};

export const totpUri = (secret, account, issuer = 'SIGRH Sénégal') =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
