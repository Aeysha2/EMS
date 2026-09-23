import { KeyRound } from 'lucide-react';
import { useState } from 'react';
import { Loader, PageHeader, Tabs } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../services/api';
import { dateTime, ROLE_LABELS } from '../utils/format';
import useFetch from '../utils/useFetch';

export default function Users() {
  const { user: me } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState('users');
  const users = useFetch(tab === 'users' ? '/users' : null);
  const logs = useFetch(tab === 'audit' ? '/activity?limit=200' : null);

  const update = async (u, patch, msg) => {
    try { await api.patch(`/users/${u.id}`, patch); toast.success(msg); users.reload(); } catch (err) { toast.error(err); }
  };
  const resetPassword = (u) => {
    const pw = window.prompt(`Nouveau mot de passe pour ${u.name} (8 caractères min.) :`);
    if (pw) update(u, { password: pw }, 'Mot de passe réinitialisé');
  };

  return (
    <>
      <PageHeader title="Comptes & audit" subtitle="Rôles, accès et journal des activités RH" />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'users', label: 'Comptes utilisateurs' }, { value: 'audit', label: 'Journal d’audit' }]} />
      {tab === 'users' && (users.loading && !users.data ? <Loader /> : (
        <div className="card table-wrap">
          <table className="table">
            <thead><tr><th>Utilisateur</th><th>Département</th><th>Rôle</th><th>Dernière connexion</th><th>Actif</th><th /></tr></thead>
            <tbody>
              {users.data?.map((u) => (
                <tr key={u.id}>
                  <td><b>{u.name}</b><small className="block muted">{u.email} {u.employee_code && `· ${u.employee_code}`}</small></td>
                  <td>{u.department_name || '—'}</td>
                  <td>
                    <select value={u.role} disabled={u.id === me.id} onChange={(e) => update(u, { role: e.target.value }, 'Rôle modifié')}>
                      {Object.entries(ROLE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                  </td>
                  <td className="small">{u.last_login_at ? dateTime(u.last_login_at) : 'Jamais'}</td>
                  <td><input type="checkbox" checked={u.is_active} disabled={u.id === me.id}
                    onChange={(e) => update(u, { is_active: e.target.checked }, e.target.checked ? 'Compte activé' : 'Compte désactivé')} /></td>
                  <td><button type="button" className="btn btn-sm" onClick={() => resetPassword(u)}><KeyRound size={14} /> Mot de passe</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {tab === 'audit' && (logs.loading && !logs.data ? <Loader /> : (
        <div className="card table-wrap">
          <table className="table">
            <thead><tr><th>Date</th><th>Utilisateur</th><th>Action</th><th>Détails</th></tr></thead>
            <tbody>
              {logs.data?.map((l) => (
                <tr key={l.id}><td className="small">{dateTime(l.created_at)}</td><td>{l.user_name || 'Système'}</td>
                  <td><b>{l.action}</b>{l.entity && <small className="block muted">{l.entity}{l.entity_id ? ` #${l.entity_id}` : ''}</small>}</td>
                  <td className="small">{l.details || '—'}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}
