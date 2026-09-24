import { Plus, Star, Trash2 } from 'lucide-react';
import { useState } from 'react';
import InsightsPanel from '../components/InsightsPanel';
import { Badge, Empty, Field, Loader, Modal, PageHeader, Tabs } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api, { qs } from '../services/api';
import { date } from '../utils/format';
import useFetch from '../utils/useFetch';

const Stars = ({ value }) => (
  <span className="stars" title={`${value}/5`}>{[1, 2, 3, 4, 5].map((i) => <Star key={i} size={14} className={i <= Math.round(value) ? 'on' : ''} />)}<b> {value}</b></span>
);

function ReviewForm({ review, onClose, onSaved }) {
  const toast = useToast();
  const { isDRH, user } = useAuth();
  const { data: emps } = useFetch(`/employees${qs({ scope: isDRH ? 'institution' : 'team', limit: 100 })}`);
  const [form, setForm] = useState({
    employee_id: review?.employee_id || '', period: review?.period || String(new Date().getFullYear()), review_date: review?.review_date || '',
    rating: review?.rating || 3, feedback: review?.feedback || '', status: review?.status === 'scheduled' ? 'completed' : (review?.status || 'completed'),
    goals: review?.goals?.length ? review.goals : [{ title: '', progress: 0 }],
    indicators: review?.indicators?.length ? review.indicators : [{ title: '', target: '', achieved: '' }],
  });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setItem = (list, i, k, v) => setForm({ ...form, [list]: form[list].map((g, j) => (j === i ? { ...g, [k]: v } : g)) });
  const submit = async (e) => {
    e.preventDefault();
    const body = { ...form, goals: form.goals.filter((g) => g.title), indicators: form.indicators.filter((g) => g.title) };
    try {
      if (review?.id) await api.put(`/performance/${review.id}`, body); else await api.post('/performance', body);
      toast.success('Évaluation enregistrée — l’agent est notifié'); onSaved();
    } catch (err) { toast.error(err); }
  };
  return (
    <Modal wide title={review?.id ? 'Compléter l’évaluation' : 'Fiche d’évaluation annuelle'} onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>Annuler</button><button form="rev-form" className="btn btn-primary">Enregistrer</button></>}>
      <form id="rev-form" className="form-grid" onSubmit={submit}>
        <Field label="Agent évalué"><select required disabled={!!review?.id} value={form.employee_id} onChange={set('employee_id')}>
          <option value="">—</option>{emps?.data.filter((e) => e.id !== user.employee_id).map((e) => <option key={e.id} value={e.id}>{e.full_name} — {e.structure_name}</option>)}</select></Field>
        <Field label="Période"><input required value={form.period} onChange={set('period')} /></Field>
        <Field label="Type"><select value={form.status} onChange={set('status')}><option value="completed">Évaluation réalisée</option><option value="scheduled">Planifier l’entretien</option></select></Field>
        <Field label="Date"><input type="date" value={form.review_date} onChange={set('review_date')} /></Field>
        {form.status === 'completed' && <Field label={`Note : ${form.rating}/5`} full><input type="range" min="1" max="5" step="0.5" value={form.rating} onChange={set('rating')} /></Field>}
        <Field label="Appréciation générale" full><textarea rows={3} value={form.feedback} onChange={set('feedback')} /></Field>
        <div className="field-full"><span className="label">Objectifs de l’année</span>
          {form.goals.map((g, i) => <div key={i} className="goal-edit"><input placeholder={`Objectif ${i + 1}`} value={g.title} onChange={(e) => setItem('goals', i, 'title', e.target.value)} />
            <input type="date" value={g.due || ''} onChange={(e) => setItem('goals', i, 'due', e.target.value)} aria-label="Échéance" />
            <button type="button" className="icon-btn danger" onClick={() => setForm({ ...form, goals: form.goals.filter((_, j) => j !== i) })}><Trash2 size={15} /></button></div>)}
          <button type="button" className="btn btn-sm" onClick={() => setForm({ ...form, goals: [...form.goals, { title: '', progress: 0 }] })}><Plus size={14} /> Objectif</button>
        </div>
        <div className="field-full"><span className="label">Indicateurs de performance</span>
          {form.indicators.map((g, i) => <div key={i} className="goal-edit three"><input placeholder="Indicateur" value={g.title} onChange={(e) => setItem('indicators', i, 'title', e.target.value)} />
            <input placeholder="Cible" value={g.target || ''} onChange={(e) => setItem('indicators', i, 'target', e.target.value)} />
            <input placeholder="Réalisé" value={g.achieved || ''} onChange={(e) => setItem('indicators', i, 'achieved', e.target.value)} /></div>)}
          <button type="button" className="btn btn-sm" onClick={() => setForm({ ...form, indicators: [...form.indicators, { title: '' }] })}><Plus size={14} /> Indicateur</button>
        </div>
      </form>
    </Modal>
  );
}

export default function Performance() {
  const { user, isDRH, isChef } = useAuth();
  const toast = useToast();
  const canEval = isDRH || isChef;
  const [tab, setTab] = useState(canEval ? (isDRH ? 'institution' : 'team') : 'mine');
  const [editing, setEditing] = useState(null);
  const { data, loading, reload } = useFetch(tab === 'insights' ? null : `/performance?scope=${tab}`);
  const updateGoal = async (r, i, patch) => {
    try { await api.put(`/performance/${r.id}`, { goals: r.goals.map((g, j) => (j === i ? { ...g, ...patch } : g)) }); reload(); } catch (err) { toast.error(err); }
  };
  return (
    <>
      <PageHeader title="Évaluation et performance" subtitle="Fiches d’évaluation annuelle, objectifs et indicateurs">
        {canEval && <button type="button" className="btn btn-primary" onClick={() => setEditing({})}><Plus size={16} /> Nouvelle évaluation</button>}
      </PageHeader>
      <Tabs value={tab} onChange={setTab} tabs={[
        isDRH && { value: 'institution', label: 'Mon institution' }, isChef && { value: 'team', label: 'Mon équipe' },
        user.employee_id && { value: 'mine', label: 'Mes évaluations' }, user.employee_id && { value: 'insights', label: 'Mes indicateurs' },
      ]} />
      {tab === 'insights' && <InsightsPanel employeeId={user.employee_id} />}
      {tab !== 'insights' && loading && !data && <Loader />}
      {tab !== 'insights' && data?.length === 0 && <Empty>Aucune évaluation</Empty>}
      {tab !== 'insights' && data?.map((r) => {
        const own = r.employee_id === user.employee_id;
        return (
          <div key={r.id} className="card review-card">
            <div className="card-head">
              <div><h3>{r.full_name} <span className="muted">· {r.period}</span></h3>
                <small className="muted">{r.structure_name} · {r.status === 'scheduled' ? 'prévue le' : 'réalisée le'} {date(r.review_date)} · évaluateur : {r.reviewer_name || '—'}</small></div>
              <div className="row">{r.status === 'completed' ? <Stars value={r.rating} /> : <Badge tone="warning">Planifiée</Badge>}
                {!own && canEval && <button type="button" className="btn btn-sm" onClick={() => setEditing(r)}>{r.status === 'scheduled' ? 'Réaliser' : 'Modifier'}</button>}</div>
            </div>
            {r.feedback && <p>{r.feedback}</p>}
            {r.indicators?.length > 0 && <div className="chips">{r.indicators.map((k) => <span key={k.title} className="badge badge-info">{k.title} : {k.achieved || '—'} / {k.target || '—'}</span>)}</div>}
            {r.goals?.length > 0 && (
              <ul className="goals">{r.goals.map((g, i) => (
                <li key={i}>
                  <label className="check"><input type="checkbox" checked={!!g.done} disabled={!own && !canEval} onChange={(e) => updateGoal(r, i, { done: e.target.checked, progress: e.target.checked ? 100 : g.progress })} />
                    <span className={g.done ? 'done' : ''}>{g.title}</span></label>
                  <div className="progress slim"><div className="progress-fill tone-success" style={{ width: `${g.done ? 100 : g.progress || 0}%` }} /></div>
                  {own && !g.done && <input type="range" min="0" max="100" step="10" value={g.progress || 0} aria-label="Avancement" onChange={(e) => updateGoal(r, i, { progress: Number(e.target.value) })} />}
                </li>))}</ul>
            )}
          </div>
        );
      })}
      {editing && <ReviewForm review={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </>
  );
}
