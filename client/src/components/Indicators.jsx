import { AlertTriangle, CalendarClock, Fingerprint, Scale, Users, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { money, num, pct, POSITIONS, STATUT_EMPLOI } from '../utils/format';
import { BarChart, ColumnChart, Donut, StatCard } from './ui';

const TONES = ['primary', 'success', 'warning', 'danger', 'info', 'purple'];

/** Pyramide des âges : hommes à gauche, femmes à droite. */
export function Pyramid({ data }) {
  const max = Math.max(1, ...data.flatMap((d) => [Number(d.hommes), Number(d.femmes)]));
  return (
    <div className="pyramid" role="img" aria-label="Pyramide des âges">
      <div className="pyr-legend"><span><i className="dot tone-primary" /> Hommes</span><span><i className="dot tone-warning" /> Femmes</span></div>
      {data.slice().reverse().map((d) => (
        <div className="pyr-row" key={d.tranche}>
          <div className="pyr-side left"><span>{d.hommes}</span><div className="pyr-bar tone-primary" style={{ width: `${(d.hommes / max) * 100}%` }} /></div>
          <div className="pyr-label">{d.tranche >= 60 ? '60+' : `${d.tranche}–${d.tranche + 4}`}</div>
          <div className="pyr-side"><div className="pyr-bar tone-warning" style={{ width: `${(d.femmes / max) * 100}%` }} /><span>{d.femmes}</span></div>
        </div>
      ))}
    </div>
  );
}

export default function Indicators({ d, compact = false }) {
  const coh = d.coherence_solde;
  return (
    <>
      <div className="stats">
        <StatCard icon={Users} label="Agents en activité" value={num(d.effectif)} sub={`Âge moyen ${d.age_moyen ?? '—'} ans`} />
        <StatCard icon={Scale} tone="warning" label="Taux de féminisation" value={pct(d.taux_feminisation)}
          sub={`${num(d.femmes)} femmes · ${num(d.hommes)} hommes`} />
        <StatCard icon={CalendarClock} tone="danger" label="Absentéisme (30 jours)" value={pct(d.taux_absenteisme)} />
        <StatCard icon={Wallet} tone="success" label="Masse salariale mensuelle" value={money(d.masse_salariale.mensuelle_referentiel)}
          sub={`Prévision 12 mois : ${money(d.masse_salariale.previsionnelle_12_mois)}`} />
        <StatCard icon={Fingerprint} tone="purple" label="Enrôlement biométrique" value={pct(d.taux_enrolement_biometrique)}
          sub={`Identité vérifiée : ${pct(d.taux_identite_verifiee)}`} />
        {coh && (
          <StatCard icon={AlertTriangle} tone={coh.anomalies ? 'danger' : 'success'} label={`Cohérence Solde ${coh.period}`}
            value={`${coh.anomalies} anomalie(s)`} sub={`${money(coh.amount_at_risk)} à vérifier`} />
        )}
      </div>

      <div className="grid-2">
        {d.par_institution.length > 1 && (
          <div className="card">
            <h3>Effectifs par institution</h3>
            <BarChart data={d.par_institution.map((i) => ({ label: i.sigle || i.name, value: Number(i.effectif) }))} />
          </div>
        )}
        <div className="card">
          <h3>Pyramide des âges</h3>
          <Pyramid data={d.pyramide} />
        </div>
        {!compact && (
          <div className="card">
            <h3>Répartition par hiérarchie</h3>
            <Donut data={d.par_hierarchie.map((h, i) => ({ label: `Hiérarchie ${h.hierarchie}`, value: Number(h.effectif), tone: TONES[i % 6] }))} />
          </div>
        )}
        <div className="card">
          <h3>Départs à la retraite prévus <small className="muted">(âge limite {d.retirement_age} ans)</small></h3>
          <ColumnChart data={d.retraites.map((r) => ({ label: String(r.annee), a: Number(r.departs) }))}
            series={[{ key: 'a', label: 'Départs', tone: 'warning' }]} />
        </div>
        {!compact && (
          <>
            <div className="card">
              <h3>Principaux corps</h3>
              <BarChart tone="success" data={d.par_corps.map((c) => ({ label: `${c.corps} (${c.hierarchie || '?'})`, value: Number(c.effectif) }))} />
            </div>
            <div className="card">
              <h3>Statut et position statutaire</h3>
              <Donut data={d.par_statut.map((s, i) => ({ label: STATUT_EMPLOI[s.statut_emploi], value: Number(s.effectif), tone: TONES[i % 6] }))} />
              <div className="chips">
                {d.par_position.map((p) => <span key={p.position_statutaire} className={`badge badge-${POSITIONS[p.position_statutaire]?.[1] || 'muted'}`}>{POSITIONS[p.position_statutaire]?.[0]} : {p.effectif}</span>)}
              </div>
            </div>
            <div className="card">
              <h3>Masse salariale versée (Solde)</h3>
              <ColumnChart data={d.masse_salariale.historique.map((m) => ({ label: `${String(m.period_month).padStart(2, '0')}/${String(m.period_year).slice(2)}`, a: Number(m.brut), b: Number(m.net) }))}
                series={[{ key: 'a', label: 'Brut', tone: 'primary' }, { key: 'b', label: 'Net', tone: 'success' }]} />
            </div>
          </>
        )}
      </div>

      <div className="card table-wrap">
        <div className="card-head"><h3>Circuits de validation</h3><Link to="/requests" className="link">Voir les demandes</Link></div>
        <table className="table">
          <thead><tr><th>Type de demande</th><th className="num">En cours</th><th className="num">En retard</th><th className="num">Délai moyen</th><th className="num">Délai réglementaire</th></tr></thead>
          <tbody>
            {d.workflows.filter((w) => !compact || Number(w.en_cours) > 0).map((w) => (
              <tr key={w.name}><td>{w.name}</td><td className="num">{w.en_cours}</td>
                <td className={`num ${Number(w.en_retard) ? 'text-danger' : ''}`}>{w.en_retard}</td>
                <td className={`num ${w.delai_moyen > w.sla_days ? 'text-danger' : ''}`}>{w.delai_moyen ?? '—'} j</td><td className="num">{w.sla_days} j</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
