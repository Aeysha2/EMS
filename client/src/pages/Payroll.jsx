import { CheckCircle2, Download, Eye, FileDown, Play, Trash2, Wallet } from 'lucide-react';
import { useState } from 'react';
import { Empty, Field, Loader, Modal, PageHeader, StatCard } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api, { download, qs } from '../services/api';
import { exportCSV, MONTHS, money } from '../utils/format';
import useFetch from '../utils/useFetch';

function GenerateModal({ onClose, onDone }) {
  const toast = useToast();
  const now = new Date();
  const [form, setForm] = useState({ year: now.getFullYear(), month: now.getMonth() + 1, overwrite: false });
  const [bonuses, setBonuses] = useState({});
  const [deductions, setDeductions] = useState({});
  const [busy, setBusy] = useState(false);
  const { data: emps } = useFetch('/employees?limit=100&status=active&sort=name');

  const run = async () => {
    setBusy(true);
    try {
      const r = await api.post('/payroll/generate', { ...form, bonuses, deductions });
      toast.success(`${r.generated} bulletin(s) générés${r.skipped ? `, ${r.skipped} déjà existant(s)` : ''}`);
      onDone({ year: form.year, month: form.month });
    } catch (err) { toast.error(err); } finally { setBusy(false); }
  };

  return (
    <Modal wide title="Générer la paie" onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>Annuler</button>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={run}><Play size={16} /> Lancer le calcul</button></>}>
      <div className="form-grid">
        <Field label="Mois"><select value={form.month} onChange={(e) => setForm({ ...form, month: Number(e.target.value) })}>
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></Field>
        <Field label="Année"><input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: Number(e.target.value) })} /></Field>
        <label className="check field-full">
          <input type="checkbox" checked={form.overwrite} onChange={(e) => setForm({ ...form, overwrite: e.target.checked })} />
          Recalculer les bulletins déjà générés (non payés)
        </label>
      </div>
      <p className="muted small">
        Le calcul est automatique : salaire de base + indemnités (logement, transport) + heures supplémentaires pointées + primes,
        moins retenues (congés sans solde, cotisation sociale, autres) et impôt progressif. Saisissez ci-dessous les primes et retenues exceptionnelles.
      </p>
      <div className="table-wrap scroll-y">
        <table className="table">
          <thead><tr><th>Agent</th><th className="num">Salaire de base</th><th>Prime</th><th>Autre retenue</th></tr></thead>
          <tbody>
            {emps?.data.map((e) => (
              <tr key={e.id}>
                <td>{e.full_name}<small className="block muted">{e.employee_code}</small></td>
                <td className="num">{money(e.salary)}</td>
                <td><input type="number" min="0" step="1000" className="input-sm" value={bonuses[e.id] || ''} onChange={(ev) => setBonuses({ ...bonuses, [e.id]: ev.target.value })} /></td>
                <td><input type="number" min="0" step="1000" className="input-sm" value={deductions[e.id] || ''} onChange={(ev) => setDeductions({ ...deductions, [e.id]: ev.target.value })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

function SlipModal({ slip, onClose }) {
  const d = slip.details || {};
  const rows = [
    ['Salaire de base', slip.basic], ['Indemnité de logement', d.housing], ['Indemnité de transport', d.transport],
    [`Heures supplémentaires (${d.overtimeHours} h)`, slip.overtime_pay], ['Primes', slip.bonuses],
  ];
  const ded = [
    [`Congé sans solde (${d.unpaidLeaveDays} j)`, d.unpaidLeave], ['Cotisation sociale / retraite', d.socialSecurity],
    ['Autres retenues', d.otherDeductions], ['Impôt sur le revenu', slip.tax],
  ];
  return (
    <Modal title={`Bulletin — ${slip.full_name} — ${MONTHS[slip.period_month - 1]} ${slip.period_year}`} onClose={onClose}
      footer={<button type="button" className="btn btn-primary" onClick={() => download(`/payroll/${slip.id}/pdf`)}><FileDown size={16} /> Télécharger le PDF</button>}>
      <table className="table slip">
        <tbody>
          <tr className="section"><td colSpan={2}>Gains</td></tr>
          {rows.map(([k, v]) => <tr key={k}><td>{k}</td><td className="num">{money(v)}</td></tr>)}
          <tr className="total"><td>Salaire brut</td><td className="num">{money(slip.gross)}</td></tr>
          <tr className="section"><td colSpan={2}>Retenues</td></tr>
          {ded.map(([k, v]) => <tr key={k}><td>{k}</td><td className="num">− {money(v)}</td></tr>)}
          <tr className="net"><td>Net à payer</td><td className="num">{money(slip.net)}</td></tr>
        </tbody>
      </table>
    </Modal>
  );
}

export default function Payroll() {
  const { isHR } = useAuth();
  const toast = useToast();
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const [filters, setFilters] = useState(isHR ? { year: prev.getFullYear(), month: prev.getMonth() + 1, department: '' } : {});
  const [generating, setGenerating] = useState(false);
  const [slip, setSlip] = useState(null);
  const { data, loading, reload } = useFetch(`/payroll${qs(filters)}`);
  const { data: departments } = useFetch(isHR ? '/departments' : null);
  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });

  const pay = async (p) => {
    try { await api.patch(`/payroll/${p.id}/pay`); toast.success('Marqué comme payé'); reload(); } catch (err) { toast.error(err); }
  };
  const payAll = async () => {
    const pending = data.filter((p) => p.status === 'processed');
    if (!pending.length || !window.confirm(`Marquer ${pending.length} bulletin(s) comme payés ?`)) return;
    for (const p of pending) await api.patch(`/payroll/${p.id}/pay`).catch(() => null); // eslint-disable-line no-await-in-loop
    toast.success('Salaires marqués comme versés');
    reload();
  };
  const remove = async (p) => {
    if (!window.confirm('Supprimer ce bulletin ?')) return;
    try { await api.del(`/payroll/${p.id}`); reload(); } catch (err) { toast.error(err); }
  };

  const totals = (data || []).reduce((t, p) => ({ gross: t.gross + p.gross, net: t.net + p.net, tax: t.tax + p.tax }), { gross: 0, net: 0, tax: 0 });

  return (
    <>
      <PageHeader title="Paie" subtitle={isHR ? 'Calcul automatique des salaires et bulletins' : 'Mes bulletins de paie'}>
        {isHR && data?.length > 0 && (
          <button type="button" className="btn" onClick={() => exportCSV(`paie-${filters.year}-${filters.month}.csv`, [
            { label: 'ID', key: 'employee_code' }, { label: 'Nom', key: 'full_name' }, { label: 'Département', key: 'department_name' },
            { label: 'Période', value: (p) => `${p.period_month}/${p.period_year}` }, { label: 'Base', key: 'basic' },
            { label: 'Indemnités', key: 'allowances' }, { label: 'Primes', key: 'bonuses' }, { label: 'H. sup.', key: 'overtime_pay' },
            { label: 'Brut', key: 'gross' }, { label: 'Retenues', key: 'deductions' }, { label: 'Impôt', key: 'tax' }, { label: 'Net', key: 'net' },
            { label: 'Statut', key: 'status' },
          ], data)}><Download size={16} /> Export CSV</button>
        )}
        {isHR && data?.some((p) => p.status === 'processed') && <button type="button" className="btn btn-success" onClick={payAll}><CheckCircle2 size={16} /> Tout marquer payé</button>}
        {isHR && <button type="button" className="btn btn-primary" onClick={() => setGenerating(true)}><Play size={16} /> Générer la paie</button>}
      </PageHeader>

      {isHR && (
        <div className="card toolbar">
          <select value={filters.month} onChange={set('month')}><option value="">Tous les mois</option>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
          <input type="number" value={filters.year} onChange={set('year')} style={{ width: 100 }} />
          <select value={filters.department} onChange={set('department')}>
            <option value="">Tous les départements</option>
            {departments?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
      )}

      {isHR && data?.length > 0 && (
        <div className="stats small">
          <StatCard icon={Wallet} label="Masse salariale brute" value={money(totals.gross)} />
          <StatCard icon={Wallet} tone="success" label="Total net à payer" value={money(totals.net)} />
          <StatCard icon={Wallet} tone="warning" label="Impôts retenus" value={money(totals.tax)} />
        </div>
      )}

      {loading && !data && <Loader />}
      {data?.length === 0 && <Empty>Aucun bulletin pour cette période</Empty>}
      {data?.length > 0 && (
        <div className="card table-wrap">
          <table className="table">
            <thead><tr>{isHR && <th>Agent</th>}<th>Période</th><th className="num">Brut</th><th className="num hide-mobile">Retenues</th>
              <th className="num hide-mobile">Impôt</th><th className="num">Net</th><th>Statut</th><th /></tr></thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id}>
                  {isHR && <td><b>{p.full_name}</b><small className="block muted">{p.department_name}</small></td>}
                  <td>{MONTHS[p.period_month - 1]} {p.period_year}</td>
                  <td className="num">{money(p.gross)}</td>
                  <td className="num hide-mobile">{money(p.deductions)}</td>
                  <td className="num hide-mobile">{money(p.tax)}</td>
                  <td className="num"><b>{money(p.net)}</b></td>
                  <td><span className={`badge badge-${p.status === 'paid' ? 'success' : 'warning'}`}>{p.status === 'paid' ? 'Payé' : 'Traité'}</span></td>
                  <td className="actions">
                    <button type="button" className="icon-btn" title="Détails" onClick={() => setSlip(p)}><Eye size={16} /></button>
                    <button type="button" className="icon-btn" title="Télécharger" onClick={() => download(`/payroll/${p.id}/pdf`)}><FileDown size={16} /></button>
                    {isHR && p.status === 'processed' && <button type="button" className="icon-btn" title="Marquer payé" onClick={() => pay(p)}><CheckCircle2 size={16} /></button>}
                    {isHR && p.status === 'processed' && <button type="button" className="icon-btn danger" title="Supprimer" onClick={() => remove(p)}><Trash2 size={16} /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {generating && <GenerateModal onClose={() => setGenerating(false)} onDone={(period) => { setGenerating(false); setFilters((f) => ({ ...f, ...period })); reload(); }} />}
      {slip && <SlipModal slip={slip} onClose={() => setSlip(null)} />}
    </>
  );
}
