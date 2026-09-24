import {
  BarChart3, Bell, Building2, CalendarDays, ClipboardCheck, FileSpreadsheet, FolderOpen, GraduationCap, KeyRound,
  LayoutDashboard, LogOut, Megaphone, Menu, Moon, Network, Settings2, ShieldCheck, Sun, Target, UserCircle, Users, Wallet, X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import api from '../services/api';
import { dateTime, ROLE_LABELS } from '../utils/format';
import { Avatar } from './ui';

/** Menu : chaque entrée indique qui la voit (show reçoit le contexte d'authentification). */
const NAV = [
  { to: '/', label: 'Tableau de bord', icon: LayoutDashboard, end: true, show: () => true },
  { section: 'Mon espace agent', show: (a) => a.hasDossier },
  { to: '/me', label: 'Mon dossier', icon: FolderOpen, show: (a) => a.hasDossier },
  { to: '/absences', label: 'Absences et présences', icon: CalendarDays, show: (a) => a.hasDossier },
  { to: '/trainings', label: 'Formation', icon: GraduationCap, show: (a) => a.hasDossier || a.isCentral },
  { to: '/performance', label: 'Évaluation', icon: Target, show: (a) => a.hasDossier },
  { to: '/solde', label: 'Rémunération', icon: Wallet, show: (a) => a.hasDossier || a.isPilotage },
  { section: 'Gestion des ressources humaines', show: () => true },
  { to: '/requests', label: 'Demandes et actes', icon: ClipboardCheck, show: () => true },
  { to: '/agents', label: 'Agents', icon: Users, show: () => true },
  { to: '/structures', label: 'Organigramme', icon: Building2, show: () => true },
  { to: '/reprise', label: 'Reprise des données', icon: FileSpreadsheet, show: (a) => a.isDRH },
  { section: 'Pilotage', show: (a) => a.isPilotage || a.isDRH },
  { to: '/pilotage', label: 'Tableaux de bord RH', icon: BarChart3, show: (a) => a.isPilotage || a.isDRH },
  { section: 'Administration', show: (a) => a.isCentral },
  { to: '/parametrage', label: 'Circuits et référentiels', icon: Settings2, show: (a) => a.isCentral },
  { to: '/interop', label: 'Interopérabilité', icon: Network, show: (a) => a.isDSI },
  { to: '/admin', label: 'Habilitations et audit', icon: ShieldCheck, show: (a) => a.isDSI },
  { section: 'Informations', show: () => true },
  { to: '/announcements', label: 'Annonces et calendrier', icon: Megaphone, show: () => true },
  { to: '/profile', label: 'Mon compte', icon: UserCircle, show: () => true },
];

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ data: [], unread: 0 });
  const ref = useRef(null);
  const navigate = useNavigate();
  const load = async () => { try { setData(await api.get('/notifications')); } catch { /* hors ligne */ } };

  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const openItem = async (n) => {
    if (!n.is_read) await api.patch(`/notifications/${n.id}/read`);
    setOpen(false);
    load();
    if (n.link) navigate(n.link);
  };

  return (
    <div className="notif" ref={ref}>
      <button type="button" className="icon-btn" onClick={() => setOpen((o) => !o)} aria-label="Notifications">
        <Bell size={20} />
        {data.unread > 0 && <span className="notif-count">{data.unread > 99 ? '99+' : data.unread}</span>}
      </button>
      {open && (
        <div className="notif-panel">
          <div className="notif-head">
            <b>Notifications</b>
            {data.unread > 0 && (
              <button type="button" className="link" onClick={async () => { await api.patch('/notifications/all/read'); load(); }}>
                Tout marquer comme lu
              </button>
            )}
          </div>
          <div className="notif-list">
            {data.data.length === 0 && <p className="muted pad">Aucune notification</p>}
            {data.data.map((n) => (
              <button type="button" key={n.id} className={`notif-item ${n.is_read ? '' : 'unread'} ${n.type === 'alerte' ? 'alert' : ''}`}
                onClick={() => openItem(n)}>
                <b>{n.title}</b>
                {n.message && <span>{n.message}</span>}
                <small>{dateTime(n.created_at)}</small>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export const Emblem = ({ size = 38 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label="SIGRH">
    <rect x="0" y="0" width="16" height="48" rx="3" fill="#00853F" />
    <rect x="16" y="0" width="16" height="48" fill="#FDEF42" />
    <rect x="32" y="0" width="16" height="48" rx="3" fill="#E31B23" />
    <path d="M24 16l2.6 5.6 6 .7-4.5 4.1 1.2 6-5.3-3-5.3 3 1.2-6-4.5-4.1 6-.7z" fill="#00853F" />
  </svg>
);

export default function Layout() {
  const auth = useAuth();
  const { user, logout } = auth;
  const { theme, toggle } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setMenuOpen(false), [location.pathname]);
  const items = NAV.filter((n) => n.show(auth));

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="brand">
          <Emblem />
          <div>
            <b>SIGRH</b>
            <small>Administration publique sénégalaise</small>
          </div>
          <button type="button" className="icon-btn only-mobile" onClick={() => setMenuOpen(false)} aria-label="Fermer le menu"><X size={18} /></button>
        </div>
        <nav>
          {items.map((n, i) => (n.section
            ? <div key={`s${i}`} className="nav-section">{n.section}</div>
            : (
              <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                <n.icon size={18} /> <span>{n.label}</span>
              </NavLink>
            )))}
        </nav>
        <div className="sidebar-foot">
          <KeyRound size={13} /> {user.totp_enabled ? '2FA active' : '2FA inactive'} · {user.institution_name || '—'}
        </div>
      </aside>
      {menuOpen && <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)} />}

      <div className="main">
        <div className="flag-stripe" aria-hidden="true"><span /><span /><span /></div>
        <header className="topbar">
          <button type="button" className="icon-btn only-mobile" onClick={() => setMenuOpen(true)} aria-label="Menu"><Menu size={20} /></button>
          <div className="topbar-title hide-mobile">
            <b>République du Sénégal</b>
            <small>Un Peuple – Un But – Une Foi</small>
          </div>
          <div className="topbar-spacer" />
          <button type="button" className="icon-btn" onClick={toggle} aria-label="Changer de thème" title="Mode sombre / clair">
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <NotificationBell />
          <div className="user-chip">
            <Avatar name={user.name} size={32} />
            <div className="hide-mobile">
              <b>{user.name}</b>
              <small>{ROLE_LABELS[user.role]}{user.isChef ? ' · Chef de structure' : ''}</small>
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={logout} aria-label="Se déconnecter" title="Se déconnecter"><LogOut size={20} /></button>
        </header>
        <main className="content"><Outlet /></main>
      </div>
    </div>
  );
}
