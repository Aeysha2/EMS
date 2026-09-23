import { Check, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Badge, Empty, Field, Loader, Modal, PageHeader, Tabs } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api, { qs } from '../services/api';
import { date, dateTime, LEAVE_STATUS, LEAVE_TYPES, todayISO } from '../utils/format';
import useFetch from '../utils/useFetch';

const countWorkingDays = (s, e) => {
  if (!s || !e || e < s) return 0;
  let n = 0;
  const d = new Date(`${s}T00:00:00`);
  const end = new Date(`${e}T00:00:00`);
  while (d <= end) { if (d.getDay() % 6 !== 0) n += 1; d.setDate(d.getDate() + 1); }
  return n;
};

function ApplyForm({ balance, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ leave_type: 'paid', start_date: todayISO(), end_date: todayISO(), reason: '' });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const days = countWorkingDays(form.start_date, form.end_date);
  const available = { casual: balance?.casual_balance, sick: balance?.sick_balance, paid: balance?.paid_balance }[form.leave_type];

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/leaves', form);
      toast.success('Demande envoyée aux RH');
      onSaved();
    } catch (err) { toast.error(err); }
  };

  return (
    <Modal title="Demande de congé" onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>Annuler</button><button form="leave-form" className="btn btn-primary" disabled={!days}>Envoyer la demande</button></>}>
      <form id="leave-form" className="form-grid" onSubmit={submit}>
        <Field label="Type de congé" full>
          <select value={form.leave_type} onChange={set('leave_type')}>
            {Object.entries(LEAVE_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        <Field label="Du"><input type="date" required value={form.start_date} onChange={set('start_date')} /></Field>
        <Field label="Au"><input type="date" required min={form.start_date} value={form.end_date} onChange={set('end_date')} /></Field>
        <Field label="Motif" full><textarea rows={3} value={form.reason} onChange={set('reason')} /></Field>
        <div className="field-full alert alert-info">
          <b>{days}</b> jour(s) ouvré(s) demandé(s)
          {available !== undefined && <> · solde disponible : <b>{available} j</b> (hors demandes en attente)</>}
        </div>
      </form>
    </Modal>
  );
}

function ReviewModal({ leave, action, onClose, onDone }) {
  const toast = useToast();
  const [comment, setComment] = useState('');
  const submit = async () => {
    try {
      await api.patch(`/leaves/${leave.id}/review`, { action, comment });
      toast.success(action === 'approve' ? 'Congé approuvé' : 'Congé rejeté');
      onDone();
    } catch (err) { toast.error(err); }
  };
  return (
    <Modal title={`${action === 'approve' ? 'Approuver' : 'Rejeter'} la demande de ${leave.full_name}`} onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>Annuler</button>
        <button type="button" className={`btn ${action === 'approve' ? 'btn-success' : 'btn-danger'}`} onClick={submit}>Confirmer</button></>}>
      <p>{LEAVE_TYPES[leave.leave_type]} — {leave.days} jour(s) du {date(leave.start_date)} au {date(leave.end_date)}</p>
      {leave.reason && <p className="muted">Motif : {leave.reason}</p>}
      <Field label="Commentaire (transmis à l’agent)" full><textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
    </Modal>
  );
}

export default function Leaves() {
  const { user, isHR, canManage } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState(canManage ? 'approvals' : 'mine');
  const [status, setStatus] = useState('');
  const [applying, setApplying] = useState(false);
  const [review, setReview] = useState(null);
  const balance = useFetch(user.employee_id ? '/leaves/balance' : null);
  const scope = tab === 'mine' ? 'mine' : isHR ? 'all' : 'team';
  const list = useFetch(`/leaves${qs({ scope, status: tab === 'approvals' ? 'pending' : status })}`);

  const cancel = async (l) => {
    if (!window.confirm('Annuler cette demande de congé ?')) return;
    try { await api.patch(`/leaves/${l.id}/cancel`); toast.success('Demande annulée'); list.reload(); balance.reload(); } catch (err) { toast.error(err); }
  };

  const b = balance.data;
  return (
    <>
      <PageHeader title="Congés" subtitle="Demandes, validations et soldes">
        {user.employee_id && <button type="button" className="btn btn-primary" onClick={() => setApplying(true)}><Plus size={16} /> Demander un congé</button>}
      </PageHeader>

      {b && (
        <div className="stats small">
          <div className="stat-card tone-success"><div><div className="stat-value">{b.paid_balance} j</div><div className="stat-label">Congés payés</div></div></div>
          <div className="stat-card tone-info"><div><div className="stat-value">{b.casual_balance} j</div><div className="stat-label">Occasionnels</div></div></div>
          <div className="stat-card tone-warning"><div><div className="stat-value">{b.sick_balance} j</div><div className="stat-label">Maladie</div></div></div>
          <div className="stat-card tone-purple"><div><div className="stat-value">{b.pending_days} j</div><div className="stat-label">En attente</div><div className="stat-sub">{b.taken_days} j pris en {b.balance_year}</div></div></div>
        </div>
      )}

      <Tabs value={tab} onChange={setTab} tabs={[
        canManage && { value: 'approvals', label: 'À valider' },
        user.employee_id && { value: 'mine', label: 'Mon historique' },
        canManage && { value: 'all', label: isHR ? 'Toutes les demandes' : 'Mon équipe' },
      ]} />
      {tab !== 'approvals' && (
        <div className="card toolbar">
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Tous les statuts</option>
            {Object.entries(LEAVE_STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
      )}

      {list.loading && !list.data && <Loader />}
      {list.data?.length === 0 && <Empty>{tab === 'approvals' ? 'Aucune demande en attente 🎉' : 'Aucune demande'}</Empty>}
      {list.data?.length > 0 && (
        <div className="card table-wrap">
          <table className="table">
            <thead><tr>{tab !== 'mine' && <th>Agent</th>}<th>Type</th><th>Période</th><th className="num">Jours</th><th>Motif</th><th>Statut</th><th /></tr></thead>
            <tbody>
              {list.data.map((l) => (
                <tr key={l.id}>
                  {tab !== 'mine' && <td><b>{l.full_name}</b><small className="block muted">{l.department_name}</small></td>}
                  <td>{LEAVE_TYPES[l.leave_type]}</td>
                  <td>{date(l.start_date)} → {date(l.end_date)}<small className="block muted">demandé le {dateTime(l.created_at)}</small></td>
                  <td className="num">{l.days}</td>
                  <td className="small">{l.reason || '—'}{l.review_comment && <small className="block muted">↳ {l.reviewer_name} : {l.review_comment}</small>}</td>
                  <td><Badge map={LEAVE_STATUS} value={l.status} /></td>
                  <td className="actions">
                    {l.status === 'pending' && canManage && l.employee_id !== user.employee_id && (
                      <>
                        <button type="button" className="btn btn-sm btn-success" onClick={() => setReview({ leave: l, action: 'approve' })}><Check size={14} /> Approuver</button>
                        <button type="button" className="btn btn-sm btn-danger-outline" onClick={() => setReview({ leave: l, action: 'reject' })}><X size={14} /> Rejeter</button>
                      </>
                    )}
                    {['pending', 'approved'].includes(l.status) && (l.employee_id === user.employee_id || isHR)
                      && (l.status === 'pending' || l.start_date > todayISO() || isHR) && (
                      <button type="button" className="btn btn-sm" onClick={() => cancel(l)}>Annuler</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {applying && <ApplyForm balance={b} onClose={() => setApplying(false)} onSaved={() => { setApplying(false); list.reload(); balance.reload(); }} />}
      {review && <ReviewModal {...review} onClose={() => setReview(null)} onDone={() => { setReview(null); list.reload(); }} />}
    </>
  );
}
