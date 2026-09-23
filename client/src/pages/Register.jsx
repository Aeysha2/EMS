import { Briefcase, Loader2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export default function Register() {
  const { register } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ name: '', email: '', phone: '', matricule: '', password: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirm) return toast.error('Les mots de passe ne correspondent pas');
    setBusy(true);
    try {
      const { confirm, ...data } = form; // eslint-disable-line no-unused-vars
      await register(data);
      toast.success('Compte créé avec succès');
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
    return null;
  };

  return (
    <div className="auth-page">
      <div className="auth-hero">
        <div className="brand-logo big"><Briefcase size={30} /></div>
        <h1>Créer un compte</h1>
        <p>L’inscription crée un compte <b>agent</b>. Les rôles RH et administrateur sont attribués par l’administrateur.</p>
        <p>Si votre dossier a déjà été créé par les RH, indiquez votre <b>matricule</b> pour le rattacher.</p>
      </div>
      <form className="auth-card stack" onSubmit={submit}>
        <h2>Inscription</h2>
        <label className="field"><span>Nom complet</span><input required value={form.name} onChange={set('name')} /></label>
        <label className="field"><span>Email professionnel</span><input type="email" required value={form.email} onChange={set('email')} /></label>
        <div className="grid-2">
          <label className="field"><span>Téléphone</span><input value={form.phone} onChange={set('phone')} /></label>
          <label className="field"><span>Matricule (si existant)</span><input value={form.matricule} onChange={set('matricule')} /></label>
        </div>
        <div className="grid-2">
          <label className="field"><span>Mot de passe</span>
            <input type="password" required minLength={8} value={form.password} onChange={set('password')} autoComplete="new-password" />
            <small>8 caractères min., lettres et chiffres</small>
          </label>
          <label className="field"><span>Confirmation</span>
            <input type="password" required value={form.confirm} onChange={set('confirm')} autoComplete="new-password" />
          </label>
        </div>
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? <Loader2 className="spin" size={18} /> : <UserPlus size={18} />} Créer mon compte
        </button>
        <p className="center muted">Déjà inscrit ? <Link to="/login">Se connecter</Link></p>
      </form>
    </div>
  );
}
