import { Building2, Crown, KeyRound, Landmark, Loader2, LogIn, ShieldCheck, UserCog, UserRound, Users } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Emblem } from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const DEMO_PASSWORD = 'Sigrh@2026!';
const PROFILES = [
  { email: 'pilotage.presidence@sigrh.test', label: 'Présidence', desc: 'Pilotage national', icon: Crown },
  { email: 'pilotage.sgg@sigrh.test', label: 'SGG', desc: 'Coordination, validations', icon: Landmark },
  { email: 'drh.mfp@sigrh.test', label: 'DRH ministère', desc: 'Fonction publique', icon: UserCog },
  { email: 'chef.dgc@sigrh.test', label: 'Chef de service', desc: 'Direction des carrières', icon: Users },
  { email: 'agent@sigrh.test', label: 'Agent', desc: 'Portail libre-service', icon: UserRound },
  { email: 'admin.dsi@sigrh.test', label: 'DSI', desc: 'Administration technique', icon: ShieldCheck },
];

export default function Login() {
  const { login, verifyMfa } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ email: '', password: '' });
  const [mfaToken, setMfaToken] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await login(form.email, form.password);
      if (res.mfa_required) { setMfaToken(res.mfa_token); toast.info('Saisissez le code de votre application d’authentification'); }
      else toast.success(`Bienvenue, ${res.user.name}`);
    } catch (err) { toast.error(err); } finally { setBusy(false); }
  };

  const submitCode = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { user } = await verifyMfa(mfaToken, code);
      toast.success(`Bienvenue, ${user.name}`);
    } catch (err) {
      toast.error(err);
      if (err.status === 401 && /reconnectez/.test(err.message)) setMfaToken(null);
    } finally { setBusy(false); }
  };

  return (
    <div className="auth-page">
      <div className="auth-hero">
        <div className="flag-stripe big" aria-hidden="true"><span /><span /><span /></div>
        <p className="republic">RÉPUBLIQUE DU SÉNÉGAL<br /><small>Un Peuple – Un But – Une Foi</small></p>
        <div className="row gap"><Emblem size={56} /><h1>SIGRH</h1></div>
        <p>Système Intégré de Gestion des Ressources Humaines de l’Administration Publique Sénégalaise</p>
        <ul>
          <li><Building2 size={16} /> Référentiel unique des agents et des structures de l’État</li>
          <li><Landmark size={16} /> Présidence, SGG et ministères interconnectés</li>
          <li><KeyRound size={16} /> Accès sécurisé par profil et double authentification</li>
        </ul>
      </div>
      <div className="auth-card">
        {!mfaToken ? (
          <>
            <h2>Connexion</h2>
            <p className="muted small">Environnement de démonstration : choisissez un profil ou saisissez vos identifiants.</p>
            <div className="role-picker">
              {PROFILES.map((p) => (
                <button type="button" key={p.email} className={`role-card ${form.email === p.email ? 'active' : ''}`}
                  onClick={() => setForm({ email: p.email, password: DEMO_PASSWORD })}>
                  <p.icon size={20} /><b>{p.label}</b><small>{p.desc}</small>
                </button>
              ))}
            </div>
            <form onSubmit={submit} className="stack">
              <label className="field"><span>Email professionnel</span>
                <input type="email" required autoComplete="username" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </label>
              <label className="field"><span>Mot de passe</span>
                <input type="password" required autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </label>
              <button className="btn btn-primary btn-block" disabled={busy}>
                {busy ? <Loader2 className="spin" size={18} /> : <LogIn size={18} />} Se connecter
              </button>
            </form>
            <p className="center muted small">Agent sans compte ? <Link to="/activate">Activer mon compte</Link></p>
          </>
        ) : (
          <form onSubmit={submitCode} className="stack">
            <h2><KeyRound size={22} /> Double authentification</h2>
            <p className="muted">Ouvrez votre application d’authentification (Google Authenticator, Microsoft Authenticator…)
              et saisissez le code à 6 chiffres affiché pour <b>SIGRH Sénégal</b>.</p>
            <input className="otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="\d{6}" required autoFocus
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} aria-label="Code à 6 chiffres" />
            <button className="btn btn-primary btn-block" disabled={busy || code.length !== 6}>Valider</button>
            <button type="button" className="link" onClick={() => setMfaToken(null)}>Revenir à la connexion</button>
          </form>
        )}
      </div>
    </div>
  );
}
