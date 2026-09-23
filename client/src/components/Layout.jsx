import {
  BarChart3, Bell, Briefcase, Building2, CalendarDays, ClipboardList, Clock, FolderKanban, LayoutDashboard,
  LogOut, Megaphone, Menu, Moon, Settings2, ShieldCheck, Sun, Target, UserCircle, Users, Wallet, X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import api from '../services/api';
import { dateTime, ROLE_LABELS } from '../utils/format';
import { Avatar } from './ui';

const NAV = [
  { to: '/', label: 'Tableau de bord', icon: LayoutDashboard, end: true },
  { section: 'Gestion du personnel' },
  { to: '/employees', label: 'Employés', icon: Users },
  { to: '/departments', label: 'Départements', icon: Building2 },
  { to: '/attendance', label: 'Présences', icon: Clock },
  { to: '/leaves', label: 'Congés', icon: CalendarDays },
  { to: '/payroll', label: 'Paie', icon: Wallet },
  { to: '/performance', label: 'Performance', icon: Target },
  { section: 'Projets & dossiers' },
  { to: '/projects', label: 'Dossiers', icon: FolderKanban },
  { to: '/projects-settings', label: 'Circuit & paramètres', icon: Settings2, roles: ['admin', 'hr'] },
  { section: 'Organisation' },
  { to: '/reports', label: 'Rapports', icon: BarChart3, roles: ['admin', 'hr'] },
  { to: '/announcements', label: 'Annonces & calendrier', icon: Megaphone },
  { to: '/users', label: 'Comptes & audit', icon: ShieldCheck, roles: ['admin'] },
  { to: '/profile', label: 'Mon espace', icon: UserCircle },
];

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ data: [], unread: 0 });
  const ref = useRef(null);
  const navigate = useNavigate();

  const load = async () => {
    try { setData(await api.get('/notifications')); } catch { /* offline */ }
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 30000); // polling keeps the badge fresh
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

  const readAll = async () => {
    await api.patch('/notifications/all/read');
    load();
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
            {data.unread > 0 && <button type="button" className="link" onClick={readAll}>Tout marquer comme lu</button>}
          </div>
          <div className="notif-list">
            {data.data.length === 0 && <p className="muted pad">Aucune notification</p>}
            {data.data.map((n) => (
              <button type="button" key={n.id} className={`notif-item ${n.is_read ? '' : 'unread'}`} onClick={() => openItem(n)}>
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

export default function Layout() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setMenuOpen(false), [location.pathname]);

  const items = NAV.filter((n) => !n.roles || n.roles.includes(user.role));

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-logo"><Briefcase size={20} /></div>
          <div>
            <b>SIGRH</b>
            <small>Ministère de la Fonction Publique</small>
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
          <ClipboardList size={14} /> v1.0 · {ROLE_LABELS[user.role]}
        </div>
      </aside>
      {menuOpen && <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)} />}

      <div className="main">
        <header className="topbar">
          <button type="button" className="icon-btn only-mobile" onClick={() => setMenuOpen(true)} aria-label="Menu"><Menu size={20} /></button>
          <div className="topbar-spacer" />
          <button type="button" className="icon-btn" onClick={toggle} aria-label="Changer de thème" title="Mode sombre / clair">
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <NotificationBell />
          <div className="user-chip">
            <Avatar name={user.name} size={32} />
            <div className="hide-mobile">
              <b>{user.name}</b>
              <small>{ROLE_LABELS[user.role]}{user.managedDepartments?.length ? ' · Chef de service' : ''}</small>
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={logout} aria-label="Se déconnecter" title="Se déconnecter"><LogOut size={20} /></button>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
