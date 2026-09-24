import { CheckCircle2, KeyRound, Plus, ShieldAlert, ShieldCheck, UserCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge, Empty, Field, Loader, Modal, PageHeader, Tabs } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api, { qs } from '../services/api';
import { date, dateTime, ROLE_LABELS } from '../utils/format';
import useFetch from '../utils/useFetch';

const ROLE_TONES = { agent: 'muted', gestionnaire_rh: 'info', pilotage: 'purple', admin_dsi: 'warning' };

/** Habilitations et journal d'audit (profil DSI : technique, sans accès aux données métier). */
export default function Admin() {
  const [tab, setTab] = useState('users');
  return (
    <>
      <PageHeader title="Habilitations et audit"
        subtitle="Gestion des comptes, revue périodique des droits et contrôle d’intégrité du journal inaltérable" />
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'users', label: 'Comptes et habilitations' },
        { value: 'audit', label: 'Journal d’audit' },
      ]} />
      {tab === 'users' ? <Users /> : <Audit />}
    </>
  );
}

function Users() {
  const toast = useToast();
  const { user: me } = useAuth();
  const { data, reload } = useFetch('/admin/users');
  const { data: structures } = useFetch('/structures?flat=1');
  const [filter, setFilter] = useState({ q: '', role: '', due: false });
  const [form, setForm] = useState(null);
  const [edit, setEdit] = useState(null);

  const users = useMemo(() => {
    if (!data) return [];
    const q = filter.q.toLowerCase();
    return data.users.filter((u) => (!filter.role || u.role === filter.role) && (!filter.due || u.review_due)
      && (!q || `${u.name} ${u.email} ${u.institution_sigle || ''}`.toLowerCase().includes(q)));
  }, [data, filter]);

  if (!data) return <Loader />;
  const privileged = data.users.filter((u) => u.role !== 'agent');
  const dueCount = privileged.filter((u) => u.review_due).length;
  const noMfa = privileged.filter((u) => !u.totp_enabled && u.is_active).length;

  const run = async (fn, msg) => { try { await fn(); toast.success(msg); reload(); } catch (err) { toast.error(err); } };
  const create = () => run(async () => { await api.post('/admin/users', form); setForm(null); }, 'Compte créé');
  const save = () => {
    const body = {};
    if (edit.role !== edit.original.role) body.role = edit.role;
    if (String(edit.structure_id || '') !== '') body.structure_id = Number(edit.structure_id);
    if (edit.password) body.password = edit.password;
    if (edit.reset_mfa) body.reset_mfa = true;
    return run(async () => { await api.patch(`/admin/users/${edit.original.id}`, body); setEdit(null); }, 'Habilitations mises à jour');
  };

  return (
    <>
      <div className="stats-grid">
        <div className="card mini-stat"><b>{data.users.length}</b><span>comptes</span></div>
        <div className="card mini-stat"><b>{privileged.length}</b><span>profils privilégiés</span></div>
        <div className={`card mini-stat ${dueCount ? 'warn' : ''}`}><b>{dueCount}</b><span>revues de droits à faire ({data.review_period_days} j)</span></div>
        <div className={`card mini-stat ${noMfa ? 'warn' : ''}`}><b>{noMfa}</b><span>privilégiés sans 2FA</span></div>
      </div>
      <div className="toolbar">
        <input type="search" placeholder="Nom, email, institution…" value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} />
        <select value={filter.role} onChange={(e) => setFilter({ ...filter, role: e.target.value })} aria-label="Profil">
          <option value="">Tous les profils</option>
          {Object.entries(ROLE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <label className="check"><input type="checkbox" checked={filter.due} onChange={(e) => setFilter({ ...filter, due: e.target.checked })} /> Revue à faire</label>
        <span className="grow" />
        <button type="button" className="btn btn-primary"
          onClick={() => setForm({ name: '', email: '', password: '', role: 'gestionnaire_rh', structure_id: '' })}><Plus size={16} /> Nouveau compte</button>
      </div>
      <div className="card table-wrap">
        <table className="table">
          <thead><tr><th>Compte</th><th>Profil</th><th>Périmètre</th><th>2FA</th><th>Dernière connexion</th><th>Revue des droits</th><th className="action-col" /></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={u.is_active ? '' : 'row-muted'}>
                <td><b>{u.name}</b><div className="small muted">{u.email}{u.sigrh_id && <> · <span className="mono">{u.sigrh_id}</span></>}</div></td>
                <td><Badge tone={ROLE_TONES[u.role]}>{ROLE_LABELS[u.role]}</Badge>{!u.is_active && <> <Badge tone="danger">Désactivé</Badge></>}</td>
                <td className="small">{u.institution_sigle && <b>{u.institution_sigle} · </b>}{u.structure_name || '—'}</td>
                <td>{u.totp_enabled ? <ShieldCheck size={16} className="text-success" aria-label="Activée" />
                  : <ShieldAlert size={16} className={u.role === 'agent' ? 'muted' : 'text-danger'} aria-label="Non activée" />}</td>
                <td className="small">{u.last_login_at ? dateTime(u.last_login_at) : 'Jamais'}</td>
                <td className="small">
                  {u.review_due ? <Badge tone="warning">À revoir</Badge> : <Badge tone="success">À jour</Badge>}
                  {u.rights_reviewed_at && <div className="muted">{date(u.rights_reviewed_at)}{u.reviewed_by_name && ` · ${u.reviewed_by_name}`}</div>}
                </td>
                <td className="action-col">
                  {u.id !== me.id && (
                    <div className="row gap-sm">
                      <button type="button" className="btn btn-sm" title="Confirmer les droits"
                        onClick={() => run(() => api.post(`/admin/users/${u.id}/review`), 'Droits confirmés')}><UserCheck size={14} /></button>
                      <button type="button" className="btn btn-sm" onClick={() => setEdit({ original: u, role: u.role, structure_id: '', password: '', reset_mfa: false })}>Modifier</button>
                      <button type="button" className={`btn btn-sm ${u.is_active ? 'btn-danger' : 'btn-success'}`}
                        onClick={() => run(() => api.patch(`/admin/users/${u.id}`, { is_active: !u.is_active }), u.is_active ? 'Compte désactivé' : 'Compte réactivé')}>
                        {u.is_active ? 'Désactiver' : 'Réactiver'}</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!users.length && <Empty>Aucun compte</Empty>}
      </div>

      {form && (
        <Modal title="Nouveau compte habilité" onClose={() => setForm(null)}
          footer={<><button type="button" className="btn" onClick={() => setForm(null)}>Annuler</button>
            <button type="button" className="btn btn-primary" onClick={create}
              disabled={!form.name || !form.email || form.password.length < 10 || !form.structure_id}>Créer</button></>}>
          <div className="form-grid">
            <Field label="Nom complet"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Email"><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Profil"><select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {Object.entries(ROLE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <Field label="Mot de passe initial" hint="10 caractères minimum ; à changer à la première connexion">
              <input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
            <Field label="Structure de rattachement (définit le périmètre)" full>
              <StructureSelect structures={structures} value={form.structure_id} onChange={(v) => setForm({ ...form, structure_id: v })} /></Field>
          </div>
          <p className="muted small">Le profil « Pilotage » est réservé aux agents de la Présidence et du SGG. Le profil DSI ne donne aucun accès aux dossiers des agents.</p>
        </Modal>
      )}

      {edit && (
        <Modal title={`Habilitations — ${edit.original.name}`} onClose={() => setEdit(null)}
          footer={<><button type="button" className="btn" onClick={() => setEdit(null)}>Annuler</button>
            <button type="button" className="btn btn-primary" onClick={save}
              disabled={edit.password && edit.password.length < 10}>Enregistrer</button></>}>
          <div className="form-grid">
            <Field label="Profil"><select value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })}>
              {Object.entries(ROLE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <Field label="Nouvelle structure" hint={`Actuelle : ${edit.original.structure_name || '—'}`}>
              <StructureSelect structures={structures} value={edit.structure_id} onChange={(v) => setEdit({ ...edit, structure_id: v })} placeholder="Inchangée" /></Field>
            <Field label="Réinitialiser le mot de passe" hint="Laisser vide pour ne pas changer">
              <input type="text" value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} /></Field>
            <label className="check field-full"><input type="checkbox" checked={edit.reset_mfa} disabled={!edit.original.totp_enabled}
              onChange={(e) => setEdit({ ...edit, reset_mfa: e.target.checked })} /> <KeyRound size={14} /> Réinitialiser la double authentification (téléphone perdu)</label>
          </div>
        </Modal>
      )}
    </>
  );
}

const StructureSelect = ({ structures, value, onChange, placeholder = '— Choisir —' }) => (
  <select value={value} onChange={(e) => onChange(e.target.value)}>
    <option value="">{placeholder}</option>
    {structures?.map((s) => <option key={s.id} value={s.id}>{s.institution_sigle} — {s.name}</option>)}
  </select>
);

function Audit() {
  const toast = useToast();
  const [filter, setFilter] = useState({ action: '', limit: 100 });
  const { data, loading } = useFetch(`/admin/audit${qs(filter)}`);
  const [check, setCheck] = useState(null);
  const verify = async () => { try { setCheck(await api.get('/admin/audit/verify')); } catch (err) { toast.error(err); } };
  return (
    <>
      <div className="card">
        <div className="row gap wrap">
          <div className="grow">
            <h3>Intégrité du journal</h3>
            <p className="muted small">Chaque entrée est chaînée à la précédente par une empreinte SHA-256 ; toute modification ou suppression rompt la chaîne. La base refuse les UPDATE et DELETE sur cette table.</p>
          </div>
          <button type="button" className="btn btn-primary" onClick={verify}><CheckCircle2 size={16} /> Vérifier la chaîne</button>
        </div>
        {check && (check.valid
          ? <p className="alert alert-success">Journal intègre : {check.checked} entrées vérifiées.</p>
          : <p className="alert alert-danger">Rupture de la chaîne à l’entrée n° {check.brokenAt} — le journal a été altéré.</p>)}
      </div>
      <div className="toolbar">
        <input type="search" placeholder="Filtrer par action…" value={filter.action} onChange={(e) => setFilter({ ...filter, action: e.target.value })} />
        <select value={filter.limit} onChange={(e) => setFilter({ ...filter, limit: e.target.value })} aria-label="Nombre d’entrées">
          {[100, 250, 500].map((n) => <option key={n} value={n}>{n} dernières</option>)}
        </select>
      </div>
      <div className="card table-wrap">
        {loading && !data ? <Loader /> : (
          <table className="table">
            <thead><tr><th>#</th><th>Date</th><th>Utilisateur</th><th>Action</th><th>Objet</th><th>Détails</th><th>IP</th><th>Empreinte</th></tr></thead>
            <tbody>{data?.map((a) => (
              <tr key={a.id}>
                <td className="mono small">{a.id}</td>
                <td className="small nowrap">{dateTime(a.created_at)}</td>
                <td className="small">{a.user_name || 'Système'}{a.role && <div className="muted">{ROLE_LABELS[a.role]}</div>}</td>
                <td>{a.action}</td>
                <td className="small mono">{a.entity}{a.entity_id ? ` #${a.entity_id}` : ''}</td>
                <td className="small">{a.details}</td>
                <td className="small mono">{a.ip || '—'}</td>
                <td className="small mono" title={a.hash}>{a.hash?.slice(0, 10)}…</td>
              </tr>))}</tbody>
          </table>
        )}
        {data && !data.length && <Empty>Aucune entrée</Empty>}
      </div>
    </>
  );
}
