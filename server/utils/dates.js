/** Local-date helpers working with 'YYYY-MM-DD' strings. */
export const toISODate = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const isValidISODate = (s) =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

export const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Count working days (Mon–Fri) between two ISO dates, inclusive. */
export const businessDaysBetween = (startIso, endIso) => {
  let count = 0;
  const d = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);
  while (d <= end) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) count += 1;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return count;
};

export const monthBounds = (year, month) => {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
  return { start, end };
};
