import { Download, Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AgentForm from '../components/AgentForm';
import { Avatar, Badge, Empty, ErrorBox, Loader, PageHeader, Pagination, Tabs } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { download, qs } from '../services/api';
import { exportCSV, money, POSITIONS, STATUT_EMPLOI } from '../utils/format';
import useFetch from '../utils/useFetch';

export default function Agents() {
  const { user, isDRH, isChef } = useAuth();
  const [params, setParams] = useSearchParams();
  const defaultScope = isDRH ? 'institution' : isChef ? 'team' : 'directory';
  const scope = params.get('scope') || defaultScope;
  const [filters, setFilters] = useState({ q: '', structure: '', hierarchie: '', position: '', sexe: '', statut: '', biometrie: '' });
  const [debounced, setDebounced] = useState(filters);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => { setDebounced(filters); setPage(1); }, 300);
    return () => clearTimeout(id);
  }, [filters]);
  const { data, loading, error, reload } = useFetch(`/employees${qs({ ...debounced, scope, page, limit: 25 })}`);
  const { data: structures } = useFetch('/structures?flat=1');
  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });
  const full = scope === 'institution';

  const visibleStructures = (structures || []).filter((s) => scope !== 'institution' || s.institution_id === user.institution_id);

  return (
    <>
      <PageHeader title="Agents" subtitle={scope === 'directory' ? 'Annuaire interministériel des agents en fonction'
        : scope === 'team' ? 'Agents des structures que vous dirigez' : `Référentiel des agents — ${user.institution_name}`}>
        {full && data?.data.length > 0 && (
          <button type="button" className="btn" onClick={() => exportCSV('agents.csv', [
            { label: 'Identifiant SIGRH', key: 'sigrh_id' }, { label: 'Matricule solde', key: 'matricule_solde' },
            { label: 'Nom', key: 'full_name' }, { label: 'Sexe', key: 'sexe' }, { label: 'Structure', key: 'structure_name' },
            { label: 'Fonction', key: 'fonction' }, { label: 'Corps', key: 'corps_name' }, { label: 'Hiérarchie', key: 'hierarchie' },
            { label: 'Grade', key: 'grade' }, { label: 'Échelon', key: 'echelon' }, { label: 'Statut', value: (r) => STATUT_EMPLOI[r.statut_emploi] },
            { label: 'Position', value: (r) => POSITIONS[r.position_statutaire]?.[0] }, { label: 'Salaire de base', key: 'salary' },
          ], data.data)}><Download size={16} /> Export CSV</button>
        )}
        {isDRH && <button type="button" className="btn" onClick={() => download('/pilotage/export.xlsx')}><Download size={16} /> Excel</button>}
        {isDRH && <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> Nouvel agent</button>}
      </PageHeader>

      <Tabs value={scope} onChange={(v) => { setParams({ scope: v }); setPage(1); }} tabs={[
        isDRH && { value: 'institution', label: 'Mon institution' },
        isChef && { value: 'team', label: 'Mon équipe' },
        { value: 'directory', label: 'Annuaire interministériel' },
      ]} />

      <div className="card toolbar">
        <div className="search"><Search size={16} />
          <input placeholder={full ? 'Nom, identifiant SIGRH, matricule, email, fonction, structure…' : 'Nom, fonction, structure…'}
            value={filters.q} onChange={set('q')} />
        </div>
        <select value={filters.structure} onChange={set('structure')} aria-label="Structure">
          <option value="">Toutes les structures</option>
          {visibleStructures.map((s) => <option key={s.id} value={s.id}>{scope === 'directory' ? `${s.institution_sigle} — ` : ''}{s.name}</option>)}
        </select>
        <select value={filters.hierarchie} onChange={set('hierarchie')} aria-label="Hiérarchie">
          <option value="">Toutes hiérarchies</option>{['A', 'B', 'C', 'D'].map((h) => <option key={h} value={h}>Hiérarchie {h}</option>)}
        </select>
        {scope !== 'directory' && (
          <>
            <select value={filters.position} onChange={set('position')} aria-label="Position"><option value="">Toutes positions</option>
              {Object.entries(POSITIONS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>
            <select value={filters.sexe} onChange={set('sexe')} aria-label="Sexe"><option value="">F / M</option><option value="F">Femmes</option><option value="M">Hommes</option></select>
            <select value={filters.biometrie} onChange={set('biometrie')} aria-label="Biométrie"><option value="">Biométrie : tous</option><option value="non">Non enrôlés</option></select>
          </>
        )}
      </div>

      {error && <ErrorBox error={error} onRetry={reload} />}
      {loading && !data && <Loader />}
      {data?.data.length === 0 && <Empty>Aucun agent ne correspond</Empty>}
      {data?.data.length > 0 && (
        <div className="card table-wrap">
          <table className="table">
            <thead><tr><th>Agent</th><th>Identifiant</th><th>Structure</th><th>Fonction</th>
              {scope !== 'directory' && <th>Hiér. / grade</th>}{full && <th className="num">Salaire de base</th>}<th>Position</th></tr></thead>
            <tbody>
              {data.data.map((e) => (
                <tr key={e.id}>
                  <td>
                    {scope === 'directory' && e.id !== user.employee_id
                      ? <span className="person"><Avatar name={e.full_name} size={30} /><span><b>{e.full_name}</b><small>{e.email}</small></span></span>
                      : <Link to={`/agents/${e.id}`} className="person"><Avatar name={e.full_name} size={30} /><span><b>{e.full_name}</b><small>{e.email}</small></span></Link>}
                  </td>
                  <td className="mono">{e.sigrh_id}</td>
                  <td>{e.structure_name}<small className="block muted">{e.institution_sigle}</small></td>
                  <td>{e.fonction || '—'}</td>
                  {scope !== 'directory' && <td>{e.hierarchie || '—'} {e.grade && `· ${e.grade}`}{e.echelon && ` · éch. ${e.echelon}`}</td>}
                  {full && <td className="num">{money(e.salary)}</td>}
                  <td><Badge map={POSITIONS} value={e.position_statutaire} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pagination page={page} limit={data.limit} total={data.total} onPage={setPage} />}
      {creating && <AgentForm institutionId={user.institution_id} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); }} />}
    </>
  );
}
