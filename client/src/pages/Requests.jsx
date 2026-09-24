import { AlertTriangle, Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import RequestForm from '../components/RequestForm';
import { Badge, Empty, Loader, PageHeader, Pagination, Tabs } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { qs } from '../services/api';
import { CATEGORY, date, PRIORITY, REQUEST_STATUS } from '../utils/format';
import useFetch from '../utils/useFetch';

export default function Requests() {
  const { isDRH, hasDossier } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const scope = params.get('scope') || 'todo';
  const [filters, setFilters] = useState({ q: '', status: '', category: '', overdue: '' });
  const [debounced, setDebounced] = useState(filters);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  useEffect(() => { const id = setTimeout(() => { setDebounced(filters); setPage(1); }, 300); return () => clearTimeout(id); }, [filters]);
  const { data, loading } = useFetch(`/requests${qs({ ...debounced, scope, page, limit: 20 })}`);
  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });

  return (
    <>
      <PageHeader title="Demandes et actes" subtitle="Circuits de validation paramétrables : congés, mutations, avancements, nominations, positions…">
        {hasDossier && <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> Nouvelle demande</button>}
      </PageHeader>
      <Tabs value={scope} onChange={(v) => { setParams({ scope: v }); setPage(1); }} tabs={[
        { value: 'todo', label: 'À valider' },
        hasDossier && { value: 'mine', label: 'Mes demandes' },
        isDRH && { value: 'institution', label: 'Mon institution' },
      ]} />
      <div className="card toolbar">
        <div className="search"><Search size={16} /><input placeholder="Référence, objet, agent…" value={filters.q} onChange={set('q')} /></div>
        <select value={filters.category} onChange={set('category')} aria-label="Catégorie"><option value="">Toutes catégories</option>
          {Object.entries(CATEGORY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        {scope !== 'todo' && <select value={filters.status} onChange={set('status')} aria-label="Statut"><option value="">Tous statuts</option>
          {Object.entries(REQUEST_STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>}
        <label className="check"><input type="checkbox" checked={filters.overdue === '1'} onChange={(e) => setFilters({ ...filters, overdue: e.target.checked ? '1' : '' })} /> Délai dépassé</label>
      </div>
      {loading && !data && <Loader />}
      {data?.data.length === 0 && <Empty>{scope === 'todo' ? 'Aucune demande en attente de votre validation' : 'Aucune demande'}</Empty>}
      {data?.data.length > 0 && (
        <div className="card table-wrap">
          <table className="table clickable-rows">
            <thead><tr><th>Référence</th><th>Demande</th><th>Agent</th><th>Étape du circuit</th><th>Échéance</th><th>Statut</th></tr></thead>
            <tbody>
              {data.data.map((r) => (
                <tr key={r.id} onClick={() => navigate(`/requests/${r.id}`)}>
                  <td><b className="mono">{r.reference}</b><small className="block"><Badge map={PRIORITY} value={r.priority} /></small></td>
                  <td><b>{r.type_name}</b><small className="block muted">{r.title}</small></td>
                  <td>{r.employee_name}<small className="block muted">{r.institution_sigle} · {r.employee_structure_name}</small></td>
                  <td>
                    <small>{r.current_step}/{r.total_steps} · {r.current_step_name}</small>
                    <div className="progress slim"><div className="progress-fill tone-primary" style={{ width: `${(r.current_step / r.total_steps) * 100}%` }} /></div>
                    {r.can_act && <span className="badge badge-danger">À vous d’agir</span>}
                  </td>
                  <td className={r.step_overdue ? 'text-danger' : ''}>{r.step_overdue && <AlertTriangle size={14} />} {date(r.step_due_date)}
                    <small className="block muted">global : {date(r.due_date)}</small></td>
                  <td><Badge map={REQUEST_STATUS} value={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pagination page={page} limit={data.limit} total={data.total} onPage={setPage} />}
      {creating && <RequestForm onClose={() => setCreating(false)} />}
    </>
  );
}
