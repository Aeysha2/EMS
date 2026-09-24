import { Lightbulb, Sparkles } from 'lucide-react';
import useFetch from '../utils/useFetch';
import { ErrorBox, Loader } from './ui';

/** Analyse automatique : score combinant évaluations, assiduité, ponctualité, objectifs, formation. */
export default function InsightsPanel({ employeeId }) {
  const { data, loading, error } = useFetch(`/performance/insights/${employeeId}`);
  if (loading) return <Loader label="Analyse en cours…" />;
  if (error) return <ErrorBox error={error} />;
  const m = data.metrics;
  const tone = data.score === null ? 'muted' : data.score >= 80 ? 'success' : data.score >= 65 ? 'info' : data.score >= 50 ? 'warning' : 'danger';
  return (
    <div className="card">
      <div className="insights-head">
        <div className={`score-ring tone-${tone}`}><b>{data.score ?? '–'}</b><small>/100</small></div>
        <div>
          <h3><Sparkles size={18} /> Indicateurs de performance individuelle</h3>
          <p className="muted">Niveau : <b>{data.level}</b> — calcul automatique à partir des évaluations, de l’assiduité, de la ponctualité et des objectifs.</p>
        </div>
      </div>
      <dl className="info-grid">
        {[['Note moyenne', m.avgRating ? `${m.avgRating}/5` : '—'], ['Évaluations', m.reviews],
          ['Assiduité (90 j)', m.attendanceRate !== null ? `${m.attendanceRate} %` : '—'], ['Ponctualité', m.punctuality !== null ? `${m.punctuality} %` : '—'],
          ['Objectifs atteints', m.goalCompletion !== null ? `${m.goalCompletion} %` : '—'], ['Formations / certifications', `${m.trainings} / ${m.certifications}`]]
          .map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>
      <ul className="tips">{data.recommendations.map((t) => <li key={t}><Lightbulb size={16} /> {t}</li>)}</ul>
    </div>
  );
}
