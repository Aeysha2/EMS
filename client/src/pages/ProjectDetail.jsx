import {
  AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, CornerUpLeft, FileDown, FilePlus2, FileText, MessageSquare,
  PauseCircle, PlayCircle, UserPlus, XCircle,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Badge, ErrorBox, Field, Loader, Modal } from '../components/ui';
import { useToast } from '../context/ToastContext';
import api, { download } from '../services/api';
import { date, dateTime, PRIORITY, PROJECT_STATUS } from '../utils/format';
import useFetch from '../utils/useFetch';

const ACTIONS = {
  assign: { label: 'Affecter un agent', icon: UserPlus, agent: true, tone: '' },
  advance: { label: 'Transmettre à l’étape suivante', icon: ArrowRight, agent: 'optional', tone: 'btn-primary' },
  return: { label: 'Retourner à l’étape précédente', icon: CornerUpLeft, needComment: true, agent: 'optional', tone: '' },
  request_documents: { label: 'Demander des pièces', icon: PauseCircle, needComment: true, tone: 'btn-warning' },
  resume: { label: 'Reprendre le traitement', icon: PlayCircle, tone: 'btn-primary' },
  close: { label: 'Clôturer le dossier', icon: CheckCircle2, tone: 'btn-success' },
  reject: { label: 'Rejeter le dossier', icon: XCircle, needComment: true, tone: 'btn-danger-outline' },
  comment: { label: 'Ajouter un commentaire', icon: MessageSquare, needComment: true, tone: '' },
};

const HISTORY_ICONS = {
  creation: FilePlus2, assign: UserPlus, advance: ArrowRight, return: CornerUpLeft, request_documents: PauseCircle,
  resume: PlayCircle, reject: XCircle, close: CheckCircle2, comment: MessageSquare, document: FileText,
};

function ActionModal({ project, action, onClose, onDone }) {
  const toast = useToast();
  const def = ACTIONS[action];
  const [comment, setComment] = useState('');
  const [agent, setAgent] = useState('');
  const nextStep = action === 'advance' ? project.circuit[project.current_step]
    : action === 'return' ? project.circuit[project.current_step - 2] : project.circuit[project.current_step - 1];
  const dept = nextStep?.department_id;
  const { data: emps } = useFetch(def.agent ? `/employees?limit=100&status=active&sort=name${dept ? `&department=${dept}` : ''}` : null);

  const submit = async () => {
    try {
      const updated = await api.post(`/projects/${project.id}/actions`, { action, comment, agent_id: agent || undefined });
      toast.success('Dossier mis à jour');
      onDone(updated);
    } catch (err) { toast.error(err); }
  };

  return (
    <Modal title={def.label} onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>Annuler</button>
        <button type="button" className={`btn ${def.tone || 'btn-primary'}`} onClick={submit}
          disabled={(def.needComment && !comment) || (def.agent === true && !agent)}>Confirmer</button></>}>
      {nextStep && ['advance', 'return'].includes(action) && (
        <p className="alert alert-info">Étape de destination : <b>{nextStep.step_order}. {nextStep.name}</b>{nextStep.department_name && ` — ${nextStep.department_name}`}</p>
      )}
      {def.agent && (
        <Field label={def.agent === true ? 'Agent traitant *' : 'Agent traitant de l’étape (optionnel)'} full>
          <select value={agent} onChange={(e) => setAgent(e.target.value)}>
            <option value="">{def.agent === true ? '—' : 'Laisser le chef de service affecter'}</option>
            {emps?.data.map((e) => <option key={e.id} value={e.id}>{e.full_name} – {e.designation || e.department_name}</option>)}
          </select>
        </Field>
      )}
      <Field label={def.needComment ? (action === 'request_documents' ? 'Pièces demandées *' : action === 'reject' ? 'Motif du rejet *' : 'Commentaire *') : 'Commentaire'} full>
        <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
      </Field>
    </Modal>
  );
}

export default function ProjectDetail() {
  const { id } = useParams();
  const toast = useToast();
  const { data: p, setData, loading, error, reload } = useFetch(`/projects/${id}`);
  const [action, setAction] = useState(null);
  const fileRef = useRef(null);

  if (loading && !p) return <Loader />;
  if (error) return <ErrorBox error={error} />;

  const open = ['in_progress', 'awaiting_documents'].includes(p.status);
  const last = p.current_step === p.circuit.length;
  const available = [];
  if (open && p.permissions.canAssign) available.push('assign');
  if (open && p.permissions.canProcess) {
    if (p.status === 'awaiting_documents') available.push('resume');
    else {
      if (!last) available.push('advance');
      if (last) available.push('close');
      available.push('request_documents');
    }
    if (p.current_step > 1) available.push('return');
    available.push('reject');
  }
  available.push('comment');

  const upload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) return toast.error('Fichier trop volumineux (3 Mo max)');
    const content = await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.readAsDataURL(file);
    });
    try {
      await api.post(`/projects/${p.id}/documents`, { name: file.name, mime_type: file.type, content });
      toast.success('Pièce ajoutée');
      reload();
    } catch (err) { toast.error(err); }
    return null;
  };

  return (
    <>
      <Link to="/projects" className="link back"><ArrowLeft size={16} /> Retour aux dossiers</Link>
      <div className="card project-head">
        <div>
          <div className="row gap">
            <h2>{p.reference}</h2>
            <Badge map={PROJECT_STATUS} value={p.status} />
            <Badge map={PRIORITY} value={p.priority} />
            {p.is_overdue && <span className="badge badge-danger"><AlertTriangle size={12} /> En retard</span>}
          </div>
          <h3>{p.title}</h3>
          {p.description && <p className="muted">{p.description}</p>}
        </div>
        <div className="row gap wrap">
          <button type="button" className="btn" onClick={() => download(`/projects/${p.id}/receipt`)}><FileDown size={16} /> Récépissé</button>
        </div>
      </div>

      <div className="card">
        <h3>Circuit de traitement</h3>
        <ol className="stepper">
          {p.circuit.map((s) => {
            const state = p.status === 'completed' || s.step_order < p.current_step ? 'done'
              : s.step_order === p.current_step ? (p.status === 'rejected' ? 'rejected' : 'current') : 'todo';
            return (
              <li key={s.id} className={`step ${state}`}>
                <span className="step-dot">{state === 'done' ? '✓' : state === 'rejected' ? '✕' : s.step_order}</span>
                <div>
                  <b>{s.name}</b>
                  <small>{s.department_name || '—'} · {s.expected_days} j</small>
                </div>
              </li>
            );
          })}
        </ol>
        {open && (
          <div className="action-bar">
            {available.map((a) => {
              const A = ACTIONS[a];
              return <button type="button" key={a} className={`btn ${A.tone}`} onClick={() => setAction(a)}><A.icon size={16} /> {A.label}</button>;
            })}
          </div>
        )}
        {!open && <div className="action-bar"><button type="button" className="btn" onClick={() => setAction('comment')}><MessageSquare size={16} /> Ajouter un commentaire</button></div>}
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>Informations</h3>
          <dl className="info-grid">
            <div><dt>Type de demande</dt><dd>{p.request_type_name}</dd></div>
            <div><dt>Mode de dépôt</dt><dd>{p.deposit_type_name}</dd></div>
            <div><dt>Date de dépôt</dt><dd>{date(p.deposit_date)}</dd></div>
            <div><dt>Échéance ({p.sla_days} j)</dt><dd className={p.is_overdue ? 'text-danger' : ''}>{date(p.due_date)}</dd></div>
            <div><dt>Agent traitant</dt><dd>{p.agent_name || <span className="badge badge-warning">Non affecté</span>}</dd></div>
            <div><dt>Service actuel</dt><dd>{p.department_name || '—'}</dd></div>
            <div><dt>Demandeur</dt><dd>{p.applicant_name}</dd></div>
            <div><dt>Matricule</dt><dd>{p.applicant_matricule || '—'}</dd></div>
            <div><dt>Structure</dt><dd>{p.applicant_structure || '—'}</dd></div>
            <div><dt>Contact</dt><dd>{[p.applicant_phone, p.applicant_email].filter(Boolean).join(' · ') || '—'}</dd></div>
            <div><dt>Enregistré par</dt><dd>{p.created_by_name || '—'}</dd></div>
            {p.closed_at && <div><dt>Clôturé le</dt><dd>{dateTime(p.closed_at)}</dd></div>}
          </dl>
          <div className="card-head">
            <h4>Pièces du dossier</h4>
            <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()}><FilePlus2 size={14} /> Ajouter</button>
            <input ref={fileRef} type="file" hidden accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.txt" onChange={upload} />
          </div>
          {p.documents.length === 0 && <p className="muted small">Aucune pièce jointe</p>}
          <ul className="doc-list">
            {p.documents.map((d) => (
              <li key={d.id}>
                <FileText size={16} />
                <button type="button" className="link" onClick={() => download(`/projects/${p.id}/documents/${d.id}`, d.name)}>{d.name}</button>
                <small className="muted">{Math.round(d.size_bytes / 1024)} Ko · {date(d.created_at)}</small>
              </li>
            ))}
          </ul>
        </div>
        <div className="card">
          <h3>Historique du dossier</h3>
          <ul className="timeline">
            {p.history.slice().reverse().map((h) => {
              const Icon = HISTORY_ICONS[h.action] || MessageSquare;
              return (
                <li key={h.id} className={`tl-${h.action}`}>
                  <span className="tl-icon"><Icon size={14} /></span>
                  <div>
                    <b>{h.action_label}</b>
                    {h.step_name && <small className="block">Étape {h.step_order} · {h.step_name}</small>}
                    {h.to_agent_name && <small className="block">→ Agent : {h.to_agent_name}</small>}
                    {h.comment && <p className="tl-comment">« {h.comment} »</p>}
                    <small className="muted">{h.user_name || 'Système'} · {dateTime(h.created_at)}</small>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      {action && <ActionModal project={p} action={action} onClose={() => setAction(null)} onDone={(u) => { setAction(null); setData(u); }} />}
    </>
  );
}
