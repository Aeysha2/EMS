import { ChevronLeft, ChevronRight, Inbox, Loader2, X } from 'lucide-react';
import { useEffect } from 'react';

export const Badge = ({ map, value, children, tone }) => {
  const [label, t] = map ? map[value] || [value, 'muted'] : [children, tone || 'muted'];
  return <span className={`badge badge-${t}`}>{label}</span>;
};

export const Loader = ({ label = 'Chargement…' }) => (
  <div className="loader"><Loader2 className="spin" size={22} /> {label}</div>
);

export const ErrorBox = ({ error, onRetry }) => (
  <div className="alert alert-danger">
    {error?.message || 'Une erreur est survenue'}
    {onRetry && <button type="button" className="btn btn-sm" onClick={onRetry}>Réessayer</button>}
  </div>
);

export const Empty = ({ children = 'Aucun élément', icon: Icon = Inbox }) => (
  <div className="empty"><Icon size={32} /><p>{children}</p></div>
);

export const Modal = ({ title, onClose, children, footer, wide }) => {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fermer"><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
};

export const Field = ({ label, children, hint, full }) => (
  <label className={`field ${full ? 'field-full' : ''}`}>
    <span>{label}</span>
    {children}
    {hint && <small>{hint}</small>}
  </label>
);

export const StatCard = ({ icon: Icon, label, value, sub, tone = 'primary', onClick }) => (
  <div className={`stat-card tone-${tone} ${onClick ? 'clickable' : ''}`} onClick={onClick}>
    <div className="stat-icon"><Icon size={22} /></div>
    <div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  </div>
);

export const PageHeader = ({ title, subtitle, children }) => (
  <div className="page-header">
    <div>
      <h1>{title}</h1>
      {subtitle && <p className="muted">{subtitle}</p>}
    </div>
    {children && <div className="page-actions">{children}</div>}
  </div>
);

export const Pagination = ({ page, limit, total, onPage }) => {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (pages <= 1) return null;
  return (
    <div className="pagination">
      <button type="button" className="btn btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft size={16} /></button>
      <span>Page {page} / {pages} · {total} résultat(s)</span>
      <button type="button" className="btn btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}><ChevronRight size={16} /></button>
    </div>
  );
};

export const Tabs = ({ tabs, value, onChange }) => (
  <div className="tabs" role="tablist">
    {tabs.filter(Boolean).map((t) => (
      <button key={t.value} type="button" role="tab" aria-selected={value === t.value}
        className={`tab ${value === t.value ? 'active' : ''}`} onClick={() => onChange(t.value)}>
        {t.label}{t.count !== undefined && <span className="tab-count">{t.count}</span>}
      </button>
    ))}
  </div>
);

/** Horizontal bar chart (pure CSS). data: [{label, value, hint?}] */
export const BarChart = ({ data, format = (v) => v, tone = 'primary' }) => {
  const max = Math.max(1, ...data.map((d) => Number(d.value) || 0));
  if (!data.length) return <Empty>Aucune donnée</Empty>;
  return (
    <div className="bars">
      {data.map((d) => (
        <div className="bar-row" key={d.label} title={`${d.label} : ${format(d.value)}`}>
          <span className="bar-label">{d.label}</span>
          <div className="bar-track"><div className={`bar-fill tone-${d.tone || tone}`} style={{ width: `${(Number(d.value) / max) * 100}%` }} /></div>
          <span className="bar-value">{format(d.value)}</span>
        </div>
      ))}
    </div>
  );
};

/** Vertical column chart with optional second series. data: [{label, a, b}] */
export const ColumnChart = ({ data, series = [{ key: 'a', label: 'Valeur', tone: 'primary' }], height = 160 }) => {
  const max = Math.max(1, ...data.flatMap((d) => series.map((s) => Number(d[s.key]) || 0)));
  if (!data.length) return <Empty>Aucune donnée</Empty>;
  return (
    <div>
      <div className="columns" style={{ height }}>
        {data.map((d) => (
          <div className="col-group" key={d.label}>
            <div className="col-bars">
              {series.map((s) => (
                <div key={s.key} className={`col tone-${s.tone}`} style={{ height: `${((Number(d[s.key]) || 0) / max) * 100}%` }}
                  title={`${d.label} – ${s.label} : ${d[s.key]}`} />
              ))}
            </div>
            <span className="col-label">{d.label}</span>
          </div>
        ))}
      </div>
      {series.length > 1 && (
        <div className="legend">
          {series.map((s) => <span key={s.key}><i className={`dot tone-${s.tone}`} /> {s.label}</span>)}
        </div>
      )}
    </div>
  );
};

/** Donut chart (SVG). data: [{label, value, tone}] */
export const Donut = ({ data, size = 140, center }) => {
  const total = data.reduce((s, d) => s + Number(d.value || 0), 0);
  const r = 52;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="donut-wrap">
      <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label="Répartition">
        <circle cx="60" cy="60" r={r} className="donut-track" strokeWidth="14" fill="none" />
        {total > 0 && data.map((d) => {
          const len = (Number(d.value) / total) * c;
          const el = (
            <circle key={d.label} cx="60" cy="60" r={r} fill="none" strokeWidth="14"
              className={`donut-seg tone-${d.tone}`} strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset} transform="rotate(-90 60 60)" />
          );
          offset += len;
          return el;
        })}
        <text x="60" y="58" textAnchor="middle" className="donut-total">{center ?? total}</text>
        <text x="60" y="74" textAnchor="middle" className="donut-caption">total</text>
      </svg>
      <ul className="legend legend-col">
        {data.map((d) => <li key={d.label}><i className={`dot tone-${d.tone}`} /> {d.label} <b>{d.value}</b></li>)}
      </ul>
    </div>
  );
};

export const Avatar = ({ name = '?', size = 36 }) => {
  const initials = name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return (
    <span className="avatar" style={{ width: size, height: size, background: `hsl(${hash} 55% 45%)`, fontSize: size * 0.38 }}>
      {initials}
    </span>
  );
};
