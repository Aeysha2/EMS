import { Download, Pencil, UserX } from 'lucide-react';
import { useState } from 'react';
import CheckInCard from '../components/CheckInCard';
import { Badge, Empty, Field, Loader, Modal, PageHeader, Tabs } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api, { qs } from '../services/api';
import { ATTENDANCE_STATUS, date, exportCSV, MONTHS, time, todayISO } from '../utils/format';
import useFetch from '../utils/useFetch';

const toLocalInput = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

function ManualEntry({ record, onClose, onSaved }) {
  const toast = useToast();
  const { data: emps } = useFetch('/employees?limit=100&sort=name');
  const [form, setForm] = useState({
    employee_id: record?.employee_id || '', work_date: record?.work_date || todayISO(),
    check_in: toLocalInput(record?.check_in), check_out: toLocalInput(record?.check_out),
    status: record?.status || '', note: record?.note || '',
  });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    const at = (t) => (t ? new Date(`${form.work_date}T${t}:00`).toISOString() : null);
    try {
      await api.post('/attendance', { ...form, check_in: at(form.check_in), check_out: at(form.check_out), status: form.status || undefined });
      toast.success('Pointage enregistré');
      onSaved();
    } catch (err) { toast.error(err); }
  };
  return (
    <Modal title={record ? 'Corriger le pointage' : 'Saisie manuelle de pointage'} onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>Annuler</button><button form="att-form" className="btn btn-primary">Enregistrer</button></>}>
      <form id="att-form" className="form-grid" onSubmit={submit}>
        <Field label="Employé" full>
          <select required value={form.employee_id} onChange={set('employee_id')} disabled={!!record}>
            <option value="">—</option>
            {emps?.data.map((e) => <option key={e.id} value={e.id}>{e.full_name} ({e.employee_code})</option>)}
          </select>
        </Field>
        <Field label="Date"><input type="date" required value={form.work_date} onChange={set('work_date')} disabled={!!record} /></Field>
        <Field label="Statut">
          <select value={form.status} onChange={set('status')}>
            <option value="">Automatique</option>
            {Object.entries(ATTENDANCE_STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        <Field label="Arrivée"><input type="time" value={form.check_in} onChange={set('check_in')} /></Field>
        <Field label="Départ"><input type="time" value={form.check_out} onChange={set('check_out')} /></Field>
        <Field label="Note" full><input value={form.note} onChange={set('note')} /></Field>
      </form>
    </Modal>
  );
}

function AttendanceTable({ rows, showName, onEdit }) {
  if (!rows) return <Loader />;
  if (!rows.length) return <Empty>Aucun pointage sur la période</Empty>;
  return (
    <div className="card table-wrap">
      <table className="table">
        <thead>
          <tr>{showName && <th>Employé</th>}<th>Date</th><th>Arrivée</th><th>Départ</th><th className="num">Heures</th>
            <th className="num">Heures sup.</th><th>Statut</th>{onEdit && <th />}</tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id}>
              {showName && <td><b>{a.full_name}</b><small className="block muted">{a.department_name}</small></td>}
              <td>{date(a.work_date)}</td><td>{time(a.check_in)}</td><td>{time(a.check_out)}</td>
              <td className="num">{a.working_hours}</td><td className="num">{a.overtime > 0 ? a.overtime : '—'}</td>
              <td><Badge map={ATTENDANCE_STATUS} value={a.status} />{a.latitude && <span title={`${a.latitude}, ${a.longitude}`}> 📍</span>}</td>
              {onEdit && <td><button type="button" className="icon-btn" onClick={() => onEdit(a)} aria-label="Corriger"><Pencil size={15} /></button></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MonthlyReport() {
  const now = new Date();
  const [period, setPeriod] = useState({ year: now.getFullYear(), month: now.getMonth() + 1, department: '' });
  const { isHR } = useAuth();
  const { data: departments } = useFetch(isHR ? '/departments' : null);
  const { data, loading } = useFetch(`/attendance/report${qs(period)}`);
  const set = (k) => (e) => setPeriod({ ...period, [k]: e.target.value });

  const exportIt = () => exportCSV(`presences-${period.year}-${period.month}.csv`, [
    { label: 'ID', key: 'employee_code' }, { label: 'Nom', key: 'full_name' }, { label: 'Département', key: 'department_name' },
    { label: 'Jours présents', key: 'present_days' }, { label: 'Retards', key: 'late_days' }, { label: 'Absences', key: 'absent_days' },
    { label: 'Congés', key: 'leave_days' }, { label: 'Heures', key: 'total_hours' }, { label: 'Heures sup.', key: 'overtime_hours' },
  ], data?.rows || []);

  return (
    <>
      <div className="card toolbar">
        <select value={period.month} onChange={set('month')}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
        <input type="number" value={period.year} onChange={set('year')} style={{ width: 100 }} />
        {isHR && (
          <select value={period.department} onChange={set('department')}>
            <option value="">Tous les départements</option>
            {departments?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        )}
        <button type="button" className="btn" onClick={exportIt}><Download size={16} /> Export CSV</button>
        <button type="button" className="btn" onClick={() => window.print()}>Imprimer</button>
      </div>
      {loading && <Loader />}
      {data && (
        <div className="card table-wrap">
          <table className="table">
            <thead><tr><th>Employé</th><th>Département</th><th className="num">Présent</th><th className="num">Retards</th>
              <th className="num">Absences</th><th className="num">Congés</th><th className="num">Heures</th><th className="num">H. sup.</th></tr></thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id}>
                  <td><b>{r.full_name}</b> <small className="muted">{r.employee_code}</small></td><td>{r.department_name || '—'}</td>
                  <td className="num">{r.present_days}</td><td className="num">{r.late_days}</td>
                  <td className={`num ${r.absent_days > 2 ? 'text-danger' : ''}`}>{r.absent_days}</td><td className="num">{r.leave_days}</td>
                  <td className="num">{Math.round(r.total_hours)}</td><td className="num">{Math.round(r.overtime_hours * 10) / 10}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default function Attendance() {
  const { user, isHR, canManage } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState(user.employee_id ? 'me' : 'team');
  const [range, setRange] = useState({ from: todayISO().slice(0, 8) + '01', to: todayISO(), status: '' });
  const [editing, setEditing] = useState(null);
  const mine = useFetch(tab === 'me' ? `/attendance${qs({ from: range.from, to: range.to })}` : null);
  const team = useFetch(tab === 'team' ? `/attendance${qs({ ...range, scope: 'team' })}` : null);

  const markAbsent = async () => {
    const d = window.prompt('Clôturer la journée (marquer les absents) pour la date :', todayISO());
    if (!d) return;
    try {
      const r = await api.post('/attendance/mark-absent', { date: d });
      toast.success(`${r.absent} absent(s) et ${r.onLeave} en congé enregistrés — notifications envoyées`);
      team.reload();
    } catch (err) { toast.error(err); }
  };

  return (
    <>
      <PageHeader title="Présences" subtitle="Pointage, historique et rapports mensuels">
        {isHR && <button type="button" className="btn" onClick={() => setEditing({})}><Pencil size={16} /> Saisie manuelle</button>}
        {isHR && <button type="button" className="btn btn-warning" onClick={markAbsent}><UserX size={16} /> Clôturer la journée</button>}
      </PageHeader>
      <Tabs value={tab} onChange={setTab} tabs={[
        user.employee_id && { value: 'me', label: 'Mon pointage' },
        canManage && { value: 'team', label: isHR ? 'Tous les agents' : 'Mon équipe' },
        { value: 'report', label: 'Rapport mensuel' },
      ]} />

      {(tab === 'me' || tab === 'team') && (
        <div className="card toolbar">
          <label className="inline">Du <input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></label>
          <label className="inline">au <input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></label>
          {tab === 'team' && (
            <select value={range.status} onChange={(e) => setRange({ ...range, status: e.target.value })}>
              <option value="">Tous les statuts</option>
              {Object.entries(ATTENDANCE_STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
            </select>
          )}
        </div>
      )}
      {tab === 'me' && (<><CheckInCard onChange={mine.reload} /><AttendanceTable rows={mine.data} /></>)}
      {tab === 'team' && <AttendanceTable rows={team.data} showName onEdit={isHR ? setEditing : null} />}
      {tab === 'report' && <MonthlyReport />}
      {editing && <ManualEntry record={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); team.reload(); }} />}
    </>
  );
}
