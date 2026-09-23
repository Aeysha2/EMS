import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Field, Loader, Modal, PageHeader, Tabs } from '../components/ui';
import { useToast } from '../context/ToastContext';
import api from '../services/api';
import useFetch from '../utils/useFetch';

function CircuitEditor({ config, departments, onSaved }) {
  const toast = useToast();
  const [typeId, setTypeId] = useState('');
  const [steps, setSteps] = useState([]);

  useEffect(() => {
    const own = typeId ? config.circuits[typeId] : null;
    setSteps((own || (typeId ? [] : config.circuits.default)).map((s) => ({
      name: s.name, department_id: s.department_id || '', expected_days: s.expected_days,
    })));
  }, [typeId, config]);

  const move = (i, d) => {
    const next = [...steps];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setSteps(next);
  };
  const setStep = (i, k, v) => setSteps(steps.map((s, j) => (j === i ? { ...s, [k]: v } : s)));

  const save = async () => {
    try {
      await api.put('/projects/circuit', { request_type_id: typeId || null, steps });
      toast.success('Circuit enregistré');
      onSaved();
    } catch (err) { toast.error(err); }
  };

  const usesDefault = typeId && !config.circuits[typeId];
  return (
    <div className="card">
      <div className="toolbar">
        <label className="inline">Circuit pour :
          <select value={typeId} onChange={(e) => setTypeId(e.target.value)}>
            <option value="">Circuit par défaut (tous types)</option>
            {config.requestTypes.map((t) => <option key={t.id} value={t.id}>{t.name}{config.circuits[t.id] ? ' ✱' : ''}</option>)}
          </select>
        </label>
      </div>
      {usesDefault && steps.length === 0 && (
        <div className="alert alert-info">Ce type utilise le circuit par défaut. Ajoutez des étapes pour lui définir un circuit spécifique.
          <button type="button" className="btn btn-sm" onClick={() => setSteps(config.circuits.default.map((s) => ({ name: s.name, department_id: s.department_id || '', expected_days: s.expected_days })))}>Partir du circuit par défaut</button>
        </div>
      )}
      <ol className="circuit-edit">
        {steps.map((s, i) => (
          <li key={i}>
            <span className="step-dot">{i + 1}</span>
            <input placeholder="Nom de l’étape" value={s.name} onChange={(e) => setStep(i, 'name', e.target.value)} />
            <select value={s.department_id} onChange={(e) => setStep(i, 'department_id', e.target.value)}>
              <option value="">Service —</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <input type="number" min="1" className="input-sm" value={s.expected_days} onChange={(e) => setStep(i, 'expected_days', e.target.value)} title="Délai (jours)" />
            <button type="button" className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={15} /></button>
            <button type="button" className="icon-btn" disabled={i === steps.length - 1} onClick={() => move(i, 1)}><ArrowDown size={15} /></button>
            <button type="button" className="icon-btn danger" onClick={() => setSteps(steps.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
          </li>
        ))}
      </ol>
      <div className="row gap">
        <button type="button" className="btn" onClick={() => setSteps([...steps, { name: '', department_id: '', expected_days: 5 }])}><Plus size={16} /> Ajouter une étape</button>
        <button type="button" className="btn btn-primary" onClick={save}><Save size={16} /> Enregistrer le circuit</button>
      </div>
    </div>
  );
}

function TypeModal({ kind, item, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(item || (kind === 'request' ? { code: '', name: '', sla_days: 30, required_documents: '', description: '' } : { name: '', description: '' }));
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const path = kind === 'request' ? '/projects/request-types' : '/projects/deposit-types';
  const submit = async (e) => {
    e.preventDefault();
    try {
      if (item?.id) await api.put(`${path}/${item.id}`, form); else await api.post(path, form);
      toast.success('Enregistré');
      onSaved();
    } catch (err) { toast.error(err); }
  };
  return (
    <Modal title={kind === 'request' ? 'Type de demande' : 'Type de dépôt'} onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>Annuler</button><button form="type-form" className="btn btn-primary">Enregistrer</button></>}>
      <form id="type-form" className="form-grid" onSubmit={submit}>
        {kind === 'request' && <Field label="Code"><input required value={form.code} onChange={set('code')} /></Field>}
        <Field label="Libellé" full={kind !== 'request'}><input required value={form.name} onChange={set('name')} /></Field>
        {kind === 'request' && <Field label="Délai de traitement (jours)"><input type="number" min="1" value={form.sla_days} onChange={set('sla_days')} /></Field>}
        {kind === 'request' && <Field label="Pièces requises" full><textarea rows={2} value={form.required_documents || ''} onChange={set('required_documents')} /></Field>}
        <Field label="Description" full><textarea rows={2} value={form.description || ''} onChange={set('description')} /></Field>
      </form>
    </Modal>
  );
}

export default function ProjectSettings() {
  const toast = useToast();
  const [tab, setTab] = useState('circuit');
  const [modal, setModal] = useState(null);
  const { data: config, reload } = useFetch('/projects/config');
  const { data: departments } = useFetch('/departments');
  if (!config || !departments) return <Loader />;

  const toggle = async (kind, t) => {
    try {
      await api.put(`/projects/${kind === 'request' ? 'request-types' : 'deposit-types'}/${t.id}`, { is_active: !t.is_active });
      reload();
    } catch (err) { toast.error(err); }
  };

  return (
    <>
      <PageHeader title="Circuit & paramètres des dossiers" subtitle="Types de demande, types de dépôt et étapes de traitement" />
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'circuit', label: 'Circuit de traitement' },
        { value: 'request', label: 'Types de demande', count: config.requestTypes.length },
        { value: 'deposit', label: 'Types de dépôt', count: config.depositTypes.length },
      ]} />
      {tab === 'circuit' && <CircuitEditor config={config} departments={departments} onSaved={reload} />}
      {tab !== 'circuit' && (
        <div className="card table-wrap">
          <div className="card-head">
            <span />
            <button type="button" className="btn btn-primary" onClick={() => setModal({ kind: tab })}><Plus size={16} /> Ajouter</button>
          </div>
          <table className="table">
            <thead><tr>{tab === 'request' && <th>Code</th>}<th>Libellé</th>{tab === 'request' && <th className="num">Délai</th>}<th>Détails</th><th>Actif</th><th /></tr></thead>
            <tbody>
              {(tab === 'request' ? config.requestTypes : config.depositTypes).map((t) => (
                <tr key={t.id}>
                  {tab === 'request' && <td><b>{t.code}</b></td>}
                  <td>{t.name}</td>
                  {tab === 'request' && <td className="num">{t.sla_days} j</td>}
                  <td className="small muted">{t.required_documents || t.description || '—'}</td>
                  <td><input type="checkbox" checked={t.is_active} onChange={() => toggle(tab, t)} /></td>
                  <td><button type="button" className="btn btn-sm" onClick={() => setModal({ kind: tab, item: t })}>Modifier</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {modal && <TypeModal {...modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />}
    </>
  );
}
