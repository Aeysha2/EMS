import { ClipboardCheck, Fingerprint, KeyRound, Network, Palmtree, ShieldAlert, UserCheck, Users, Wallet } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import CheckInCard from '../components/CheckInCard';
import Indicators from '../components/Indicators';
import { Empty, ErrorBox, Loader, PageHeader, StatCard } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { date, MONTHS, money, ROLE_LABELS } from '../utils/format';
import useFetch from '../utils/useFetch';

function AnnouncementsCard({ items }) {
  return (
    <div className="card">
      <div className="card-head"><h3>Annonces</h3><Link to="/announcements" className="link">Tout voir</Link></div>
      {items.length === 0 && <Empty>Aucune annonce</Empty>}
      <ul className="announce-list">
        {items.map((a) => (
          <li key={a.id}>
            <b>{a.title}</b> <span className={`badge badge-${a.institution_id ? 'info' : 'success'}`}>{a.institution_sigle || 'National'}</span>
            <p>{a.content}</p>
            <small className="muted">{a.author_name} · {date(a.created_at)}{a.event_date && ` · 📅 ${date(a.event_date)}`}</small>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Dashboard() {
  const auth = useAuth();
  const { user } = auth;
  const navigate = useNavigate();
  const { data, loading, error, reload } = useFetch('/dashboard');
  if (loading && !data) return <Loader />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const { me } = data;

  return (
    <>
      <PageHeader title={`Bonjour, ${user.name.split(' ')[0]}`}
        subtitle={`${ROLE_LABELS[user.role]} — ${user.structure_name || ''}${user.institution_name ? ` · ${user.institution_name}` : ''}`} />

      {!user.totp_enabled && user.role !== 'agent' && (
        <div className="alert alert-warning"><KeyRound size={16} />
          <span>Votre profil est sensible : activez la double authentification dans <Link to="/profile?tab=securite">Mon compte</Link>.</span></div>
      )}

      {auth.hasDossier && <CheckInCard onChange={reload} />}

      {auth.hasDossier && (
        <div className="stats">
          {me.balances.map((b) => (
            <StatCard key={b.leave_type} icon={Palmtree} tone="success" label={b.label} value={`${Number(b.remaining)} j`}
              sub="restants cette année" onClick={() => navigate('/absences')} />
          ))}
          <StatCard icon={ClipboardCheck} tone="info" label="Mes demandes en cours" value={me.openRequests} onClick={() => navigate('/requests?scope=mine')} />
          {Number(me.pendingValidations) > 0 && (
            <StatCard icon={ShieldAlert} tone="danger" label="Validations en attente" value={me.pendingValidations} onClick={() => navigate('/requests?scope=todo')} />
          )}
          <StatCard icon={Wallet} label="Dernier net versé" value={me.lastPayslip ? money(me.lastPayslip.net) : '—'}
            sub={me.lastPayslip ? `${MONTHS[me.lastPayslip.period_month - 1]} ${me.lastPayslip.period_year}` : 'Aucun bulletin'}
            onClick={() => navigate('/solde')} />
        </div>
      )}

      {data.team && (
        <div className="card">
          <div className="card-head"><h3><Users size={18} /> Mon équipe aujourd’hui</h3><Link to="/agents?scope=team" className="link">Voir l’équipe</Link></div>
          <div className="stats small">
            <StatCard icon={Users} label="Effectif" value={data.team.effectif} />
            <StatCard icon={UserCheck} tone="success" label="Présents" value={data.team.presents} />
            <StatCard icon={Palmtree} tone="info" label="En absence autorisée" value={data.team.en_absence} />
          </div>
        </div>
      )}

      {data.technique && (
        <div className="stats">
          {data.technique.comptes.map((c) => (
            <StatCard key={c.role} icon={KeyRound} tone={Number(c.a_revoir) ? 'warning' : 'success'} label={ROLE_LABELS[c.role]}
              value={`${c.n} compte(s)`} sub={`${c.mfa} avec 2FA · ${c.a_revoir} habilitation(s) à revoir`} onClick={() => navigate('/admin')} />
          ))}
          <StatCard icon={Network} tone="purple" label="Systèmes interconnectés" value={data.technique.interop.actifs}
            sub={`Dernier appel : ${data.technique.interop.dernier_appel ? date(data.technique.interop.dernier_appel) : '—'}`} onClick={() => navigate('/interop')} />
          <StatCard icon={Fingerprint} tone="danger" label="Échecs d’authentification (24 h)" value={data.technique.echecs_24h} onClick={() => navigate('/admin')} />
        </div>
      )}

      {data.indicators && (
        <>
          <div className="section-title">
            <h2>{data.indicators.scope === 'national' ? 'Vue consolidée nationale' : `Indicateurs — ${user.institution_name}`}</h2>
            <Link to="/pilotage" className="link">Tableau de bord complet</Link>
          </div>
          <Indicators d={data.indicators} compact />
        </>
      )}

      <AnnouncementsCard items={data.announcements} />
    </>
  );
}
