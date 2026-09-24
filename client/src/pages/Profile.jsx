import { KeyRound, ShieldCheck, ShieldOff } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import MfaEnroll from '../components/MfaEnroll';
import { Field, PageHeader, Tabs } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../services/api';
import { ROLE_LABELS } from '../utils/format';

const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{10,}$/;

/** Mon compte : informations, coordonnées, mot de passe et double authentification. */
export default function Profile() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'compte';
  return (
    <>
      <PageHeader title="Mon compte" />
      <Tabs value={tab} onChange={(t) => setParams(t === 'compte' ? {} : { tab: t })} tabs={[
        { value: 'compte', label: 'Informations' },
        { value: 'motdepasse', label: 'Mot de passe' },
        { value: 'securite', label: 'Double authentification' },
      ]} />
      {tab === 'compte' && <Account />}
      {tab === 'motdepasse' && <Password />}
      {tab === 'securite' && <Security />}
    </>
  );
}

function Account() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const emp = user.employee;
  const [form, setForm] = useState({
    phone: emp?.phone || '', address: emp?.address || '', marital_status: emp?.marital_status || '', children_count: emp?.children_count ?? 0,
  });
  const save = async (e) => {
    e.preventDefault();
    try {
      const employee = await api.put('/employees/me', { ...form, children_count: Number(form.children_count) });
      setUser({ ...user, employee });
      toast.success('Coordonnées mises à jour');
    } catch (err) { toast.error(err); }
  };
  return (
    <div className="split">
      <div className="card">
        <h3>Compte</h3>
        <dl className="dl">
          <dt>Nom</dt><dd>{user.name}</dd>
          <dt>Email</dt><dd>{user.email}</dd>
          <dt>Profil</dt><dd>{ROLE_LABELS[user.role]}{user.isChef && ' · Chef de structure'}</dd>
          <dt>Institution</dt><dd>{user.institution_name || '—'}</dd>
          <dt>Structure</dt><dd>{user.structure_name || '—'}</dd>
          {user.headedStructures?.length > 0 && <><dt>Structures dirigées</dt><dd>{user.headedStructures.map((s) => s.name).join(', ')}</dd></>}
          {emp && <><dt>Identifiant SIGRH</dt><dd className="mono">{emp.sigrh_id}</dd></>}
        </dl>
      </div>
      {emp ? (
        <form className="card" onSubmit={save}>
          <h3>Mes coordonnées</h3>
          <p className="muted small">Les autres informations de votre dossier (grade, affectation, état civil…) sont tenues par votre DRH. Demandez une correction via « Mes demandes ».</p>
          <div className="form-grid">
            <Field label="Téléphone"><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="Situation matrimoniale"><select value={form.marital_status} onChange={(e) => setForm({ ...form, marital_status: e.target.value })}>
              <option value="">—</option>{['Célibataire', 'Marié(e)', 'Divorcé(e)', 'Veuf(ve)'].map((s) => <option key={s}>{s}</option>)}</select></Field>
            <Field label="Adresse" full><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
            <Field label="Nombre d’enfants"><input type="number" min="0" value={form.children_count} onChange={(e) => setForm({ ...form, children_count: e.target.value })} /></Field>
          </div>
          <button className="btn btn-primary">Enregistrer</button>
        </form>
      ) : <div className="card"><p className="muted">Ce compte technique n’est lié à aucun dossier agent.</p></div>}
    </div>
  );
}

function Password() {
  const toast = useToast();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const valid = PASSWORD_RULE.test(form.newPassword) && form.newPassword === form.confirm;
  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.put('/auth/password', { currentPassword: form.currentPassword, newPassword: form.newPassword });
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
      toast.success('Mot de passe modifié');
    } catch (err) { toast.error(err); }
  };
  return (
    <form className="card narrow" onSubmit={submit}>
      <h3><KeyRound size={18} /> Changer mon mot de passe</h3>
      <Field label="Mot de passe actuel"><input type="password" autoComplete="current-password" value={form.currentPassword}
        onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} /></Field>
      <Field label="Nouveau mot de passe" hint="10 caractères minimum, avec une majuscule, une minuscule et un chiffre">
        <input type="password" autoComplete="new-password" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} /></Field>
      <Field label="Confirmation"><input type="password" autoComplete="new-password" value={form.confirm}
        onChange={(e) => setForm({ ...form, confirm: e.target.value })} /></Field>
      {form.confirm && form.confirm !== form.newPassword && <p className="text-danger small">Les mots de passe ne correspondent pas.</p>}
      <button className="btn btn-primary" disabled={!valid || !form.currentPassword}>Modifier</button>
    </form>
  );
}

function Security() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [code, setCode] = useState('');
  const privileged = user.role !== 'agent';
  const disable = async (e) => {
    e.preventDefault();
    try { const { user: u } = await api.post('/auth/mfa/disable', { code }); setUser(u); setCode(''); toast.success('Double authentification désactivée'); } catch (err) { toast.error(err); }
  };
  return (
    <div className="card narrow">
      {user.totp_enabled ? (
        <>
          <p className="alert alert-success"><ShieldCheck size={16} /> La double authentification est active sur votre compte.</p>
          {privileged ? <p className="muted small">Elle est obligatoire pour votre profil. En cas de perte du téléphone, contactez la DSI.</p> : (
            <form onSubmit={disable} className="row gap">
              <input className="otp" inputMode="numeric" maxLength={6} value={code} placeholder="000000" aria-label="Code actuel"
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
              <button className="btn btn-danger" disabled={code.length !== 6}><ShieldOff size={16} /> Désactiver</button>
            </form>
          )}
        </>
      ) : (
        <>
          <h3>Activer la double authentification</h3>
          <p className="muted">Un code à usage unique, généré par votre téléphone, vous sera demandé à chaque connexion en plus du mot de passe.
            {privileged && ' Elle est obligatoire pour les profils DRH, pilotage et DSI.'}</p>
          <MfaEnroll />
        </>
      )}
    </div>
  );
}
