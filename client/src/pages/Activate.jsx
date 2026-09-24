import { Loader2, UserCheck } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Emblem } from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export default function Activate() {
  const { activate } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ email: '', identifier: '', password: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirm) { toast.error('Les mots de passe ne correspondent pas'); return; }
    setBusy(true);
    try {
      await activate({ email: form.email, identifier: form.identifier, password: form.password });
      toast.success('Compte activé');
    } catch (err) { toast.error(err); } finally { setBusy(false); }
  };

  return (
    <div className="auth-page">
      <div className="auth-hero">
        <div className="flag-stripe big" aria-hidden="true"><span /><span /><span /></div>
        <div className="row gap"><Emblem size={56} /><h1>Activer mon compte</h1></div>
        <p>Votre dossier est déjà enregistré par la DRH de votre ministère dans le référentiel national.</p>
        <p>Pour activer votre accès au portail agent, indiquez votre <b>email professionnel</b> et votre
          <b> identifiant SIGRH</b> (SN…) ou votre <b>matricule de solde</b> (figurant sur votre bulletin).</p>
      </div>
      <form className="auth-card stack" onSubmit={submit}>
        <h2>Activation</h2>
        <label className="field"><span>Email professionnel</span><input type="email" required value={form.email} onChange={set('email')} /></label>
        <label className="field"><span>Identifiant SIGRH ou matricule de solde</span><input required value={form.identifier} onChange={set('identifier')} placeholder="SN00000012" /></label>
        <label className="field"><span>Mot de passe</span>
          <input type="password" required minLength={10} value={form.password} onChange={set('password')} autoComplete="new-password" />
          <small>10 caractères minimum, avec majuscule, minuscule et chiffre</small>
        </label>
        <label className="field"><span>Confirmation</span><input type="password" required value={form.confirm} onChange={set('confirm')} autoComplete="new-password" /></label>
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? <Loader2 className="spin" size={18} /> : <UserCheck size={18} />} Activer</button>
        <p className="center muted small"><Link to="/login">Retour à la connexion</Link></p>
      </form>
    </div>
  );
}
