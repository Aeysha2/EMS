import { Plus, Sparkles, Star, Trash2 } from 'lucide-react';
import { useState } from 'react';
import InsightsPanel from '../components/InsightsPanel';
import { Badge, Empty, Field, Loader, Modal, PageHeader, Tabs } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api, { qs } from '../services/api';
import { date } from '../utils/format';
import useFetch from '../utils/useFetch';

const Stars = ({ value }) => (
  <span className="stars" title={`${value}/5`}>
    {[1, 2, 3, 4, 5].map((i) => <Star key={i} size={14} className={i <= Math.round(value) ? 'on' : ''} />)}
    <b> {value}</b>
  </span>
);

function ReviewForm({ review, onClose, onSaved }) {
  const toast = useToast();
  const { isHR, user } = useAuth();
  const { data: emps } = useFetch(`/employees${qs({ limit: 100, sort: 'name', department: isHR ? '' : user.managedDepartments?.[0]?.id })}`);
  const [form, setForm] = useState({
    employee_id: review?.employee_id || '', period: review?.period || '', review_date: review?.review_date || '',
    rating: review?.rating || '', feedback: review?.feedback || '', status: review?.status || 'completed',
    goals: review?.goals?.length ? review.goals : [{ title: '', progress: 0, done: false }],
  });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setGoal = (i, k, v) => setForm({ ...form, goals: form.goals.map((g, j) => (j === i ? { ...g, [k]: v } : g)) });

  const submit = async (e) => {
    e.preventDefault();
    const body = { ...form, goals: form.goals.filter((g) => g.title) };
    try {
      if (review?.id) await api.put(`/performance/${review.id}`, body);
      else await api.post('/performance', body);
      toast.success(form.status === 'scheduled' ? 'Évaluation planifiée — l’agent est notifié' : 'Évaluation enregistrée');
      onSaved();
    } catch (err) { toast.error(err); }
  };

  const candidates = (emps?.data || []).filter((e) => e.id !== user.employee_id);
  return (
    <Modal wide title={review?.id ? 'Modifier l’évaluation' : 'Nouvelle évaluation'} onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>Annuler</button><button form="rev-form" className="btn btn-primary">Enregistrer</button></>}>
      <form id="rev-form" className="form-grid" onSubmit={submit}>
        <Field label="Agent évalué">
          <select required value={form.employee_id} onChange={set('employee_id')} disabled={!!review?.id}>
            <option value="">—</option>
            {candidates.map((e) => <option key={e.id} value={e.id}>{e.full_name} – {e.department_name}</option>)}
          </select>
        </Field>
        <Field label="Période"><input required placeholder="2026 – S1" value={form.period} onChange={set('period')} /></Field>
        <Field label="Type">
          <select value={form.status} onChange={set('status')}>
            <option value="completed">Évaluation réalisée</option>
            <option value="scheduled">Planifier un entretien</option>
          </select>
        </Field>
        <Field label="Date"><input type="date" value={form.review_date} onChange={set('review_date')} /></Field>
        {form.status === 'completed' && (
          <Field label={`Note : ${form.rating || '—'} / 5`} full>
            <input type="range" min="1" max="5" step="0.5" value={form.rating || 3} onChange={set('rating')} />
          </Field>
        )}
        <Field label="Appréciation / feedback" full><textarea rows={3} value={form.feedback} onChange={set('feedback')} /></Field>
        <div className="field-full">
          <span className="label">Objectifs</span>
          {form.goals.map((g, i) => (
            <div key={i} className="goal-edit">
              <input placeholder={`Objectif ${i + 1}`} value={g.title} onChange={(e) => setGoal(i, 'title', e.target.value)} />
              <input type="date" value={g.due || ''} onChange={(e) => setGoal(i, 'due', e.target.value)} title="Échéance" />
              <button type="button" className="icon-btn danger" onClick={() => setForm({ ...form, goals: form.goals.filter((_, j) => j !== i) })}><Trash2 size={15} /></button>
            </div>
          ))}
          <button type="button" className="btn btn-sm" onClick={() => setForm({ ...form, goals: [...form.goals, { title: '', progress: 0, done: false }] })}><Plus size={14} /> Ajouter un objectif</button>
        </div>
      </form>
    </Modal>
  );
}

function ReviewCard({ r, canEdit, canDelete, isOwn, onEdit, onChanged }) {
  const toast = useToast();
  const updateGoal = async (i, patch) => {
    const goals = r.goals.map((g, j) => (j === i ? { ...g, ...patch } : g));
    try { await api.put(`/performance/${r.id}`, { goals }); onChanged(); } catch (err) { toast.error(err); }
  };
  const remove = async () => {
    if (!window.confirm('Supprimer cette évaluation ?')) return;
    try { await api.del(`/performance/${r.id}`); onChanged(); } catch (err) { toast.error(err); }
  };
  return (
    <div className="card review-card">
      <div className="card-head">
        <div>
          <h3>{r.full_name} <span className="muted">· {r.period}</span></h3>
          <small className="muted">{r.department_name} · {r.status === 'scheduled' ? 'prévue le' : 'réalisée le'} {date(r.review_date)} · par {r.reviewer_name || '—'}</small>
        </div>
        <div className="row">
          {r.status === 'completed' ? <Stars value={r.rating} /> : <Badge tone="warning">Planifiée</Badge>}
          {canEdit && <button type="button" className="btn btn-sm" onClick={() => onEdit(r)}>{r.status === 'scheduled' ? 'Réaliser' : 'Modifier'}</button>}
          {canDelete && <button type="button" className="icon-btn danger" onClick={remove}><Trash2 size={15} /></button>}
        </div>
      </div>
      {r.feedback && <p>{r.feedback}</p>}
      {r.goals?.length > 0 && (
        <ul className="goals">
          {r.goals.map((g, i) => (
            <li key={i}>
              <label className="check">
                <input type="checkbox" checked={!!g.done} disabled={!isOwn && !canEdit}
                  onChange={(e) => updateGoal(i, { done: e.target.checked, progress: e.target.checked ? 100 : g.progress })} />
                <span className={g.done ? 'done' : ''}>{g.title}</span>
              </label>
              {g.due && <small className="muted">échéance {date(g.due)}</small>}
              <div className="progress slim"><div className="progress-fill tone-success" style={{ width: `${g.done ? 100 : g.progress || 0}%` }} /></div>
              {(isOwn || canEdit) && !g.done && (
                <input type="range" min="0" max="100" step="10" value={g.progress || 0} aria-label="Avancement"
                  onChange={(e) => updateGoal(i, { progress: Number(e.target.value) })} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Performance() {
  const { user, isHR, canManage } = useAuth();
  const [tab, setTab] = useState(canManage ? 'team' : 'mine');
  const [editing, setEditing] = useState(null);
  const scope = tab === 'mine' ? 'mine' : isHR ? 'all' : 'team';
  const { data, loading, reload } = useFetch(tab === 'insights' ? null : `/performance?scope=${scope}`);

  return (
    <>
      <PageHeader title="Performance" subtitle="Évaluations, notes, feedback et objectifs">
        {canManage && <button type="button" className="btn btn-primary" onClick={() => setEditing({})}><Plus size={16} /> Nouvelle évaluation</button>}
      </PageHeader>
      <Tabs value={tab} onChange={setTab} tabs={[
        canManage && { value: 'team', label: isHR ? 'Toutes les évaluations' : 'Mon équipe' },
        user.employee_id && { value: 'mine', label: 'Mes évaluations' },
        user.employee_id && { value: 'insights', label: <><Sparkles size={14} /> Mon analyse</> },
      ]} />
      {tab === 'insights' && <InsightsPanel employeeId={user.employee_id} />}
      {tab !== 'insights' && loading && !data && <Loader />}
      {tab !== 'insights' && data?.length === 0 && <Empty>Aucune évaluation</Empty>}
      {tab !== 'insights' && data?.map((r) => (
        <ReviewCard key={r.id} r={r} isOwn={r.employee_id === user.employee_id}
          canEdit={canManage && r.employee_id !== user.employee_id} canDelete={isHR}
          onEdit={setEditing} onChanged={reload} />
      ))}
      {editing && <ReviewForm review={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </>
  );
}
