/** Keep only whitelisted keys that are present on the body. */
export const pick = (obj, keys) =>
  Object.fromEntries(keys.filter((k) => obj?.[k] !== undefined).map((k) => [k, obj[k]]));

/** Build a parameterised "SET a=$1, b=$2" fragment from a column map. */
export const buildUpdate = (fields, startIndex = 1) => {
  const cols = Object.keys(fields);
  const set = cols.map((c, i) => `${c} = $${i + startIndex}`).join(', ');
  return { set, values: cols.map((c) => fields[c]), next: startIndex + cols.length };
};

export const toInt = (v, fallback = null) => {
  const n = Number.parseInt(v, 10);
  return Number.isNaN(n) ? fallback : n;
};

export const pagination = (q, maxLimit = 100) => {
  const page = Math.max(1, toInt(q.page, 1));
  const limit = Math.min(maxLimit, Math.max(1, toInt(q.limit, 20)));
  return { page, limit, offset: (page - 1) * limit };
};
