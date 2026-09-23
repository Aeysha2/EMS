import { Briefcase, Crown, Loader2, LogIn, UserCog, UserRound } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const ROLES = [
  { key: 'admin', label: 'Administrateur', icon: Crown, email: 'admin@ems.gov', password: 'Admin@123', desc: 'Paramétrage, comptes, audit' },
  { key: 'hr', label: 'Ressources Humaines', icon: UserCog, email: 'rh@ems.gov', password: 'Rh@12345', desc: 'Personnel, congés, paie' },
  { key: 'employee', label: 'Agent', icon: UserRound, email: 'agent@ems.gov', password: 'Agent@123', desc: 'Pointage, congés, dossiers' },
];

export default function Login() {
  const { login } = useAuth();
  const toast = useToast();
  const [role, setRole] = useState('');
  const [form, setForm] = useState({ email: '', password: '' });
  const [busy, setBusy] = useState(false);

  const pickRole = (r) => {
    setRole(r.key);
    setForm({ email: r.email, password: r.password });
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const u = await login(form.email, form.password);
      toast.success(`Bienvenue, ${u.name}`);
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-hero">
        <div className="brand-logo big"><Briefcase size={30} /></div>
        <h1>SIGRH</h1>
        <p>Système Intégré de Gestion des Ressources Humaines<br />Ministère de la Fonction Publique</p>
        <ul>
          <li>Gestion des agents, départements et présences</li>
          <li>Congés, paie et bulletins téléchargeables</li>
          <li>Enregistrement et circuit de traitement des dossiers</li>
          <li>Tableaux de bord et rapports</li>
        </ul>
      </div>
      <div className="auth-card">
        <h2>Connexion</h2>
        <p className="muted">Sélectionnez un profil de démonstration ou saisissez vos identifiants.</p>
        <div className="role-picker">
          {ROLES.map((r) => (
            <button type="button" key={r.key} className={`role-card ${role === r.key ? 'active' : ''}`} onClick={() => pickRole(r)}>
              <r.icon size={22} />
              <b>{r.label}</b>
              <small>{r.desc}</small>
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="stack">
          <label className="field"><span>Email</span>
            <input type="email" required autoComplete="username" value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <label className="field"><span>Mot de passe</span>
            <input type="password" required autoComplete="current-password" value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </label>
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? <Loader2 className="spin" size={18} /> : <LogIn size={18} />} Se connecter
          </button>
        </form>
        <p className="center muted">Pas encore de compte ? <Link to="/register">Créer un compte agent</Link></p>
      </div>
    </div>
  );
}
