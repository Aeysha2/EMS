import { AlertTriangle, CalendarDays, FolderKanban, HeartPulse, Palmtree, Wallet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import CheckInCard from '../components/CheckInCard';
import { PageHeader, StatCard } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { MONTHS, money } from '../utils/format';
import Announcements from './AnnouncementsWidget';

export default function EmployeeDashboard({ data, reload }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { me } = data;
  const b = me.balances || {};

  return (
    <>
      <PageHeader title={`Bonjour, ${user.name.split(' ')[0]} 👋`} subtitle="Votre espace personnel" />
      {user.employee_id && <CheckInCard onChange={reload} />}
      <div className="stats">
        <StatCard icon={Palmtree} tone="success" label="Congés payés restants" value={`${b.paid_balance ?? 0} j`} onClick={() => navigate('/leaves')} />
        <StatCard icon={CalendarDays} tone="info" label="Congés occasionnels" value={`${b.casual_balance ?? 0} j`}
          sub={`${me.pendingLeaves} demande(s) en attente`} onClick={() => navigate('/leaves')} />
        <StatCard icon={HeartPulse} tone="warning" label="Congés maladie" value={`${b.sick_balance ?? 0} j`} />
        <StatCard icon={Wallet} label="Dernier salaire net"
          value={me.lastPayslip ? money(me.lastPayslip.net) : '—'}
          sub={me.lastPayslip ? `${MONTHS[me.lastPayslip.period_month - 1]} ${me.lastPayslip.period_year}` : 'Aucun bulletin'}
          onClick={() => navigate('/payroll')} />
        <StatCard icon={FolderKanban} tone="purple" label="Mes dossiers en cours" value={me.projects.open} onClick={() => navigate('/projects?scope=mine')} />
        {me.projects.overdue > 0 && (
          <StatCard icon={AlertTriangle} tone="danger" label="Dossiers en retard" value={me.projects.overdue} onClick={() => navigate('/projects?scope=mine&overdue=1')} />
        )}
      </div>
      <Announcements items={data.announcements} />
    </>
  );
}
