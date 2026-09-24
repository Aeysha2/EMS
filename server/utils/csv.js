/** Lecteur CSV minimal (séparateur ; ou , détecté, guillemets gérés, BOM ignoré). */
export const parseCsv = (text) => {
  const src = String(text || '').replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] || '';
  const sep = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i += 1; } else if (c === '"') inQuotes = false; else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === sep) { row.push(field.trim()); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i += 1;
      row.push(field.trim()); field = '';
      if (row.some((v) => v !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field.trim());
  if (row.some((v) => v !== '')) rows.push(row);
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''));
  return rows.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])));
};

export const toNumber = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/\s| | /g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};
