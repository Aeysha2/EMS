import { Download, Lock, Palmtree, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import CheckInCard from '../components/CheckInCard';
import { Badge, Empty, Field, Loader, Modal, PageHeader, StatCard, Tabs } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api, { qs } from '../services/api';
import { ATTENDANCE_SOURCE, ATTENDANCE_STATUS, date, exportCSV, LEAVE_STATUS, MONTHS, pct, time, todayISO } from '../utils/format';
import useFetch from '../utils/useFetch';

function ApplyModal({ types, balances, onClose, onDone }) {
  const toast = useToast();
  const [form, setForm] = useState({ leave_type: 'annuel', start_date: todayISO(), end_date: todayISO(), reason: '', destination: '' });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const type = types.find((t) => t.code === form.leave_type);
  const bal = balances.find((b) => b.leave_type === form.leave_type);
  const submit = async (e) => {
    e.preventDefault();
    try { const r = await api.post('/leaves', form); toast.success(`Demande ${r.reference} transmise à votre supérieur`); onDone(); } catch (err) { toast.error(err); }
  };
  return (
    <Modal title="Demande d’absence" onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>Annuler</button><button form="leave-form" className="btn btn-primary">Envoyer</button></>}>
      <form id="leave-form" className="form-grid" onSubmit={submit}>
        <Field label="Type" full><select value={form.leave_type} onChange={set('leave_type')}>{types.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}</select></Field>
        <Field label="Du"><input type="date" required value={form.start_date} onChange={set('start_date')} /></Field>
        <Field label="Au"><input type="date" required min={form.start_date} value={form.end_date} onChange={set('end_date')} /></Field>
        {form.leave_type === 'mission' && <Field label="Destination *" full><input required value={form.destination} onChange={set('destination')} /></Field>}
        <Field label="Motif" full><textarea rows={2} value={form.reason} onChange={set('reason')} /></Field>
        <div className="field-full alert alert-info small">
          {type?.business_days ? 'Décompte en jours ouvrés.' : 'Décompte en jours calendaires.'}
          {bal && <> Solde disponible : <b>{Number(bal.available)} j</b>.</>}
          {type?.requires_document && <> Un justificatif sera à joindre à la demande.</>}
        </div>
      </form>
    </Modal>
  );
}

function LeavesTable({ rows, showAgent, onCancel }) {
  if (!rows) return <Loader />;
  if (!rows.length) return <Empty>Aucune absence</Empty>;
  return (
    <div className="card table-wrap">
      <table className="table">
        <thead><tr>{showAgent && <th>Agent</th>}<th>Type</th><th>Période</th><th className="num">Jours</th><th>Circuit</th><th>Statut</th><th /></tr></thead>
        <tbody>{rows.map((l) => (
          <tr key={l.id}>
            {showAgent && <td><b>{l.full_name}</b><small className="block muted">{l.structure_name}</small></td>}
            <td>{l.label}{l.destination && <small className="block muted">{l.destination}</small>}</td>
            <td>{date(l.start_date)} → {date(l.end_date)}</td><td className="num">{l.days}</td>
            <td>{l.reference && <Link to={`/requests/${l.request_id}`} className="link mono small">{l.reference}</Link>}
              {l.status === 'pending' && <small className="block muted">Étape {l.current_step}/{l.total_steps} : {l.step_name}</small>}</td>
            <td><Badge map={LEAVE_STATUS} value={l.status} /></td>
            <td>{onCancel && ['pending', 'approved'].includes(l.status) && (l.status === 'pending' || l.start_date > todayISO())
              && <button type="button" className="btn btn-sm" onClick={() => onCancel(l)}><X size={14} /> Annuler</button>}</td>
          </tr>))}</tbody>
      </table>
    </div>
  );
}

function Report({ scope }) {
  const now = new Date();
  const [p, setP] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const { data } = useFetch(`/attendance/report${qs({ ...p, scope })}`);
  return (
    <>
      <div className="card toolbar">
        <select value={p.month} onChange={(e) => setP({ ...p, month: e.target.value })} aria-label="Mois">{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
        <input type="number" value={p.year} onChange={(e) => setP({ ...p, year: e.target.value })} style={{ width: 100 }} aria-label="Année" />
        {data && <span className="badge badge-danger">Absentéisme : {pct(data.absenteeism_rate)}</span>}
        {data && <button type="button" className="btn" onClick={() => exportCSV(`presences-${p.year}-${p.month}.csv`, [
          { label: 'Identifiant', key: 'sigrh_id' }, { label: 'Agent', key: 'full_name' }, { label: 'Structure', key: 'structure_name' },
          { label: 'Présent', key: 'present_days' }, { label: 'Retards', key: 'late_days' }, { label: 'Absences', key: 'absent_days' },
          { label: 'Absences autorisées', key: 'leave_days' }, { label: 'Pointages biométriques', key: 'biometric_punches' },
          { label: 'Heures', key: 'total_hours' }], data.rows)}><Download size={16} /> CSV</button>}
      </div>
      {!data ? <Loader /> : (
        <div className="card table-wrap">
          <table className="table"><thead><tr><th>Agent</th><th>Structure</th><th className="num">Présent</th><th className="num">Retards</th><th className="num">Absences</th>
            <th className="num">Autorisées</th><th className="num">Biométrie</th><th className="num">Heures</th></tr></thead>
            <tbody>{data.rows.map((r) => <tr key={r.id}><td><b>{r.full_name}</b> <small className="muted mono">{r.sigrh_id}</small></td><td>{r.structure_name}</td>
              <td className="num">{r.present_days}</td><td className="num">{r.late_days}</td><td className={`num ${r.absent_days > 2 ? 'text-danger' : ''}`}>{r.absent_days}</td>
              <td className="num">{r.leave_days}</td><td className="num">{r.biometric_punches}</td><td className="num">{Math.round(r.total_hours)}</td></tr>)}</tbody></table>
        </div>
      )}
    </>
  );
}

export default function Absences() {
  const { isDRH, isChef, hasDossier } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || (hasDossier ? 'mine' : 'institution');
  const [applying, setApplying] = useState(false);
  const { data: types } = useFetch('/leaves/types');
  const balance = useFetch(hasDossier ? '/leaves/balance' : null);
  const mine = useFetch(tab === 'mine' ? '/leaves?scope=mine' : null);
  const team = useFetch(tab === 'team' ? '/leaves?scope=team' : null);
  const inst = useFetch(tab === 'institution' ? '/leaves?scope=institution' : null);
  const punches = useFetch(tab === 'pointage' ? '/attendance?scope=mine' : null);

  const cancel = async (l) => {
    if (!window.confirm('Annuler cette absence ?')) return;
    try { await api.patch(`/leaves/${l.id}/cancel`); toast.success('Absence annulée'); mine.reload(); balance.reload(); } catch (err) { toast.error(err); }
  };
  const closeDay = async () => {
    const d = window.prompt('Clôturer la journée (absents et absences autorisées) pour la date :', todayISO());
    if (!d) return;
    try { const r = await api.post('/attendance/close-day', { date: d }); toast.success(`${r.absent} absent(s) enregistré(s) et notifié(s)`); } catch (err) { toast.error(err); }
  };

  return (
    <>
      <PageHeader title="Absences et présences" subtitle="Congés, permissions, missions, maladie — pointage portail, mobile et biométrique">
        {isDRH && <button type="button" className="btn btn-warning" onClick={closeDay}><Lock size={16} /> Clôturer une journée</button>}
        {hasDossier && <button type="button" className="btn btn-primary" onClick={() => setApplying(true)}><Plus size={16} /> Demander une absence</button>}
      </PageHeader>
      {balance.data && (
        <div className="stats small">
          {balance.data.balances.map((b) => (
            <StatCard key={b.leave_type} icon={Palmtree} tone="success" label={b.label} value={`${Number(b.available)} j disponibles`}
              sub={`${Number(b.allotted)} j alloués · ${Number(b.used)} pris · ${Number(b.pending)} en attente`} />
          ))}
        </div>
      )}
      <Tabs value={tab} onChange={(v) => setParams({ tab: v })} tabs={[
        hasDossier && { value: 'mine', label: 'Mes absences' },
        hasDossier && { value: 'pointage', label: 'Mon pointage' },
        isChef && { value: 'team', label: 'Mon équipe' },
        isDRH && { value: 'institution', label: 'Mon institution' },
        (isDRH || isChef) && { value: 'report', label: 'Rapport mensuel' },
      ]} />
      {tab === 'mine' && <LeavesTable rows={mine.data} onCancel={cancel} />}
      {tab === 'team' && <LeavesTable rows={team.data} showAgent />}
      {tab === 'institution' && <LeavesTable rows={inst.data} showAgent />}
      {tab === 'report' && <Report scope={isDRH ? 'institution' : 'team'} />}
      {tab === 'pointage' && (
        <>
          <CheckInCard onChange={punches.reload} />
          {!punches.data ? <Loader /> : (
            <div className="card table-wrap"><table className="table">
              <thead><tr><th>Date</th><th>Arrivée</th><th>Départ</th><th className="num">Heures</th><th>Source</th><th>Statut</th></tr></thead>
              <tbody>{punches.data.map((a) => <tr key={a.id}><td>{date(a.work_date)}</td><td>{time(a.check_in)}</td><td>{time(a.check_out)}</td>
                <td className="num">{a.working_hours}</td><td>{ATTENDANCE_SOURCE[a.source]}{a.device_id && <small className="block muted">{a.device_id}</small>}</td>
                <td><Badge map={ATTENDANCE_STATUS} value={a.status} /></td></tr>)}</tbody></table></div>
          )}
        </>
      )}
      {applying && types && <ApplyModal types={types} balances={balance.data?.balances || []} onClose={() => setApplying(false)}
        onDone={() => { setApplying(false); mine.reload(); balance.reload(); setParams({ tab: 'mine' }); }} />}
    </>
  );
}
