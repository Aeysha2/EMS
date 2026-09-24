import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../context/ToastContext';
import api from '../services/api';
import { ASSIGNEE, CATEGORY, todayISO } from '../utils/format';
import useFetch from '../utils/useFetch';
import { Field, Modal } from './ui';

/**
 * Dépôt d'une demande (agent pour lui-même) ou initiation d'un acte (DRH pour un agent de son institution).
 * Les champs demandés dépendent de l'effet de l'acte (mutation, avancement, nomination, position…).
 */
export default function RequestForm({ employee, onClose }) {
  const toast = useToast();
  const navigate = useNavigate();
  const forOther = !!employee;
  const { data: config } = useFetch('/workflows/types');
  const { data: structures } = useFetch('/structures?flat=1');
  const { data: corps } = useFetch('/corps');
  const [typeId, setTypeId] = useState('');
  const [form, setForm] = useState({ title: '', description: '', priority: 'normal' });
  const [payload, setPayload] = useState({ effective_date: todayISO() });
  const setP = (k) => (e) => setPayload({ ...payload, [k]: e.target.value });

  const types = (config?.types || []).filter((t) => t.is_active && !['leave', 'formation'].includes(t.effect)
    && (forOther || t.agent_can_submit));
  const type = types.find((t) => String(t.id) === String(typeId));

  const submit = async (e) => {
    e.preventDefault();
    try {
      const r = await api.post('/requests', { type_id: typeId, employee_id: employee?.id, ...form,
        title: form.title || type.name, payload, deposit_channel: forOther ? 'structure' : 'portail' });
      toast.success(`Demande ${r.reference} déposée — le premier valideur est notifié`);
      navigate(`/requests/${r.id}`);
    } catch (err) { toast.error(err); }
  };

  return (
    <Modal wide title={forOther ? `Initier un acte pour ${employee.full_name}` : 'Nouvelle demande'} onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>Annuler</button><button form="req-form" className="btn btn-primary" disabled={!type}>Déposer</button></>}>
      <form id="req-form" className="form-grid" onSubmit={submit}>
        <Field label="Type de demande / d’acte *" full>
          <select required value={typeId} onChange={(e) => setTypeId(e.target.value)}>
            <option value="">—</option>
            {Object.entries(CATEGORY).map(([cat, label]) => (
              <optgroup key={cat} label={label}>
                {types.filter((t) => t.category === cat).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </optgroup>
            ))}
          </select>
        </Field>
        {type && (
          <div className="field-full alert alert-info small">
            <div>
              Délai réglementaire : <b>{type.sla_days} jours</b>{type.required_documents && <> · Pièces : {type.required_documents}</>}
              <br />Circuit : {type.steps.map((s) => `${s.step_order}. ${s.name} (${s.structure_name || ASSIGNEE[s.assignee_kind]})`).join(' → ')}
            </div>
          </div>
        )}
        {type?.effect === 'mutation' && (
          <>
            <Field label="Structure d’accueil *" full>
              <select required value={payload.target_structure_id || ''} onChange={setP('target_structure_id')}>
                <option value="">—</option>
                {structures?.filter((s) => s.is_active).map((s) => <option key={s.id} value={s.id}>{s.institution_sigle} — {s.name}</option>)}
              </select>
            </Field>
            <Field label="Fonction dans la structure d’accueil"><input value={payload.fonction || ''} onChange={setP('fonction')} /></Field>
            <Field label="Motif"><input value={payload.motif || ''} onChange={setP('motif')} placeholder="Rapprochement de conjoint, nécessité de service…" /></Field>
          </>
        )}
        {type?.effect === 'avancement' && (
          <>
            <Field label="Nouveau grade"><input value={payload.grade || ''} onChange={setP('grade')} /></Field>
            <Field label="Nouvel échelon"><input type="number" min="1" max="20" value={payload.echelon || ''} onChange={setP('echelon')} /></Field>
            <Field label="Nouvelle hiérarchie (promotion)"><select value={payload.hierarchie || ''} onChange={setP('hierarchie')}><option value="">Inchangée</option>{['A', 'B', 'C', 'D'].map((h) => <option key={h}>{h}</option>)}</select></Field>
            <Field label="Nouveau corps (promotion)"><select value={payload.corps_id || ''} onChange={setP('corps_id')}><option value="">Inchangé</option>{corps?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            <Field label="Nouveau salaire de base"><input type="number" min="0" step="1000" value={payload.salary || ''} onChange={setP('salary')} /></Field>
          </>
        )}
        {type?.effect === 'nomination' && (
          <>
            <Field label="Fonction *" full><input required value={payload.fonction || ''} onChange={setP('fonction')} /></Field>
            <Field label="Responsable de la structure (facultatif)" full>
              <select value={payload.head_of_structure_id || ''} onChange={setP('head_of_structure_id')}>
                <option value="">—</option>{structures?.map((s) => <option key={s.id} value={s.id}>{s.institution_sigle} — {s.name}</option>)}
              </select>
            </Field>
          </>
        )}
        {type?.effect === 'position' && (
          <Field label="Position demandée *">
            <select required value={payload.position_statutaire || ''} onChange={setP('position_statutaire')}>
              <option value="">—</option>
              {type.code === 'DETACHEMENT' && <option value="detachement">Détachement</option>}
              {type.code === 'DISPONIBILITE' && <option value="disponibilite">Disponibilité</option>}
              <option value="activite">Réintégration (activité)</option>
            </select>
          </Field>
        )}
        {type && type.effect !== 'none' && (
          <>
            <Field label="Date d’effet"><input type="date" value={payload.effective_date} onChange={setP('effective_date')} /></Field>
            <Field label="Référence de l’acte (décret, arrêté)"><input value={payload.acte_reference || ''} onChange={setP('acte_reference')} /></Field>
          </>
        )}
        <Field label="Objet" full><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={type?.name} /></Field>
        <Field label="Exposé / commentaire" full><textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        <Field label="Priorité">
          <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
            <option value="low">Basse</option><option value="normal">Normale</option><option value="high">Haute</option><option value="urgent">Urgente</option>
          </select>
        </Field>
      </form>
    </Modal>
  );
}
