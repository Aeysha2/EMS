import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../services/api';
import { todayISO } from '../utils/format';
import useFetch from '../utils/useFetch';
import { Field, Modal } from './ui';

export default function ProjectForm({ config, onClose, onSaved }) {
  const toast = useToast();
  const { canManage } = useAuth();
  const { data: emps } = useFetch(canManage ? '/employees?limit=100&status=active&sort=name' : null);
  const [form, setForm] = useState({
    title: '', description: '', request_type_id: '', deposit_type_id: '', applicant_name: '', applicant_matricule: '',
    applicant_phone: '', applicant_email: '', applicant_structure: '', deposit_date: todayISO(), priority: 'normal', agent_id: '',
  });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const type = config.requestTypes.find((t) => String(t.id) === String(form.request_type_id));

  const submit = async (e) => {
    e.preventDefault();
    try {
      const p = await api.post('/projects', form);
      toast.success(`Dossier ${p.reference} enregistré`);
      onSaved(p);
    } catch (err) { toast.error(err); }
  };

  return (
    <Modal wide title="Enregistrer un nouveau dossier" onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>Annuler</button><button form="proj-form" className="btn btn-primary">Enregistrer le dossier</button></>}>
      <form id="proj-form" className="form-grid" onSubmit={submit}>
        <h4 className="field-full">Demande</h4>
        <Field label="Type de demande *">
          <select required value={form.request_type_id} onChange={set('request_type_id')}>
            <option value="">—</option>
            {config.requestTypes.filter((t) => t.is_active).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
        <Field label="Type de dépôt *">
          <select required value={form.deposit_type_id} onChange={set('deposit_type_id')}>
            <option value="">—</option>
            {config.depositTypes.filter((t) => t.is_active).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
        {type && (
          <div className="field-full alert alert-info small">
            Délai de traitement : <b>{type.sla_days} jours</b>
            {type.required_documents && <> · Pièces requises : {type.required_documents}</>}
          </div>
        )}
        <Field label="Objet du dossier *" full><input required value={form.title} onChange={set('title')} /></Field>
        <Field label="Description" full><textarea rows={2} value={form.description} onChange={set('description')} /></Field>
        <Field label="Date de dépôt"><input type="date" max={todayISO()} value={form.deposit_date} onChange={set('deposit_date')} /></Field>
        <Field label="Priorité">
          <select value={form.priority} onChange={set('priority')}>
            <option value="low">Basse</option><option value="normal">Normale</option><option value="high">Haute</option><option value="urgent">Urgente</option>
          </select>
        </Field>
        <h4 className="field-full">Demandeur</h4>
        <Field label="Nom complet *"><input required value={form.applicant_name} onChange={set('applicant_name')} /></Field>
        <Field label="Matricule"><input value={form.applicant_matricule} onChange={set('applicant_matricule')} /></Field>
        <Field label="Structure / ministère d’origine"><input value={form.applicant_structure} onChange={set('applicant_structure')} /></Field>
        <Field label="Téléphone"><input value={form.applicant_phone} onChange={set('applicant_phone')} /></Field>
        <Field label="Email"><input type="email" value={form.applicant_email} onChange={set('applicant_email')} /></Field>
        {canManage && (
          <Field label="Agent traitant (optionnel)">
            <select value={form.agent_id} onChange={set('agent_id')}>
              <option value="">Affecter plus tard</option>
              {emps?.data.map((e) => <option key={e.id} value={e.id}>{e.full_name} – {e.department_name}</option>)}
            </select>
          </Field>
        )}
      </form>
    </Modal>
  );
}
