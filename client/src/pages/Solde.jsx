import { AlertTriangle, Calculator, Download, FileDown, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Badge, Empty, Field, Loader, Modal, PageHeader, StatCard, Tabs } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api, { download } from '../services/api';
import { ANOMALY, exportCSV, MONTHS, money, pct, readFile } from '../utils/format';
import useFetch from '../utils/useFetch';

function Payslips({ scope }) {
  const { data } = useFetch(`/solde/payslips?scope=${scope}`);
  if (!data) return <Loader />;
  if (!data.length) return <Empty>Aucun bulletin disponible</Empty>;
  return (
    <div className="card table-wrap">
      <table className="table">
        <thead><tr>{scope === 'institution' && <th>Agent</th>}<th>Période</th><th className="num">Brut</th><th className="num">Retenues</th>
          <th className="num">Impôt</th><th className="num">Net</th><th /></tr></thead>
        <tbody>{data.map((p) => (
          <tr key={p.id}>{scope === 'institution' && <td><b>{p.full_name}</b><small className="block muted">{p.structure_name}</small></td>}
            <td>{MONTHS[p.period_month - 1]} {p.period_year}</td><td className="num">{money(p.gross)}</td><td className="num">{money(p.deductions)}</td>
            <td className="num">{money(p.tax)}</td><td className="num"><b>{money(p.net)}</b></td>
            <td><button type="button" className="icon-btn" title="Télécharger" onClick={() => download(`/solde/payslips/${p.id}/pdf`)}><FileDown size={16} /></button></td></tr>))}</tbody>
      </table>
    </div>
  );
}

function Simulation() {
  const toast = useToast();
  const now = new Date();
  const [form, setForm] = useState({ year: now.getFullYear(), month: now.getMonth() + 1, bonus: 0, otherDeductions: 0 });
  const [res, setRes] = useState(null);
  const run = async (e) => { e.preventDefault(); try { setRes(await api.post('/solde/simulation', form)); } catch (err) { toast.error(err); } };
  return (
    <div className="grid-2">
      <form className="card form-grid" onSubmit={run}>
        <p className="field-full muted small">Simulation des primes et indemnités selon les règles paramétrées. La paie officielle reste calculée par la Solde.</p>
        <Field label="Mois"><select value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></Field>
        <Field label="Année"><input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} /></Field>
        <Field label="Prime exceptionnelle"><input type="number" min="0" value={form.bonus} onChange={(e) => setForm({ ...form, bonus: e.target.value })} /></Field>
        <Field label="Autre retenue"><input type="number" min="0" value={form.otherDeductions} onChange={(e) => setForm({ ...form, otherDeductions: e.target.value })} /></Field>
        <button className="btn btn-primary field-full"><Calculator size={16} /> Simuler</button>
      </form>
      {res && (
        <div className="card"><table className="table slip"><tbody>
          <tr className="section"><td colSpan={2}>Gains</td></tr>
          <tr><td>Salaire de base</td><td className="num">{money(res.basic)}</td></tr>
          <tr><td>Indemnité de logement</td><td className="num">{money(res.details.housing)}</td></tr>
          <tr><td>Indemnité de transport</td><td className="num">{money(res.details.transport)}</td></tr>
          <tr><td>Heures supplémentaires ({res.details.overtimeHours} h)</td><td className="num">{money(res.overtimePay)}</td></tr>
          <tr><td>Primes</td><td className="num">{money(res.bonuses)}</td></tr>
          <tr className="total"><td>Brut</td><td className="num">{money(res.gross)}</td></tr>
          <tr className="section"><td colSpan={2}>Retenues</td></tr>
          <tr><td>Cotisation sociale / pension</td><td className="num">− {money(res.details.socialSecurity)}</td></tr>
          <tr><td>Autres retenues</td><td className="num">− {money(res.details.otherDeductions)}</td></tr>
          <tr><td>Impôt sur le revenu</td><td className="num">− {money(res.tax)}</td></tr>
          <tr className="net"><td>Net estimé</td><td className="num">{money(res.net)}</td></tr>
        </tbody></table></div>
      )}
    </div>
  );
}

function Coherence() {
  const { isPilotage } = useAuth();
  const toast = useToast();
  const { data: imports, reload } = useFetch('/solde/imports');
  const [importId, setImportId] = useState(null);
  const [type, setType] = useState('');
  const [uploading, setUploading] = useState(false);
  useEffect(() => { if (imports?.length && !importId) setImportId(imports[0].id); }, [imports, importId]);
  const { data } = useFetch(importId ? `/solde/imports/${importId}/reconciliation` : null);
  const rows = (data?.anomalies || []).filter((a) => !type || a.type === type);

  return (
    <>
      <div className="card toolbar">
        <label className="inline">État de solde :
          <select value={importId || ''} onChange={(e) => setImportId(e.target.value)}>
            {imports?.map((i) => <option key={i.id} value={i.id}>{String(i.period_month).padStart(2, '0')}/{i.period_year} — {i.source === 'interop' ? 'API Solde' : i.filename} ({i.line_count} lignes)</option>)}
          </select>
        </label>
        {isPilotage && <button type="button" className="btn" onClick={() => setUploading(true)}><Upload size={16} /> Importer un état (CSV)</button>}
        {data && <button type="button" className="btn" onClick={() => exportCSV(`anomalies-solde-${data.summary.period.replace('/', '-')}.csv`, [
          { label: 'Anomalie', value: (a) => ANOMALY[a.type][0] }, { label: 'Matricule solde', key: 'matricule_solde' }, { label: 'Identifiant SIGRH', key: 'sigrh_id' },
          { label: 'Nom', key: 'name' }, { label: 'Institution', key: 'institution' }, { label: 'Montant', key: 'amount' }, { label: 'Détail', key: 'detail' }], data.anomalies)}>
          <Download size={16} /> Exporter les anomalies</button>}
      </div>
      {!imports ? <Loader /> : !imports.length ? <Empty>Aucun état de solde importé</Empty> : !data ? <Loader /> : (
        <>
          <div className="stats small">
            <StatCard icon={AlertTriangle} tone={data.summary.anomalies ? 'danger' : 'success'} label={`Anomalies ${data.summary.period}`} value={data.summary.anomalies} />
            <StatCard icon={AlertTriangle} tone="warning" label="Montant à vérifier" value={money(data.summary.amount_at_risk)} />
            <StatCard icon={AlertTriangle} tone="success" label="Lignes rapprochées sans anomalie" value={pct(data.summary.reconciled_rate)} sub={`${data.summary.lines} lignes · ${money(data.summary.total_net)} net`} />
          </div>
          <div className="chips">
            <button type="button" className={`badge ${!type ? 'badge-info' : 'badge-muted'}`} onClick={() => setType('')}>Toutes ({data.anomalies.length})</button>
            {Object.entries(data.summary.by_type).map(([k, n]) => (
              <button type="button" key={k} className={`badge badge-${type === k ? ANOMALY[k][1] : 'muted'}`} onClick={() => setType(k)}>{ANOMALY[k][0]} ({n})</button>
            ))}
          </div>
          <div className="card table-wrap">
            <table className="table">
              <thead><tr><th>Anomalie</th><th>Agent</th><th>Institution</th><th className="num">Montant</th><th>Détail</th></tr></thead>
              <tbody>{rows.map((a, i) => (
                <tr key={`${a.type}-${a.matricule_solde}-${i}`}><td><Badge map={ANOMALY} value={a.type} /></td>
                  <td><b>{a.name}</b><small className="block muted mono">{a.sigrh_id || '—'} · {a.matricule_solde || '—'}</small></td>
                  <td>{a.institution || '—'}</td><td className="num">{money(a.amount)}</td><td className="small">{a.detail}</td></tr>))}</tbody>
            </table>
          </div>
        </>
      )}
      {uploading && <ImportModal onClose={() => setUploading(false)} onDone={(r) => { setUploading(false); reload(); setImportId(r.id); toast.success(`${r.line_count} lignes importées, ${r.unmatched} non rapprochée(s)`); }} />}
    </>
  );
}

function ImportModal({ onClose, onDone }) {
  const toast = useToast();
  const ref = useRef(null);
  const now = new Date();
  const [form, setForm] = useState({ year: now.getFullYear(), month: now.getMonth() || 12 });
  const submit = async (e) => {
    e.preventDefault();
    const file = ref.current.files?.[0];
    if (!file) return;
    try { onDone(await api.post('/solde/imports', { ...form, filename: file.name, content: await readFile(file) })); } catch (err) { toast.error(err); }
  };
  return (
    <Modal title="Importer un état de paiement de la Solde" onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>Annuler</button><button form="imp-form" className="btn btn-primary">Importer</button></>}>
      <form id="imp-form" className="form-grid" onSubmit={submit}>
        <Field label="Mois"><select value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></Field>
        <Field label="Année"><input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} /></Field>
        <Field label="Fichier CSV" full><input ref={ref} type="file" accept=".csv,text/csv" required /></Field>
        <p className="field-full muted small">Colonnes attendues : <code>matricule_solde;nom;salaire_base;brut;retenues;impot;net</code>. En production, l’état est transmis automatiquement par l’API d’interopérabilité.</p>
      </form>
    </Modal>
  );
}

export default function Solde() {
  const { isDRH, isPilotage, hasDossier } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || (hasDossier ? 'mine' : 'controle');
  return (
    <>
      <PageHeader title="Rémunération" subtitle="Bulletins dématérialisés transmis par la Solde et contrôle de cohérence effectifs / masse salariale" />
      <Tabs value={tab} onChange={(v) => setParams({ tab: v })} tabs={[
        hasDossier && { value: 'mine', label: 'Mes bulletins' },
        hasDossier && { value: 'simulation', label: 'Simulation' },
        isDRH && { value: 'institution', label: 'Bulletins de l’institution' },
        (isDRH || isPilotage) && { value: 'controle', label: 'Contrôle de cohérence Solde' },
      ]} />
      {tab === 'mine' && <Payslips scope="mine" />}
      {tab === 'simulation' && <Simulation />}
      {tab === 'institution' && <Payslips scope="institution" />}
      {tab === 'controle' && <Coherence />}
    </>
  );
}
