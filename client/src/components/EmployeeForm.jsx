import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../services/api';
import { EMPLOYEE_STATUS } from '../utils/format';
import { Field, Modal } from './ui';

const EMPTY = {
  full_name: '', email: '', phone: '', matricule: '', department_id: '', designation: '', grade: '',
  date_of_joining: '', date_of_birth: '', address: '', salary: '', status: 'active',
};

export default function EmployeeForm({ employee, departments, onClose, onSaved }) {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const editing = !!employee;
  const [form, setForm] = useState(() => {
    const base = { ...EMPTY, ...(employee || {}) };
    return Object.fromEntries(Object.entries(base).map(([k, v]) => [k, v ?? '']));
  });
  const [account, setAccount] = useState({ createAccount: false, password: '', role: 'employee' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const keys = Object.keys(EMPTY).concat(editing ? ['casual_balance', 'sick_balance', 'paid_balance'] : []);
    const body = Object.fromEntries(keys.map((k) => [k, form[k]]));
    if (body.salary === '') body.salary = 0;
    try {
      const saved = editing
        ? await api.put(`/employees/${employee.id}`, body)
        : await api.post('/employees', { ...body, ...(account.createAccount ? account : {}) });
      toast.success(editing ? 'Employé mis à jour' : `Employé ${saved.employee_code} créé`);
      onSaved(saved);
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal wide title={editing ? `Modifier ${employee.full_name}` : 'Nouvel employé'} onClose={onClose}
      footer={<>
        <button type="button" className="btn" onClick={onClose}>Annuler</button>
        <button type="submit" form="emp-form" className="btn btn-primary" disabled={busy}>Enregistrer</button>
      </>}>
      <form id="emp-form" className="form-grid" onSubmit={submit}>
        <Field label="Nom complet *"><input required value={form.full_name} onChange={set('full_name')} /></Field>
        <Field label="Email *"><input type="email" required value={form.email} onChange={set('email')} /></Field>
        <Field label="Téléphone"><input value={form.phone} onChange={set('phone')} /></Field>
        <Field label="Matricule"><input value={form.matricule} onChange={set('matricule')} /></Field>
        <Field label="Département">
          <select value={form.department_id} onChange={set('department_id')}>
            <option value="">— Aucun —</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
        <Field label="Fonction / poste"><input value={form.designation} onChange={set('designation')} /></Field>
        <Field label="Grade / catégorie"><input value={form.grade} onChange={set('grade')} placeholder="A1, B2…" /></Field>
        <Field label="Salaire de base mensuel"><input type="number" min="0" step="1000" value={form.salary} onChange={set('salary')} /></Field>
        <Field label="Date d’entrée"><input type="date" value={form.date_of_joining} onChange={set('date_of_joining')} /></Field>
        <Field label="Date de naissance"><input type="date" value={form.date_of_birth} onChange={set('date_of_birth')} /></Field>
        <Field label="Statut">
          <select value={form.status} onChange={set('status')}>
            {Object.entries(EMPLOYEE_STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        <Field label="Adresse"><input value={form.address} onChange={set('address')} /></Field>
        {editing && (
          <>
            <Field label="Solde congés occasionnels"><input type="number" step="0.5" value={form.casual_balance} onChange={set('casual_balance')} /></Field>
            <Field label="Solde congés maladie"><input type="number" step="0.5" value={form.sick_balance} onChange={set('sick_balance')} /></Field>
            <Field label="Solde congés payés"><input type="number" step="0.5" value={form.paid_balance} onChange={set('paid_balance')} /></Field>
          </>
        )}
        {!editing && (
          <div className="field-full account-box">
            <label className="check">
              <input type="checkbox" checked={account.createAccount}
                onChange={(e) => setAccount({ ...account, createAccount: e.target.checked })} />
              Créer aussi un compte de connexion
            </label>
            {account.createAccount && (
              <div className="grid-2">
                <Field label="Mot de passe initial"><input type="text" minLength={8} required value={account.password}
                  onChange={(e) => setAccount({ ...account, password: e.target.value })} /></Field>
                <Field label="Rôle" hint={isAdmin ? '' : 'Seul un administrateur peut attribuer un rôle élevé'}>
                  <select value={account.role} disabled={!isAdmin} onChange={(e) => setAccount({ ...account, role: e.target.value })}>
                    <option value="employee">Agent</option>
                    <option value="hr">Ressources Humaines</option>
                    <option value="admin">Administrateur</option>
                  </select>
                </Field>
              </div>
            )}
          </div>
        )}
      </form>
    </Modal>
  );
}
