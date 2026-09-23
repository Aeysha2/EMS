import { AlertTriangle, Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ProjectForm from '../components/ProjectForm';
import { Badge, Empty, Loader, PageHeader, Pagination, Tabs } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { qs } from '../services/api';
import { date, exportCSV, PRIORITY, PROJECT_STATUS } from '../utils/format';
import useFetch from '../utils/useFetch';

export default function Projects() {
  const { user, isHR } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState(params.get('q') || '');
  const filters = Object.fromEntries(params.entries());
  const page = Number(filters.page || 1);

  useEffect(() => {
    const id = setTimeout(() => {
      if ((params.get('q') || '') !== q) update({ q });
    }, 300);
    return () => clearTimeout(id);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (patch) => {
    const next = { ...filters, ...patch, page: patch.page || 1 };
    setParams(Object.fromEntries(Object.entries(next).filter(([, v]) => v !== '' && v !== undefined && v !== null)));
  };

  const { data: config } = useFetch('/projects/config');
  const { data: agents } = useFetch(isHR ? '/employees?limit=100&sort=name' : null);
  const { data, loading } = useFetch(`/projects${qs({ ...filters, limit: 20 })}`);
  const set = (k) => (e) => update({ [k]: e.target.value });

  return (
    <>
      <PageHeader title="Projets & dossiers" subtitle="Enregistrement, affectation et suivi du circuit de traitement">
        {data?.data?.length > 0 && (
          <button type="button" className="btn" onClick={() => exportCSV('dossiers.csv', [
            { label: 'Référence', key: 'reference' }, { label: 'Objet', key: 'title' }, { label: 'Type', key: 'request_type_name' },
            { label: 'Dépôt', key: 'deposit_type_name' }, { label: 'Demandeur', key: 'applicant_name' }, { label: 'Date dépôt', key: 'deposit_date' },
            { label: 'Échéance', key: 'due_date' }, { label: 'Étape', key: 'current_step_name' }, { label: 'Agent', key: 'agent_name' },
            { label: 'Statut', key: 'status' },
          ], data.data)}>Export CSV</button>
        )}
        <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> Enregistrer un dossier</button>
      </PageHeader>

      <Tabs value={filters.scope === 'mine' ? 'mine' : 'all'} onChange={(v) => update({ scope: v === 'mine' ? 'mine' : '' })} tabs={[
        { value: 'all', label: isHR ? 'Tous les dossiers' : 'Dossiers visibles' },
        user.employee_id && { value: 'mine', label: 'Mes dossiers à traiter' },
      ]} />

      <div className="card toolbar">
        <div className="search">
          <Search size={16} />
          <input placeholder="Référence, objet, demandeur, matricule…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select value={filters.status || ''} onChange={set('status')}>
          <option value="">Tous les statuts</option>
          {Object.entries(PROJECT_STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select value={filters.type || ''} onChange={set('type')}>
          <option value="">Tous les types de demande</option>
          {config?.requestTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select value={filters.deposit || ''} onChange={set('deposit')}>
          <option value="">Tous les modes de dépôt</option>
          {config?.depositTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        {isHR && (
          <select value={filters.agent || ''} onChange={set('agent')}>
            <option value="">Tous les agents traitants</option>
            {agents?.data.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
          </select>
        )}
        <label className="check">
          <input type="checkbox" checked={filters.overdue === '1'} onChange={(e) => update({ overdue: e.target.checked ? '1' : '' })} /> En retard
        </label>
      </div>

      {loading && !data && <Loader />}
      {data?.data.length === 0 && <Empty>Aucun dossier</Empty>}
      {data?.data.length > 0 && (
        <div className="card table-wrap">
          <table className="table clickable-rows">
            <thead><tr><th>Référence</th><th>Objet / demandeur</th><th className="hide-mobile">Type</th><th>Étape du circuit</th>
              <th className="hide-mobile">Agent traitant</th><th>Échéance</th><th>Statut</th></tr></thead>
            <tbody>
              {data.data.map((p) => (
                <tr key={p.id} onClick={() => navigate(`/projects/${p.id}`)}>
                  <td><b>{p.reference}</b><small className="block"><Badge map={PRIORITY} value={p.priority} /></small></td>
                  <td><b>{p.title}</b><small className="block muted">{p.applicant_name}{p.applicant_structure && ` · ${p.applicant_structure}`}</small></td>
                  <td className="hide-mobile">{p.request_type_name}<small className="block muted">{p.deposit_type_name}</small></td>
                  <td>
                    <small>{p.current_step}/{p.total_steps} · {p.current_step_name}</small>
                    <div className="progress slim"><div className="progress-fill tone-primary" style={{ width: `${(p.current_step / p.total_steps) * 100}%` }} /></div>
                  </td>
                  <td className="hide-mobile">{p.agent_name || <span className="badge badge-warning">Non affecté</span>}</td>
                  <td className={p.is_overdue ? 'text-danger' : ''}>{p.is_overdue && <AlertTriangle size={14} />} {date(p.due_date)}</td>
                  <td><Badge map={PROJECT_STATUS} value={p.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pagination page={page} limit={data.limit} total={data.total} onPage={(p) => update({ page: p })} />}
      {creating && config && <ProjectForm config={config} onClose={() => setCreating(false)} onSaved={(p) => navigate(`/projects/${p.id}`)} />}
    </>
  );
}
