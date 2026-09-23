import {
  AlertTriangle, CalendarDays, CheckCircle2, FolderKanban, UserCheck, Users, Wallet,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import CheckInCard from '../components/CheckInCard';
import { BarChart, ColumnChart, Donut, Empty, PageHeader, StatCard } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { dateTime, money } from '../utils/format';
import Announcements from './AnnouncementsWidget';

export default function AdminDashboard({ data, reload }) {
  const { user, isHR } = useAuth();
  const navigate = useNavigate();
  const o = data.org;
  const p = o.projects;
  const presenceRate = o.total_employees ? Math.round((o.present / o.total_employees) * 100) : 0;

  return (
    <>
      <PageHeader
        title={`Bonjour, ${user.name.split(' ')[0]} 👋`}
        subtitle={o.scope === 'team' ? 'Vue de votre service' : 'Vue d’ensemble du ministère'}
      />
      {user.employee_id && <CheckInCard onChange={reload} />}

      <div className="stats">
        <StatCard icon={Users} label="Total employés" value={o.total_employees} onClick={() => navigate('/employees')} />
        <StatCard icon={UserCheck} tone="success" label="Présents aujourd’hui" value={o.present}
          sub={`${presenceRate} % · ${o.late} en retard`} onClick={() => navigate('/attendance')} />
        <StatCard icon={CalendarDays} tone="info" label="En congé" value={o.on_leave}
          sub={`${o.pendingLeaves} demande(s) en attente`} onClick={() => navigate('/leaves')} />
        {o.monthlyPayroll && (
          <StatCard icon={Wallet} tone="warning" label="Masse salariale du mois" value={money(o.monthlyPayroll.net)}
            sub={`${o.monthlyPayroll.slips} bulletin(s) générés`} onClick={() => navigate('/payroll')} />
        )}
        <StatCard icon={FolderKanban} tone="purple" label="Dossiers en cours" value={p.in_progress + p.awaiting_documents}
          sub={`${p.unassigned} non affecté(s)`} onClick={() => navigate('/projects')} />
        <StatCard icon={AlertTriangle} tone="danger" label="Dossiers en retard" value={p.overdue}
          onClick={() => navigate('/projects?overdue=1')} />
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>Effectif par département</h3>
          <BarChart data={o.departments.map((d) => ({ label: d.name, value: d.count }))} />
        </div>
        <div className="card">
          <h3>Présences – 14 derniers jours</h3>
          <ColumnChart
            data={o.attendanceTrend.map((t) => ({ label: t.date.slice(8, 10), a: t.present, b: t.absent }))}
            series={[{ key: 'a', label: 'Présents', tone: 'success' }, { key: 'b', label: 'Absents', tone: 'danger' }]}
          />
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>Dossiers par statut</h3>
          <Donut data={[
            { label: 'En cours', value: p.in_progress, tone: 'info' },
            { label: 'Pièces demandées', value: p.awaiting_documents, tone: 'warning' },
            { label: 'Clôturés', value: p.completed, tone: 'success' },
            { label: 'Rejetés', value: p.rejected, tone: 'danger' },
          ]} />
        </div>
        {isHR ? (
          <div className="card">
            <h3>Activités récentes</h3>
            {o.recentActivities.length === 0 && <Empty>Aucune activité</Empty>}
            <ul className="timeline compact">
              {o.recentActivities.map((a) => (
                <li key={a.id}>
                  <CheckCircle2 size={14} />
                  <div>
                    <b>{a.action}</b> {a.details && <span className="muted">– {a.details}</span>}
                    <small>{a.user_name || 'Système'} · {dateTime(a.created_at)}</small>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : <Announcements items={data.announcements} />}
      </div>
      {isHR && <Announcements items={data.announcements} />}
    </>
  );
}
