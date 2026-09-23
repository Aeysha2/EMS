import { Download, Printer } from 'lucide-react';
import { useState } from 'react';
import { BarChart, ColumnChart, Donut, Loader, PageHeader, Tabs } from '../components/ui';
import { qs } from '../services/api';
import { exportCSV, LEAVE_STATUS, LEAVE_TYPES, MONTHS, money, PROJECT_STATUS } from '../utils/format';
import useFetch from '../utils/useFetch';

const TONES = ['primary', 'success', 'warning', 'danger', 'info', 'purple'];

function DepartmentsReport() {
  const { data } = useFetch('/reports/departments');
  if (!data) return <Loader />;
  return (
    <>
      <div className="grid-2">
        <div className="card"><h3>Effectif par département</h3><BarChart data={data.map((d) => ({ label: d.code || d.name, value: d.employees }))} /></div>
        <div className="card"><h3>Masse salariale mensuelle</h3><BarChart format={money} tone="warning" data={data.map((d) => ({ label: d.code || d.name, value: d.monthly_salaries }))} /></div>
      </div>
      <div className="card table-wrap">
        <div className="card-head"><h3>Rapport par département</h3>
          <button type="button" className="btn btn-sm" onClick={() => exportCSV('rapport-departements.csv', [
            { label: 'Département', key: 'name' }, { label: 'Responsable', key: 'manager_name' }, { label: 'Effectif', key: 'employees' },
            { label: 'Actifs', key: 'active' }, { label: 'Salaires mensuels', key: 'monthly_salaries' }, { label: 'Salaire moyen', key: 'avg_salary' },
            { label: 'Budget', key: 'budget' }, { label: 'Utilisation budget %', key: 'budget_usage' }, { label: 'Note moyenne', key: 'avg_rating' },
            { label: 'Dossiers ouverts', key: 'open_projects' },
          ], data)}><Download size={14} /> CSV</button>
        </div>
        <table className="table">
          <thead><tr><th>Département</th><th>Responsable</th><th className="num">Effectif</th><th className="num">Salaire moyen</th>
            <th className="num">Masse annuelle</th><th className="num">Budget</th><th className="num">% budget</th><th className="num">Note moy.</th><th className="num">Dossiers</th></tr></thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.id}><td><b>{d.name}</b></td><td>{d.manager_name || '—'}</td><td className="num">{d.employees}</td>
                <td className="num">{money(d.avg_salary)}</td><td className="num">{money(d.annual_salaries)}</td><td className="num">{money(d.budget)}</td>
                <td className={`num ${d.budget_usage > 100 ? 'text-danger' : ''}`}>{d.budget_usage ?? '—'} %</td>
                <td className="num">{d.avg_rating || '—'}</td><td className="num">{d.open_projects}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function PayrollReport() {
  const [year, setYear] = useState(new Date().getFullYear());
  const { data } = useFetch(`/reports/payroll?year=${year}`);
  return (
    <>
      <div className="card toolbar"><label className="inline">Année <input type="number" value={year} onChange={(e) => setYear(e.target.value)} style={{ width: 100 }} /></label></div>
      {!data ? <Loader /> : (
        <>
          <div className="card">
            <h3>Évolution mensuelle de la paie {year}</h3>
            <ColumnChart height={200} data={data.months.map((m) => ({ label: MONTHS[m.month - 1].slice(0, 3), a: m.gross, b: m.net }))}
              series={[{ key: 'a', label: 'Brut', tone: 'primary' }, { key: 'b', label: 'Net', tone: 'success' }]} />
          </div>
          <div className="grid-2">
            <div className="card table-wrap">
              <h3>Détail mensuel</h3>
              <table className="table">
                <thead><tr><th>Mois</th><th className="num">Bulletins</th><th className="num">Brut</th><th className="num">Impôt</th><th className="num">Net</th></tr></thead>
                <tbody>{data.months.map((m) => <tr key={m.month}><td>{MONTHS[m.month - 1]}</td><td className="num">{m.slips}</td><td className="num">{money(m.gross)}</td><td className="num">{money(m.tax)}</td><td className="num"><b>{money(m.net)}</b></td></tr>)}</tbody>
              </table>
            </div>
            <div className="card"><h3>Net versé par département</h3><BarChart format={money} data={data.byDepartment.map((d) => ({ label: d.department, value: d.net }))} /></div>
          </div>
        </>
      )}
    </>
  );
}

function LeavesReport() {
  const [year, setYear] = useState(new Date().getFullYear());
  const { data } = useFetch(`/reports/leaves?year=${year}`);
  return (
    <>
      <div className="card toolbar"><label className="inline">Année <input type="number" value={year} onChange={(e) => setYear(e.target.value)} style={{ width: 100 }} /></label></div>
      {!data ? <Loader /> : (
        <div className="grid-2">
          <div className="card table-wrap">
            <h3>Demandes par type et statut</h3>
            <table className="table">
              <thead><tr><th>Type</th><th>Statut</th><th className="num">Demandes</th><th className="num">Jours</th></tr></thead>
              <tbody>{data.byType.map((r) => <tr key={r.leave_type + r.status}><td>{LEAVE_TYPES[r.leave_type]}</td><td>{LEAVE_STATUS[r.status][0]}</td><td className="num">{r.requests}</td><td className="num">{r.days}</td></tr>)}</tbody>
            </table>
          </div>
          <div className="card"><h3>Jours de congé approuvés par département</h3><BarChart tone="info" data={data.byDepartment.map((d) => ({ label: d.department, value: d.days }))} /></div>
        </div>
      )}
    </>
  );
}

function ProjectsReport() {
  const [range, setRange] = useState({ from: '', to: '' });
  const { data } = useFetch(`/reports/projects${qs(range)}`);
  return (
    <>
      <div className="card toolbar">
        <label className="inline">Déposés du <input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></label>
        <label className="inline">au <input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></label>
      </div>
      {!data ? <Loader /> : (
        <>
          <div className="grid-2">
            <div className="card"><h3>Dossiers par statut</h3>
              <Donut data={data.byStatus.map((s) => ({ label: PROJECT_STATUS[s.status][0], value: s.count, tone: PROJECT_STATUS[s.status][1] }))} />
            </div>
            <div className="card"><h3>Dossiers par mode de dépôt</h3>
              <Donut data={data.byDeposit.map((d, i) => ({ label: d.name, value: d.count, tone: TONES[i % TONES.length] }))} />
            </div>
          </div>
          <div className="card"><h3>Dépôts et clôtures par mois</h3>
            <ColumnChart data={data.monthly.map((m) => ({ label: m.month, a: m.deposited, b: m.completed }))}
              series={[{ key: 'a', label: 'Déposés', tone: 'primary' }, { key: 'b', label: 'Clôturés', tone: 'success' }]} />
          </div>
          <div className="grid-2">
            <div className="card table-wrap"><h3>Par type de demande</h3>
              <table className="table">
                <thead><tr><th>Type</th><th className="num">Dossiers</th><th className="num">Clôturés</th><th className="num">Délai moyen</th><th className="num">Délai cible</th><th className="num">En retard</th></tr></thead>
                <tbody>{data.byType.map((t) => <tr key={t.name}><td>{t.name}</td><td className="num">{t.count}</td><td className="num">{t.completed}</td>
                  <td className={`num ${t.avg_days > t.sla_days ? 'text-danger' : ''}`}>{t.avg_days ?? '—'} j</td><td className="num">{t.sla_days} j</td>
                  <td className={`num ${t.overdue ? 'text-danger' : ''}`}>{t.overdue}</td></tr>)}</tbody>
              </table>
            </div>
            <div className="card table-wrap"><h3>Charge des agents traitants</h3>
              <table className="table">
                <thead><tr><th>Agent</th><th className="num">En cours</th><th className="num">Clôturés</th><th className="num">En retard</th></tr></thead>
                <tbody>{data.byAgent.map((a) => <tr key={a.id}><td>{a.full_name}<small className="block muted">{a.department_name}</small></td>
                  <td className="num">{a.open}</td><td className="num">{a.completed}</td><td className={`num ${a.overdue ? 'text-danger' : ''}`}>{a.overdue}</td></tr>)}</tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function AnalyticsReport() {
  const { data } = useFetch('/reports/analytics');
  if (!data) return <Loader />;
  return (
    <div className="grid-2">
      <div className="card"><h3>Ancienneté</h3><BarChart tone="info" data={data.seniority.map((s) => ({ label: s.bucket, value: s.count }))} /></div>
      <div className="card"><h3>Recrutements par année</h3><ColumnChart data={data.hires.map((h) => ({ label: h.year, a: h.hires }))} series={[{ key: 'a', label: 'Recrutements', tone: 'primary' }]} /></div>
      <div className="card"><h3>Répartition par grade</h3><BarChart tone="purple" data={data.grades.map((g) => ({ label: g.grade, value: g.count }))} /></div>
      <div className="card"><h3>Statut des agents</h3><Donut data={data.status.map((s, i) => ({ label: s.status, value: s.count, tone: TONES[i % TONES.length] }))} /></div>
    </div>
  );
}

export default function Reports() {
  const [tab, setTab] = useState('departments');
  return (
    <>
      <PageHeader title="Rapports & analyses" subtitle="Indicateurs RH, paie, congés et dossiers">
        <button type="button" className="btn" onClick={() => window.print()}><Printer size={16} /> Imprimer</button>
      </PageHeader>
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'departments', label: 'Départements' }, { value: 'payroll', label: 'Paie' }, { value: 'leaves', label: 'Congés' },
        { value: 'projects', label: 'Dossiers' }, { value: 'analytics', label: 'Analyses RH' },
      ]} />
      {tab === 'departments' && <DepartmentsReport />}
      {tab === 'payroll' && <PayrollReport />}
      {tab === 'leaves' && <LeavesReport />}
      {tab === 'projects' && <ProjectsReport />}
      {tab === 'analytics' && <AnalyticsReport />}
    </>
  );
}
