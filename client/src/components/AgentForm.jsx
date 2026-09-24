import { useState } from 'react';
import { useToast } from '../context/ToastContext';
import api from '../services/api';
import { POSITIONS, STATUT_EMPLOI } from '../utils/format';
import useFetch from '../utils/useFetch';
import { Field, Modal } from './ui';

const EMPTY = {
  first_name: '', last_name: '', sexe: '', date_of_birth: '', place_of_birth: '', nationality: 'Sénégalaise',
  marital_status: '', children_count: 0, email: '', phone: '', address: '', structure_id: '', fonction: '', corps_id: '',
  hierarchie: '', grade: '', echelon: '', statut_emploi: 'fonctionnaire', position_statutaire: 'activite',
  date_entree_fp: '', date_prise_service: '', salary: '', matricule_solde: '', nin: '',
};

/** Création ou correction d'un dossier agent (DRH de l'institution). */
export default function AgentForm({ agent, institutionId, onClose, onSaved }) {
  const toast = useToast();
  const editing = !!agent;
  const { data: structures } = useFetch('/structures?flat=1');
  const { data: corps } = useFetch('/corps');
  const [form, setForm] = useState(() => {
    const base = { ...EMPTY, ...(agent || {}) };
    return Object.fromEntries(Object.keys(EMPTY).map((k) => [k, base[k] ?? '']));
  });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const mine = (structures || []).filter((s) => s.institution_id === institutionId && s.is_active);

  const submit = async (e) => {
    e.preventDefault();
    const body = { ...form };
    if (!body.nin) delete body.nin;
    if (body.salary === '') body.salary = 0;
    if (body.corps_id && !body.hierarchie) body.hierarchie = corps.find((c) => String(c.id) === String(body.corps_id))?.hierarchie || '';
    try {
      const saved = editing ? await api.put(`/employees/${agent.id}`, body) : await api.post('/employees', body);
      toast.success(editing ? 'Dossier mis à jour (modifications tracées)' : `Agent ${saved.sigrh_id} enregistré dans le référentiel`);
      onSaved(saved);
    } catch (err) { toast.error(err); }
  };

  return (
    <Modal wide title={editing ? `Corriger le dossier de ${agent.full_name}` : 'Enregistrer un agent dans le référentiel'} onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>Annuler</button><button form="agent-form" className="btn btn-primary">Enregistrer</button></>}>
      <form id="agent-form" className="form-grid" onSubmit={submit}>
        <h4 className="field-full">État civil</h4>
        <Field label="Prénom(s) *"><input required value={form.first_name} onChange={set('first_name')} /></Field>
        <Field label="Nom *"><input required value={form.last_name} onChange={set('last_name')} /></Field>
        <Field label="Sexe"><select value={form.sexe} onChange={set('sexe')}><option value="">—</option><option value="F">Féminin</option><option value="M">Masculin</option></select></Field>
        <Field label="Date de naissance"><input type="date" value={form.date_of_birth} onChange={set('date_of_birth')} /></Field>
        <Field label="Lieu de naissance"><input value={form.place_of_birth} onChange={set('place_of_birth')} /></Field>
        <Field label={editing ? 'Nouveau NIN (laisser vide pour conserver)' : 'NIN (carte d’identité)'} hint="13 ou 14 chiffres — stocké chiffré">
          <input inputMode="numeric" value={form.nin} onChange={set('nin')} autoComplete="off" />
        </Field>
        <Field label="Situation matrimoniale"><input value={form.marital_status} onChange={set('marital_status')} /></Field>
        <Field label="Nombre d’enfants"><input type="number" min="0" value={form.children_count} onChange={set('children_count')} /></Field>
        <h4 className="field-full">Coordonnées</h4>
        <Field label="Email professionnel *"><input type="email" required value={form.email} onChange={set('email')} /></Field>
        <Field label="Téléphone"><input value={form.phone} onChange={set('phone')} /></Field>
        <Field label="Adresse" full><input value={form.address} onChange={set('address')} /></Field>
        <h4 className="field-full">Situation administrative</h4>
        <Field label="Structure d’affectation *" full>
          <select required value={form.structure_id} onChange={set('structure_id')}>
            <option value="">—</option>
            {mine.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.sigle || s.code})</option>)}
          </select>
        </Field>
        <Field label="Fonction"><input value={form.fonction} onChange={set('fonction')} /></Field>
        <Field label="Corps"><select value={form.corps_id} onChange={set('corps_id')}><option value="">—</option>{corps?.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.hierarchie})</option>)}</select></Field>
        <Field label="Hiérarchie"><select value={form.hierarchie} onChange={set('hierarchie')}><option value="">—</option>{['A', 'B', 'C', 'D'].map((h) => <option key={h}>{h}</option>)}</select></Field>
        <Field label="Grade"><input value={form.grade} onChange={set('grade')} /></Field>
        <Field label="Échelon"><input type="number" min="1" max="20" value={form.echelon} onChange={set('echelon')} /></Field>
        <Field label="Statut"><select value={form.statut_emploi} onChange={set('statut_emploi')}>{Object.entries(STATUT_EMPLOI).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Position statutaire"><select value={form.position_statutaire} onChange={set('position_statutaire')}>{Object.entries(POSITIONS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Entrée dans la fonction publique"><input type="date" value={form.date_entree_fp} onChange={set('date_entree_fp')} /></Field>
        <Field label="Prise de service (affectation)"><input type="date" value={form.date_prise_service} onChange={set('date_prise_service')} /></Field>
        <Field label="Matricule de solde"><input value={form.matricule_solde} onChange={set('matricule_solde')} /></Field>
        <Field label="Salaire de base (référence Solde)"><input type="number" min="0" step="1000" value={form.salary} onChange={set('salary')} /></Field>
        {editing && <p className="field-full muted small">Les changements de carrière (mutation, avancement, position) doivent de préférence passer par un acte
          soumis au circuit de validation. Toute correction directe est enregistrée champ par champ dans l’historique.</p>}
      </form>
    </Modal>
  );
}
