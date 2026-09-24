import { CalendarPlus, GraduationCap, Plus, Users } from 'lucide-react';
import { useState } from 'react';
import { Badge, Empty, Field, Loader, Modal, PageHeader } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api, { qs } from '../services/api';
import { date, ENROLLMENT_STATUS, todayISO } from '../utils/format';
import useFetch from '../utils/useFetch';

function Participants({ session, onClose }) {
  const { isDRH } = useAuth();
  const toast = useToast();
  const { data, reload } = useFetch(`/trainings/sessions/${session.id}/participants`);
  const { data: agents } = useFetch(isDRH ? `/employees${qs({ scope: 'institution', limit: 100 })}` : null);
  const [add, setAdd] = useState('');
  const act = async (fn, msg) => { try { await fn(); toast.success(msg); reload(); } catch (err) { toast.error(err); } };
  return (
    <Modal wide title={`Participants — ${session.title}`} onClose={onClose}>
      {isDRH && (
        <div className="row gap">
          <select value={add} onChange={(e) => setAdd(e.target.value)} aria-label="Agent à inscrire"><option value="">Inscrire un agent de mon institution…</option>
            {agents?.data.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}</select>
          <button type="button" className="btn btn-sm" disabled={!add} onClick={() => act(() => api.post(`/trainings/sessions/${session.id}/participants`, { employee_id: add }), 'Agent inscrit')}>Inscrire</button>
        </div>
      )}
      {!data ? <Loader /> : data.length === 0 ? <Empty>Aucun participant visible</Empty> : (
        <table className="table"><thead><tr><th>Agent</th><th>Structure</th><th>Statut</th>{isDRH && <th />}</tr></thead>
          <tbody>{data.map((p) => <tr key={p.id}><td>{p.full_name}</td><td>{p.structure_name}</td><td><Badge map={ENROLLMENT_STATUS} value={p.status} /></td>
            {isDRH && <td className="actions">{['validated', 'attended'].includes(p.status) && (<>
              <button type="button" className="btn btn-sm" onClick={() => act(() => api.patch(`/trainings/enrollments/${p.id}`, { status: 'attended' }), 'Présence enregistrée')}>Présent</button>
              {session.is_certifying && <button type="button" className="btn btn-sm btn-success" onClick={() => act(() => api.patch(`/trainings/enrollments/${p.id}`, { status: 'certified', result: 'Validé' }), 'Certification ajoutée au dossier')}>Certifier</button>}
              <button type="button" className="btn btn-sm" onClick={() => act(() => api.patch(`/trainings/enrollments/${p.id}`, { status: 'absent' }), 'Absence enregistrée')}>Absent</button></>)}</td>}
          </tr>)}</tbody></table>
      )}
    </Modal>
  );
}

export default function Trainings() {
  const { isDRH, isCentral, hasDossier } = useAuth();
  const toast = useToast();
  const { data, loading, reload } = useFetch('/trainings');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const canManage = isDRH || isCentral;

  const enroll = async (s, t) => {
    const motivation = window.prompt(`Motivation pour « ${t.title} » (facultatif) :`, '');
    if (motivation === null) return;
    try { const r = await api.post(`/trainings/sessions/${s.id}/enroll`, { motivation }); toast.success(`Demande ${r.reference} transmise à votre supérieur`); reload(); } catch (err) { toast.error(err); }
  };
  const save = async (e) => {
    e.preventDefault();
    try {
      if (modal.kind === 'training') await api.post('/trainings', form);
      else await api.post(`/trainings/${modal.training.id}/sessions`, form);
      toast.success('Enregistré'); setModal(null); reload();
    } catch (err) { toast.error(err); }
  };

  return (
    <>
      <PageHeader title="Formation" subtitle="Catalogue, sessions, inscriptions et certifications des agents publics">
        {canManage && <button type="button" className="btn btn-primary" onClick={() => { setForm({ duration_days: 1 }); setModal({ kind: 'training' }); }}><Plus size={16} /> Ajouter au catalogue</button>}
      </PageHeader>
      {loading && !data && <Loader />}
      {data?.length === 0 && <Empty icon={GraduationCap}>Catalogue vide</Empty>}
      <div className="card-grid wide">
        {data?.map((t) => (
          <div key={t.id} className="card training-card">
            <div className="card-head"><h3>{t.title}</h3>{t.is_certifying && <span className="badge badge-success">Certifiante</span>}</div>
            <p className="muted small">{t.provider} · {t.domain} · {t.duration_days} jour(s)</p>
            {t.sessions.length === 0 && <p className="muted small">Aucune session programmée</p>}
            <ul className="session-list">
              {t.sessions.map((s) => (
                <li key={s.id}>
                  <div><b>{date(s.start_date)} → {date(s.end_date)}</b><small className="block muted">{s.location} · {s.enrolled}/{s.capacity} inscrits
                    {s.institution_name ? ` · ${s.institution_name}` : ' · interministérielle'}</small></div>
                  <div className="row">
                    {hasDossier && s.status === 'planned' && !s.i_am_enrolled && s.start_date > todayISO() && <button type="button" className="btn btn-sm btn-primary" onClick={() => enroll(s, t)}>S’inscrire</button>}
                    {s.i_am_enrolled && <span className="badge badge-info">Inscrit(e)</span>}
                    {canManage && <button type="button" className="icon-btn" title="Participants" onClick={() => setModal({ kind: 'participants', session: { ...s, title: t.title, is_certifying: t.is_certifying } })}><Users size={16} /></button>}
                  </div>
                </li>
              ))}
            </ul>
            {canManage && <button type="button" className="link" onClick={() => { setForm({ start_date: todayISO(), end_date: todayISO(), capacity: 20 }); setModal({ kind: 'session', training: t }); }}><CalendarPlus size={14} /> Programmer une session</button>}
          </div>
        ))}
      </div>
      {modal?.kind === 'participants' && <Participants session={modal.session} onClose={() => { setModal(null); reload(); }} />}
      {(modal?.kind === 'training' || modal?.kind === 'session') && (
        <Modal title={modal.kind === 'training' ? 'Nouvelle formation' : `Nouvelle session — ${modal.training.title}`} onClose={() => setModal(null)}
          footer={<><button type="button" className="btn" onClick={() => setModal(null)}>Annuler</button><button form="tr-form" className="btn btn-primary">Enregistrer</button></>}>
          <form id="tr-form" className="form-grid" onSubmit={save}>
            {modal.kind === 'training' ? (<>
              <Field label="Code *"><input required value={form.code || ''} onChange={set('code')} /></Field>
              <Field label="Durée (jours)"><input type="number" min="1" value={form.duration_days || 1} onChange={set('duration_days')} /></Field>
              <Field label="Intitulé *" full><input required value={form.title || ''} onChange={set('title')} /></Field>
              <Field label="Organisme"><input value={form.provider || ''} onChange={set('provider')} placeholder="ENA, école de formation…" /></Field>
              <Field label="Domaine"><input value={form.domain || ''} onChange={set('domain')} /></Field>
              <label className="check field-full"><input type="checkbox" checked={!!form.is_certifying} onChange={(e) => setForm({ ...form, is_certifying: e.target.checked })} /> Formation certifiante</label>
            </>) : (<>
              <Field label="Début"><input type="date" required value={form.start_date} onChange={set('start_date')} /></Field>
              <Field label="Fin"><input type="date" required value={form.end_date} onChange={set('end_date')} /></Field>
              <Field label="Lieu"><input value={form.location || ''} onChange={set('location')} /></Field>
              <Field label="Places"><input type="number" min="1" value={form.capacity} onChange={set('capacity')} /></Field>
              <p className="field-full muted small">{isDRH ? 'Session réservée aux agents de votre institution.' : 'Session interministérielle, ouverte à toutes les institutions.'}</p>
            </>)}
          </form>
        </Modal>
      )}
    </>
  );
}
