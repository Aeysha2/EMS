import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Field, Loader, Modal, PageHeader, Tabs } from '../components/ui';
import { useToast } from '../context/ToastContext';
import api from '../services/api';
import { ASSIGNEE, CATEGORY } from '../utils/format';
import useFetch from '../utils/useFetch';

function CircuitEditor({ type, structures, onSaved }) {
  const toast = useToast();
  const [meta, setMeta] = useState({});
  const [steps, setSteps] = useState([]);
  useEffect(() => {
    setMeta({ name: type.name, sla_days: type.sla_days, required_documents: type.required_documents || '', is_active: type.is_active, agent_can_submit: type.agent_can_submit });
    setSteps(type.steps.map((s) => ({ name: s.name, assignee_kind: s.assignee_kind, structure_id: s.structure_id || '', expected_days: s.expected_days })));
  }, [type]);
  const setStep = (i, k, v) => setSteps(steps.map((s, j) => (j === i ? { ...s, [k]: v } : s)));
  const move = (i, d) => { const n = [...steps]; [n[i], n[i + d]] = [n[i + d], n[i]]; setSteps(n); };
  const save = async () => {
    try { await api.put(`/workflows/types/${type.id}`, { ...meta, steps }); toast.success('Circuit enregistré'); onSaved(); } catch (err) { toast.error(err); }
  };
  const total = steps.reduce((t, s) => t + Number(s.expected_days || 0), 0);
  return (
    <div className="card">
      <div className="form-grid">
        <Field label="Libellé"><input value={meta.name || ''} onChange={(e) => setMeta({ ...meta, name: e.target.value })} /></Field>
        <Field label="Délai réglementaire (jours)"><input type="number" min="1" value={meta.sla_days || ''} onChange={(e) => setMeta({ ...meta, sla_days: e.target.value })} /></Field>
        <Field label="Pièces requises" full><input value={meta.required_documents || ''} onChange={(e) => setMeta({ ...meta, required_documents: e.target.value })} /></Field>
        <label className="check"><input type="checkbox" checked={!!meta.agent_can_submit} onChange={(e) => setMeta({ ...meta, agent_can_submit: e.target.checked })} /> L’agent peut déposer lui-même</label>
        <label className="check"><input type="checkbox" checked={!!meta.is_active} onChange={(e) => setMeta({ ...meta, is_active: e.target.checked })} /> Actif</label>
      </div>
      <h4>Étapes du circuit <small className="muted">(somme des délais d’étape : {total} j{total > meta.sla_days ? ' — supérieure au délai réglementaire' : ''})</small></h4>
      <ol className="circuit-edit">
        {steps.map((s, i) => (
          <li key={i}>
            <span className="step-dot">{i + 1}</span>
            <input placeholder="Nom de l’étape" value={s.name} onChange={(e) => setStep(i, 'name', e.target.value)} />
            <select value={s.assignee_kind} onChange={(e) => setStep(i, 'assignee_kind', e.target.value)} aria-label="Valideur">
              {Object.entries(ASSIGNEE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            {['structure', 'pilotage'].includes(s.assignee_kind) && (
              <select value={s.structure_id} onChange={(e) => setStep(i, 'structure_id', e.target.value)} aria-label="Structure">
                <option value="">{s.assignee_kind === 'pilotage' ? 'Tout le pilotage' : 'Structure…'}</option>
                {structures.map((st) => <option key={st.id} value={st.id}>{st.institution_sigle} — {st.sigle || st.name}</option>)}
              </select>
            )}
            <input type="number" min="1" className="input-sm" value={s.expected_days} onChange={(e) => setStep(i, 'expected_days', e.target.value)} title="Délai de l’étape (jours)" aria-label="Délai" />
            <button type="button" className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Monter"><ArrowUp size={15} /></button>
            <button type="button" className="icon-btn" disabled={i === steps.length - 1} onClick={() => move(i, 1)} aria-label="Descendre"><ArrowDown size={15} /></button>
            <button type="button" className="icon-btn danger" onClick={() => setSteps(steps.filter((_, j) => j !== i))} aria-label="Supprimer"><Trash2 size={15} /></button>
          </li>
        ))}
      </ol>
      <div className="row gap">
        <button type="button" className="btn" onClick={() => setSteps([...steps, { name: '', assignee_kind: 'drh_institution', structure_id: '', expected_days: 5 }])}><Plus size={16} /> Ajouter une étape</button>
        <button type="button" className="btn btn-primary" onClick={save}><Save size={16} /> Enregistrer</button>
      </div>
    </div>
  );
}

export default function Parametrage() {
  const toast = useToast();
  const [tab, setTab] = useState('circuits');
  const { data, reload } = useFetch('/workflows/types');
  const { data: structures } = useFetch('/structures?flat=1');
  const { data: corps, reload: reloadCorps } = useFetch('/corps');
  const [selected, setSelected] = useState(null);
  const [newCorps, setNewCorps] = useState(null);
  if (!data || !structures) return <Loader />;
  const type = data.types.find((t) => t.id === selected) || data.types[0];
  return (
    <>
      <PageHeader title="Circuits et référentiels" subtitle="Paramétrage central (SGG / DSI) des processus RH transverses" />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'circuits', label: 'Circuits de validation' }, { value: 'corps', label: 'Corps de la fonction publique' }]} />
      {tab === 'circuits' && (
        <div className="split">
          <div className="card">
            {Object.entries(CATEGORY).map(([cat, label]) => (
              <div key={cat}><div className="nav-section dark">{label}</div>
                {data.types.filter((t) => t.category === cat).map((t) => (
                  <button type="button" key={t.id} className={`list-item ${type.id === t.id ? 'active' : ''}`} onClick={() => setSelected(t.id)}>
                    {t.name}<small className="muted"> · {t.steps.length} étape(s) · {t.sla_days} j{!t.is_active && ' · inactif'}</small>
                  </button>))}
              </div>))}
          </div>
          <CircuitEditor type={type} structures={structures} onSaved={reload} />
        </div>
      )}
      {tab === 'corps' && (
        <div className="card table-wrap">
          <div className="card-head"><span /><button type="button" className="btn btn-primary" onClick={() => setNewCorps({ code: '', name: '', hierarchie: 'A' })}><Plus size={16} /> Nouveau corps</button></div>
          <table className="table"><thead><tr><th>Code</th><th>Corps</th><th>Hiérarchie</th><th className="num">Effectif</th></tr></thead>
            <tbody>{corps?.map((c) => <tr key={c.id}><td className="mono">{c.code}</td><td>{c.name}</td><td>{c.hierarchie}</td><td className="num">{c.effectif}</td></tr>)}</tbody></table>
        </div>
      )}
      {newCorps && (
        <Modal title="Nouveau corps" onClose={() => setNewCorps(null)}
          footer={<><button type="button" className="btn" onClick={() => setNewCorps(null)}>Annuler</button>
            <button type="button" className="btn btn-primary" onClick={async () => { try { await api.post('/corps', newCorps); toast.success('Corps créé'); setNewCorps(null); reloadCorps(); } catch (err) { toast.error(err); } }}>Créer</button></>}>
          <div className="form-grid">
            <Field label="Code"><input value={newCorps.code} onChange={(e) => setNewCorps({ ...newCorps, code: e.target.value })} /></Field>
            <Field label="Hiérarchie"><select value={newCorps.hierarchie} onChange={(e) => setNewCorps({ ...newCorps, hierarchie: e.target.value })}>{['A', 'B', 'C', 'D'].map((h) => <option key={h}>{h}</option>)}</select></Field>
            <Field label="Intitulé" full><input value={newCorps.name} onChange={(e) => setNewCorps({ ...newCorps, name: e.target.value })} /></Field>
          </div>
        </Modal>
      )}
    </>
  );
}
