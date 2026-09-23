import { Download, Filter, Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import EmployeeForm from '../components/EmployeeForm';
import { Avatar, Badge, Empty, ErrorBox, Loader, PageHeader, Pagination } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { qs } from '../services/api';
import { date, EMPLOYEE_STATUS, exportCSV, money } from '../utils/format';
import useFetch from '../utils/useFetch';

export default function Employees() {
  const { isHR } = useAuth();
  const [filters, setFilters] = useState({ q: '', department: '', status: '', designation: '', joinedFrom: '', joinedTo: '', minSalary: '', maxSalary: '', sort: 'name', order: 'asc' });
  const [debounced, setDebounced] = useState(filters);
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [editing, setEditing] = useState(null);
  const [view, setView] = useState('table');

  useEffect(() => {
    const id = setTimeout(() => { setDebounced(filters); setPage(1); }, 300);
    return () => clearTimeout(id);
  }, [filters]);

  const { data, loading, error, reload } = useFetch(`/employees${qs({ ...debounced, page, limit: 20 })}`);
  const { data: departments } = useFetch('/departments');
  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });

  const exportAll = () => exportCSV('employes.csv', [
    { label: 'ID', key: 'employee_code' }, { label: 'Matricule', key: 'matricule' }, { label: 'Nom', key: 'full_name' },
    { label: 'Département', key: 'department_name' }, { label: 'Fonction', key: 'designation' }, { label: 'Grade', key: 'grade' },
    { label: 'Email', key: 'email' }, { label: 'Téléphone', key: 'phone' }, { label: 'Entrée', key: 'date_of_joining' },
    ...(isHR ? [{ label: 'Salaire', key: 'salary' }] : []), { label: 'Statut', key: 'status' },
  ], data?.data || []);

  return (
    <>
      <PageHeader title="Employés" subtitle={isHR ? 'Gestion des dossiers du personnel' : 'Annuaire du personnel'}>
        <button type="button" className="btn" onClick={exportAll}><Download size={16} /> Export CSV</button>
        {isHR && <button type="button" className="btn btn-primary" onClick={() => setEditing({})}><Plus size={16} /> Nouvel employé</button>}
      </PageHeader>

      <div className="card toolbar">
        <div className="search">
          <Search size={16} />
          <input placeholder="Rechercher par nom, ID, matricule, email, fonction, département…" value={filters.q} onChange={set('q')} />
        </div>
        <select value={filters.department} onChange={set('department')}>
          <option value="">Tous les départements</option>
          {departments?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select value={filters.status} onChange={set('status')}>
          <option value="">Tous les statuts</option>
          {Object.entries(EMPLOYEE_STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <button type="button" className={`btn ${showFilters ? 'btn-primary' : ''}`} onClick={() => setShowFilters((s) => !s)}><Filter size={16} /> Filtres avancés</button>
        <div className="seg hide-mobile">
          <button type="button" className={view === 'table' ? 'active' : ''} onClick={() => setView('table')}>Tableau</button>
          <button type="button" className={view === 'cards' ? 'active' : ''} onClick={() => setView('cards')}>Cartes</button>
        </div>
      </div>

      {showFilters && (
        <div className="card form-grid">
          <label className="field"><span>Fonction</span><input value={filters.designation} onChange={set('designation')} /></label>
          <label className="field"><span>Entrée après le</span><input type="date" value={filters.joinedFrom} onChange={set('joinedFrom')} /></label>
          <label className="field"><span>Entrée avant le</span><input type="date" value={filters.joinedTo} onChange={set('joinedTo')} /></label>
          {isHR && <label className="field"><span>Salaire min.</span><input type="number" value={filters.minSalary} onChange={set('minSalary')} /></label>}
          {isHR && <label className="field"><span>Salaire max.</span><input type="number" value={filters.maxSalary} onChange={set('maxSalary')} /></label>}
          <label className="field"><span>Trier par</span>
            <select value={filters.sort} onChange={set('sort')}>
              <option value="name">Nom</option><option value="code">ID</option><option value="department">Département</option>
              <option value="designation">Fonction</option><option value="joining">Date d’entrée</option>
              {isHR && <option value="salary">Salaire</option>}
            </select>
          </label>
          <label className="field"><span>Ordre</span>
            <select value={filters.order} onChange={set('order')}><option value="asc">Croissant</option><option value="desc">Décroissant</option></select>
          </label>
        </div>
      )}

      {error && <ErrorBox error={error} onRetry={reload} />}
      {loading && !data && <Loader />}
      {data && data.data.length === 0 && <Empty>Aucun employé ne correspond à la recherche</Empty>}

      {data && data.data.length > 0 && view === 'table' && (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr><th>Employé</th><th>ID</th><th>Département</th><th>Fonction</th><th className="hide-mobile">Entrée</th>
                {isHR && <th className="num">Salaire</th>}<th>Statut</th></tr>
            </thead>
            <tbody>
              {data.data.map((e) => (
                <tr key={e.id}>
                  <td><Link to={`/employees/${e.id}`} className="person"><Avatar name={e.full_name} size={30} /><span><b>{e.full_name}</b><small>{e.email}</small></span></Link></td>
                  <td>{e.employee_code}</td>
                  <td>{e.department_name || '—'}</td>
                  <td>{e.designation || '—'}</td>
                  <td className="hide-mobile">{date(e.date_of_joining)}</td>
                  {isHR && <td className="num">{money(e.salary)}</td>}
                  <td><Badge map={EMPLOYEE_STATUS} value={e.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.data.length > 0 && view === 'cards' && (
        <div className="card-grid">
          {data.data.map((e) => (
            <Link to={`/employees/${e.id}`} key={e.id} className="employee-card">
              <Avatar name={e.full_name} size={48} />
              <b>{e.full_name}</b>
              <span className="muted">{e.designation || '—'}</span>
              <span className="small">{e.department_name || 'Sans département'}</span>
              <Badge map={EMPLOYEE_STATUS} value={e.status} />
              <small className="muted">{e.employee_code}</small>
            </Link>
          ))}
        </div>
      )}

      {data && <Pagination page={page} limit={data.limit} total={data.total} onPage={setPage} />}

      {editing && (
        <EmployeeForm employee={editing.id ? editing : null} departments={departments || []}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />
      )}
    </>
  );
}
