import { ArrowLeft, Mail, Pencil, Phone, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import EmployeeForm from '../components/EmployeeForm';
import { Avatar, Badge, ErrorBox, Loader, PageHeader, Tabs } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../services/api';
import {
  ATTENDANCE_STATUS, date, EMPLOYEE_STATUS, LEAVE_STATUS, LEAVE_TYPES, MONTHS, money, time,
} from '../utils/format';
import useFetch from '../utils/useFetch';
import InsightsPanel from '../components/InsightsPanel';

export default function EmployeeDetail() {
  const { id } = useParams();
  const { isHR, isAdmin, user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [tab, setTab] = useState('info');
  const [editing, setEditing] = useState(false);
  const { data: e, loading, error, reload } = useFetch(`/employees/${id}`);
  const { data: departments } = useFetch(isHR ? '/departments' : null);
  const manages = user.managedDepartments?.some((d) => d.id === e?.department_id);
  const canSeeHR = isHR || manages || Number(id) === user.employee_id;

  const { data: attendance } = useFetch(canSeeHR && tab === 'attendance' ? `/attendance?employee=${id}&scope=team` : null);
  const { data: leaves } = useFetch(isHR && tab === 'leaves' ? `/leaves?employee=${id}&scope=all` : null);
  const { data: payroll } = useFetch(isHR && tab === 'payroll' ? `/payroll?employee=${id}` : null);

  if (loading && !e) return <Loader />;
  if (error) return <ErrorBox error={error} />;

  const remove = async () => {
    if (!window.confirm(`Supprimer définitivement ${e.full_name} ? Son compte sera désactivé.`)) return;
    try {
      await api.del(`/employees/${id}`);
      toast.success('Employé supprimé');
      navigate('/employees');
    } catch (err) { toast.error(err); }
  };

  const info = [
    ['Identifiant', e.employee_code], ['Matricule', e.matricule], ['Département', e.department_name],
    ['Fonction', e.designation], ['Grade', e.grade], ['Date d’entrée', e.date_of_joining && date(e.date_of_joining)],
    ['Date de naissance', e.date_of_birth && date(e.date_of_birth)], ['Téléphone', e.phone], ['Adresse', e.address],
    ['Salaire de base', e.salary !== undefined ? money(e.salary) : null],
    ['Compte', e.user_role ? `Oui (${e.user_role})` : e.user_id === null ? 'Aucun' : null],
  ].filter(([, v]) => v !== undefined && v !== null);

  return (
    <>
      <Link to="/employees" className="link back"><ArrowLeft size={16} /> Retour à la liste</Link>
      <PageHeader title="">
        {isHR && <button type="button" className="btn" onClick={() => setEditing(true)}><Pencil size={16} /> Modifier</button>}
        {isAdmin && <button type="button" className="btn btn-danger-outline" onClick={remove}><Trash2 size={16} /> Supprimer</button>}
      </PageHeader>
      <div className="card profile-head">
        <Avatar name={e.full_name} size={72} />
        <div>
          <h2>{e.full_name}</h2>
          <p className="muted">{e.designation || '—'} · {e.department_name || 'Sans département'}</p>
          <div className="row gap">
            <Badge map={EMPLOYEE_STATUS} value={e.status} />
            <a href={`mailto:${e.email}`} className="link"><Mail size={14} /> {e.email}</a>
            {e.phone && <a href={`tel:${e.phone}`} className="link"><Phone size={14} /> {e.phone}</a>}
          </div>
        </div>
        {e.casual_balance !== undefined && (
          <div className="balances">
            <div><b>{e.paid_balance}</b><small>Payés</small></div>
            <div><b>{e.casual_balance}</b><small>Occasionnels</small></div>
            <div><b>{e.sick_balance}</b><small>Maladie</small></div>
          </div>
        )}
      </div>

      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'info', label: 'Informations' },
        canSeeHR && { value: 'attendance', label: 'Présences' },
        isHR && { value: 'leaves', label: 'Congés' },
        isHR && { value: 'payroll', label: 'Paie' },
        canSeeHR && { value: 'insights', label: 'Analyse de performance' },
      ]} />

      {tab === 'info' && (
        <div className="card">
          <dl className="info-grid">
            {info.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v || '—'}</dd></div>)}
          </dl>
        </div>
      )}
      {tab === 'attendance' && (
        <div className="card table-wrap">
          <table className="table">
            <thead><tr><th>Date</th><th>Arrivée</th><th>Départ</th><th className="num">Heures</th><th>Statut</th></tr></thead>
            <tbody>
              {attendance?.map((a) => (
                <tr key={a.id}><td>{date(a.work_date)}</td><td>{time(a.check_in)}</td><td>{time(a.check_out)}</td>
                  <td className="num">{a.working_hours}</td><td><Badge map={ATTENDANCE_STATUS} value={a.status} /></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {tab === 'leaves' && (
        <div className="card table-wrap">
          <table className="table">
            <thead><tr><th>Type</th><th>Période</th><th className="num">Jours</th><th>Statut</th></tr></thead>
            <tbody>
              {leaves?.map((l) => (
                <tr key={l.id}><td>{LEAVE_TYPES[l.leave_type]}</td><td>{date(l.start_date)} → {date(l.end_date)}</td>
                  <td className="num">{l.days}</td><td><Badge map={LEAVE_STATUS} value={l.status} /></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {tab === 'payroll' && (
        <div className="card table-wrap">
          <table className="table">
            <thead><tr><th>Période</th><th className="num">Brut</th><th className="num">Net</th><th>Statut</th></tr></thead>
            <tbody>
              {payroll?.map((p) => (
                <tr key={p.id}><td>{MONTHS[p.period_month - 1]} {p.period_year}</td><td className="num">{money(p.gross)}</td>
                  <td className="num"><b>{money(p.net)}</b></td><td>{p.status === 'paid' ? 'Payé' : 'Traité'}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {tab === 'insights' && <InsightsPanel employeeId={e.id} />}

      {editing && (
        <EmployeeForm employee={e} departments={departments || []} onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); reload(); }} />
      )}
    </>
  );
}
