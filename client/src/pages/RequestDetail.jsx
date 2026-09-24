import {
  AlertTriangle, ArrowLeft, Bell, CheckCircle2, CornerUpLeft, FileDown, FilePlus2, FileText, MessageSquare, PauseCircle,
  PlayCircle, Send, UserPlus, XCircle,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Badge, ErrorBox, Field, Loader, Modal } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api, { download, qs } from '../services/api';
import { ASSIGNEE, date, dateTime, PRIORITY, readFile, REQUEST_STATUS } from '../utils/format';
import useFetch from '../utils/useFetch';

const ACTIONS = {
  approve: { label: 'Valider l’étape', icon: CheckCircle2, tone: 'btn-success' },
  request_documents: { label: 'Demander des pièces', icon: PauseCircle, tone: 'btn-warning', needComment: true },
  resume: { label: 'Reprendre le traitement', icon: PlayCircle, tone: 'btn-primary' },
  return: { label: 'Renvoyer à l’étape précédente', icon: CornerUpLeft, tone: '', needComment: true },
  reject: { label: 'Rejeter', icon: XCircle, tone: 'btn-danger-outline', needComment: true },
  assign: { label: 'Désigner un agent traitant', icon: UserPlus, tone: '', agent: true },
  cancel: { label: 'Annuler ma demande', icon: XCircle, tone: 'btn-danger-outline' },
  comment: { label: 'Commenter', icon: MessageSquare, tone: '', needComment: true },
};
const HISTORY_ICON = { creation: Send, approve: CheckCircle2, final: CheckCircle2, reject: XCircle, return: CornerUpLeft,
  request_documents: PauseCircle, resume: PlayCircle, assign: UserPlus, comment: MessageSquare, document: FileText,
  cancel: XCircle, alert: Bell };

function ActionModal({ request, action, onClose, onDone }) {
  const toast = useToast();
  const def = ACTIONS[action];
  const [comment, setComment] = useState('');
  const [agent, setAgent] = useState('');
  const { data: agents } = useFetch(def.agent ? `/employees${qs({ scope: 'institution', limit: 100 })}` : null);
  const submit = async () => {
    try {
      onDone(await api.post(`/requests/${request.id}/actions`, { action, comment, assigned_employee_id: agent || undefined }));
      toast.success(action === 'approve' && request.current_step === request.steps.length ? 'Validation finale : l’acte est appliqué au dossier' : 'Action enregistrée');
    } catch (err) { toast.error(err); }
  };
  const last = action === 'approve' && request.current_step === request.steps.length;
  return (
    <Modal title={def.label} onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>Annuler</button>
        <button type="button" className={`btn ${def.tone || 'btn-primary'}`} onClick={submit}
          disabled={(def.needComment && !comment) || (def.agent && !agent)}>Confirmer</button></>}>
      {last && request.effect !== 'none' && (
        <p className="alert alert-warning">Dernière étape : la validation applique l’acte au dossier de l’agent
          (affectation, grade, position, solde de congés…). Cette opération est tracée.</p>
      )}
      {def.agent && (
        <Field label="Agent traitant" full>
          <select value={agent} onChange={(e) => setAgent(e.target.value)}>
            <option value="">—</option>{agents?.data.map((e) => <option key={e.id} value={e.id}>{e.full_name} — {e.fonction || e.structure_name}</option>)}
          </select>
        </Field>
      )}
      <Field label={def.needComment ? 'Motif / commentaire *' : 'Commentaire (facultatif)'} full>
        <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
      </Field>
    </Modal>
  );
}

const PAYLOAD_LABELS = {
  target_structure_id: null, target_institution_id: null, leave_id: null, enrollment_id: null, session_id: null,
  fonction: 'Fonction', motif: 'Motif', grade: 'Grade', echelon: 'Échelon', hierarchie: 'Hiérarchie', salary: 'Salaire de base',
  position_statutaire: 'Position', effective_date: 'Date d’effet', acte_reference: 'Référence de l’acte', start_date: 'Du',
  end_date: 'Au', days: 'Jours', leave_type: 'Type', destination: 'Destination', corps_id: null, head_of_structure_id: null,
};

export default function RequestDetail() {
  const { id } = useParams();
  const { isDRH } = useAuth();
  const { data: r, setData, loading, error, reload } = useFetch(`/requests/${id}`);
  const [action, setAction] = useState(null);
  const fileRef = useRef(null);
  const toast = useToast();
  if (loading && !r) return <Loader />;
  if (error) return <ErrorBox error={error} />;

  const open = ['in_progress', 'awaiting_documents'].includes(r.status);
  const buttons = [];
  if (open && r.permissions.canAct) {
    if (r.status === 'awaiting_documents') buttons.push('resume'); else buttons.push('approve', 'request_documents');
    if (r.current_step > 1) buttons.push('return');
    buttons.push('reject');
  }
  if (open && r.permissions.canAssign && isDRH) buttons.push('assign');
  if (r.permissions.canCancel) buttons.push('cancel');
  buttons.push('comment');

  const upload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      await api.post(`/requests/${r.id}/documents`, { name: file.name, mime_type: file.type, content: await readFile(file) });
      toast.success('Pièce jointe ajoutée');
      reload();
    } catch (err) { toast.error(err); }
  };

  const details = Object.entries(r.payload || {}).filter(([k, v]) => PAYLOAD_LABELS[k] !== null && v !== '' && v !== undefined);

  return (
    <>
      <Link to="/requests" className="link back"><ArrowLeft size={16} /> Retour aux demandes</Link>
      <div className="card project-head">
        <div>
          <div className="row gap wrap"><h2 className="mono">{r.reference}</h2><Badge map={REQUEST_STATUS} value={r.status} /><Badge map={PRIORITY} value={r.priority} />
            {r.is_overdue && <span className="badge badge-danger"><AlertTriangle size={12} /> Délai réglementaire dépassé</span>}</div>
          <h3>{r.type_name} — {r.title}</h3>
          <p className="muted">Agent : <Link to={`/agents/${r.employee_id}`} className="link">{r.employee_name}</Link> ({r.employee_sigrh_id}) · {r.employee_structure_name} · {r.institution_name}</p>
        </div>
        <button type="button" className="btn" onClick={() => download(`/requests/${r.id}/receipt`)}><FileDown size={16} /> Accusé de dépôt</button>
      </div>

      <div className="card">
        <h3>Circuit de validation</h3>
        <ol className="stepper">
          {r.steps.map((s) => {
            const state = r.status === 'approved' || s.step_order < r.current_step ? 'done'
              : s.step_order === r.current_step ? (r.status === 'rejected' ? 'rejected' : r.status === 'cancelled' ? 'todo' : 'current') : 'todo';
            return (
              <li key={s.id} className={`step ${state}`}>
                <span className="step-dot">{state === 'done' ? '✓' : state === 'rejected' ? '✕' : s.step_order}</span>
                <div><b>{s.name}</b><small>{s.structure_name || ASSIGNEE[s.assignee_kind]} · {s.expected_days} j</small></div>
              </li>
            );
          })}
        </ol>
        {open && (
          <p className="small">
            Étape en cours : <b>{r.steps[r.current_step - 1]?.name}</b> — échéance <b className={r.step_overdue ? 'text-danger' : ''}>{date(r.step_due_date)}</b>
            {r.current_actors.length > 0 && <> · Valideur(s) : {r.current_actors.join(', ')}</>}
            {r.assigned_name && <> · Agent traitant : {r.assigned_name}</>}
          </p>
        )}
        <div className="action-bar">
          {buttons.map((b) => { const A = ACTIONS[b]; return <button type="button" key={b} className={`btn ${A.tone}`} onClick={() => setAction(b)}><A.icon size={16} /> {A.label}</button>; })}
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>Informations</h3>
          <dl className="info-grid">
            <div><dt>Déposée le</dt><dd>{dateTime(r.created_at)}</dd></div>
            <div><dt>Par</dt><dd>{r.created_by_name || '—'}</dd></div>
            <div><dt>Canal</dt><dd>{r.deposit_channel}</dd></div>
            <div><dt>Délai réglementaire</dt><dd>{r.sla_days} jours (échéance {date(r.due_date)})</dd></div>
            {r.target_structure_name && <div><dt>Structure d’accueil</dt><dd>{r.target_structure_name}</dd></div>}
            {details.map(([k, v]) => <div key={k}><dt>{PAYLOAD_LABELS[k] || k}</dt><dd>{String(v)}</dd></div>)}
            {r.closed_at && <div><dt>Clôturée le</dt><dd>{dateTime(r.closed_at)}</dd></div>}
          </dl>
          {r.description && <p className="tl-comment">{r.description}</p>}
          <div className="card-head"><h4>Pièces justificatives</h4>
            <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()}><FilePlus2 size={14} /> Ajouter</button>
            <input ref={fileRef} type="file" hidden accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.txt" onChange={upload} />
          </div>
          {r.documents.length === 0 && <p className="muted small">Aucune pièce</p>}
          <ul className="doc-list">{r.documents.map((d) => (
            <li key={d.id}><FileText size={16} /><button type="button" className="link" onClick={() => download(`/requests/${r.id}/documents/${d.id}`, d.name)}>{d.name}</button>
              <small className="muted">{Math.round(d.size_bytes / 1024)} Ko</small></li>))}</ul>
        </div>
        <div className="card">
          <h3>Historique</h3>
          <ul className="timeline">
            {r.history.slice().reverse().map((h) => {
              const Icon = HISTORY_ICON[h.action] || MessageSquare;
              return (
                <li key={h.id} className={`tl-${h.action}`}>
                  <span className="tl-icon"><Icon size={14} /></span>
                  <div>
                    <b>{h.action_label}</b>
                    {h.step_name && <small className="block">Étape {h.step_order} · {h.step_name}</small>}
                    {h.assigned_name && <small className="block">→ {h.assigned_name}</small>}
                    {h.comment && <p className="tl-comment">« {h.comment} »</p>}
                    <small className="muted">{h.user_name || 'Système'} · {dateTime(h.created_at)}</small>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      {action && <ActionModal request={r} action={action} onClose={() => setAction(null)} onDone={(u) => { setAction(null); setData(u); }} />}
    </>
  );
}
