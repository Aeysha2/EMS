import { Building2, Pencil, Plus, Trash2, UserRound, Users } from 'lucide-react';
import { useState } from 'react';
import { Empty, ErrorBox, Field, Loader, Modal, PageHeader } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../services/api';
import { money } from '../utils/format';
import useFetch from '../utils/useFetch';

function DepartmentForm({ dept, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: dept?.name || '', code: dept?.code || '', description: dept?.description || '',
    budget: dept?.budget ?? 0, manager_id: dept?.manager_id || '',
  });
  const { data: members } = useFetch('/employees?limit=100&sort=name');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    try {
      if (dept?.id) await api.put(`/departments/${dept.id}`, form);
      else await api.post('/departments', form);
      toast.success('Département enregistré');
      onSaved();
    } catch (err) { toast.error(err); }
  };

  return (
    <Modal title={dept?.id ? 'Modifier le département' : 'Nouveau département'} onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>Annuler</button>
        <button type="submit" form="dept-form" className="btn btn-primary">Enregistrer</button></>}>
      <form id="dept-form" className="form-grid" onSubmit={submit}>
        <Field label="Nom *" full><input required value={form.name} onChange={set('name')} /></Field>
        <Field label="Code / sigle"><input value={form.code} onChange={set('code')} /></Field>
        <Field label="Budget annuel"><input type="number" min="0" value={form.budget} onChange={set('budget')} /></Field>
        <Field label="Responsable (chef de service)" full>
          <select value={form.manager_id} onChange={set('manager_id')}>
            <option value="">— Aucun —</option>
            {members?.data.map((m) => <option key={m.id} value={m.id}>{m.full_name} ({m.employee_code})</option>)}
          </select>
        </Field>
        <Field label="Description" full><textarea rows={3} value={form.description} onChange={set('description')} /></Field>
      </form>
    </Modal>
  );
}

export default function Departments() {
  const { isHR, isAdmin } = useAuth();
  const toast = useToast();
  const { data, loading, error, reload } = useFetch('/departments');
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(null);
  const { data: detail } = useFetch(open ? `/departments/${open}` : null);

  const remove = async (d) => {
    if (!window.confirm(`Supprimer « ${d.name} » ? Ses ${d.employee_count} employé(s) seront sans département.`)) return;
    try { await api.del(`/departments/${d.id}`); toast.success('Département supprimé'); reload(); } catch (err) { toast.error(err); }
  };

  return (
    <>
      <PageHeader title="Départements" subtitle="Directions et services du ministère">
        {isHR && <button type="button" className="btn btn-primary" onClick={() => setEditing({})}><Plus size={16} /> Nouveau département</button>}
      </PageHeader>
      {error && <ErrorBox error={error} onRetry={reload} />}
      {loading && !data && <Loader />}
      {data?.length === 0 && <Empty icon={Building2}>Aucun département</Empty>}
      <div className="card-grid wide">
        {data?.map((d) => {
          const usage = d.budget > 0 ? Math.min(100, Math.round(((d.monthly_salary_cost * 12) / d.budget) * 100)) : 0;
          return (
            <div key={d.id} className="card dept-card">
              <div className="card-head">
                <h3>{d.name} {d.code && <span className="badge badge-muted">{d.code}</span>}</h3>
                {isHR && (
                  <div className="row">
                    <button type="button" className="icon-btn" onClick={() => setEditing(d)} aria-label="Modifier"><Pencil size={16} /></button>
                    {isAdmin && <button type="button" className="icon-btn danger" onClick={() => remove(d)} aria-label="Supprimer"><Trash2 size={16} /></button>}
                  </div>
                )}
              </div>
              {d.description && <p className="muted small">{d.description}</p>}
              <div className="dept-meta">
                <span><UserRound size={14} /> {d.manager_name || 'Pas de responsable'}</span>
                <span><Users size={14} /> {d.employee_count} employé(s)</span>
              </div>
              {isHR && (
                <>
                  <div className="row between small"><span>Budget : <b>{money(d.budget)}</b></span><span>{usage} % consommé (salaires)</span></div>
                  <div className="progress"><div className={`progress-fill ${usage > 90 ? 'tone-danger' : usage > 70 ? 'tone-warning' : 'tone-success'}`} style={{ width: `${usage}%` }} /></div>
                </>
              )}
              <button type="button" className="link" onClick={() => setOpen(open === d.id ? null : d.id)}>
                {open === d.id ? 'Masquer les membres' : 'Voir les membres'}
              </button>
              {open === d.id && detail?.id === d.id && (
                <ul className="member-list">
                  {detail.members.map((m) => <li key={m.id}><b>{m.full_name}</b> <span className="muted">– {m.designation || '—'}</span></li>)}
                  {detail.members.length === 0 && <li className="muted">Aucun membre</li>}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      {editing && <DepartmentForm dept={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </>
  );
}
