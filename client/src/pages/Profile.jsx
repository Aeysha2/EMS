import { KeyRound, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import InsightsPanel from '../components/InsightsPanel';
import { Avatar, Field, PageHeader, Tabs } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../services/api';
import { date, money, ROLE_LABELS } from '../utils/format';
import useFetch from '../utils/useFetch';

export default function Profile() {
  const { user } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState('profile');
  const { data: me, setData } = useFetch(user.employee_id ? '/employees/me' : null);
  const [contact, setContact] = useState({ phone: '', address: '' });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });

  useEffect(() => { if (me) setContact({ phone: me.phone || '', address: me.address || '' }); }, [me]);

  const saveContact = async (e) => {
    e.preventDefault();
    try { setData(await api.put('/employees/me', contact)); toast.success('Coordonnées mises à jour'); } catch (err) { toast.error(err); }
  };
  const changePw = async (e) => {
    e.preventDefault();
    if (pw.newPassword !== pw.confirm) return toast.error('Les mots de passe ne correspondent pas');
    try {
      await api.put('/auth/password', pw);
      toast.success('Mot de passe modifié');
      setPw({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (err) { toast.error(err); }
    return null;
  };

  return (
    <>
      <PageHeader title="Mon espace" subtitle="Portail libre-service de l’agent" />
      <div className="card profile-head">
        <Avatar name={user.name} size={72} />
        <div>
          <h2>{user.name}</h2>
          <p className="muted">{user.email} · {ROLE_LABELS[user.role]}</p>
          {me && <p className="muted">{me.employee_code} {me.matricule && `· ${me.matricule}`} · {me.designation} · {me.department_name}</p>}
        </div>
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'profile', label: 'Mon dossier' },
        { value: 'security', label: 'Sécurité' },
        user.employee_id && { value: 'insights', label: 'Mon analyse de performance' },
      ]} />
      {tab === 'profile' && me && (
        <div className="grid-2">
          <div className="card">
            <h3>Informations administratives</h3>
            <dl className="info-grid">
              <div><dt>Date d’entrée</dt><dd>{date(me.date_of_joining)}</dd></div>
              <div><dt>Grade</dt><dd>{me.grade || '—'}</dd></div>
              <div><dt>Salaire de base</dt><dd>{money(me.salary)}</dd></div>
              <div><dt>Congés payés</dt><dd>{me.paid_balance} j</dd></div>
              <div><dt>Congés occasionnels</dt><dd>{me.casual_balance} j</dd></div>
              <div><dt>Congés maladie</dt><dd>{me.sick_balance} j</dd></div>
            </dl>
            <p className="muted small">Pour corriger ces informations, contactez la Direction des Ressources Humaines.</p>
          </div>
          <form className="card stack" onSubmit={saveContact}>
            <h3>Mes coordonnées</h3>
            <Field label="Téléphone"><input value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} /></Field>
            <Field label="Adresse"><textarea rows={3} value={contact.address} onChange={(e) => setContact({ ...contact, address: e.target.value })} /></Field>
            <button className="btn btn-primary"><Save size={16} /> Enregistrer</button>
          </form>
        </div>
      )}
      {tab === 'profile' && !user.employee_id && <div className="card"><p className="muted">Aucun dossier agent n’est rattaché à ce compte.</p></div>}
      {tab === 'security' && (
        <form className="card stack narrow" onSubmit={changePw}>
          <h3><KeyRound size={18} /> Changer mon mot de passe</h3>
          <Field label="Mot de passe actuel"><input type="password" required value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} autoComplete="current-password" /></Field>
          <Field label="Nouveau mot de passe" hint="8 caractères min., lettres et chiffres"><input type="password" required minLength={8} value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} autoComplete="new-password" /></Field>
          <Field label="Confirmation"><input type="password" required value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} autoComplete="new-password" /></Field>
          <button className="btn btn-primary">Mettre à jour</button>
        </form>
      )}
      {tab === 'insights' && <InsightsPanel employeeId={user.employee_id} />}
    </>
  );
}
