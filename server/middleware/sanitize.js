/** Strip prototype-pollution keys from JSON bodies. SQL injection is prevented by parameterised queries. */
const clean = (value, key = '') => {
  if (Array.isArray(value)) return value.map((v) => clean(v, key));
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') delete value[k];
      else value[k] = clean(value[k], k);
    }
  }
  // Passwords are kept verbatim
  if (typeof value === 'string') return /password/i.test(key) ? value : value.trim();
  return value;
};

export const sanitizeBody = (req, res, next) => {
  if (req.body && typeof req.body === 'object') req.body = clean(req.body);
  next();
};
