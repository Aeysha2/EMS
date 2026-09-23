/** Thin fetch wrapper around the EMS REST API. */
const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '') + '/api';
const TOKEN_KEY = 'ems_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

const request = async (method, path, body, { raw = false } = {}) => {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(`${BASE}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError('Serveur injoignable. Vérifiez votre connexion.', 0);
  }

  if (res.status === 401 && token) {
    setToken(null);
    window.dispatchEvent(new Event('ems:logout'));
  }
  if (!res.ok) {
    let message = `Erreur ${res.status}`;
    try { message = (await res.json()).message || message; } catch { /* not json */ }
    throw new ApiError(message, res.status);
  }
  if (raw) return res;
  return res.status === 204 ? null : res.json();
};

/** Build a query string, skipping empty values. */
export const qs = (params = {}) => {
  const s = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  ).toString();
  return s ? `?${s}` : '';
};

/** Download a binary endpoint (PDF…) as a file. */
export const download = async (path, fallbackName = 'document.pdf') => {
  const res = await request('GET', path, undefined, { raw: true });
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="?([^"]+)"?/);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = match ? decodeURIComponent(match[1]) : fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const api = {
  get: (p) => request('GET', p),
  post: (p, b = {}) => request('POST', p, b),
  put: (p, b = {}) => request('PUT', p, b),
  patch: (p, b = {}) => request('PATCH', p, b),
  del: (p) => request('DELETE', p),
};

export default api;
