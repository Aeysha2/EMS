import { Building2, Check, ChevronDown, ChevronRight, Plus, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Badge, Empty, Field, Loader, Modal, PageHeader, Tabs } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../services/api';
import { dateTime, STRUCTURE_TYPES } from '../utils/format';
import useFetch from '../utils/useFetch';

function Node({ node, depth, selected, onSelect, open, toggle, filter }) {
  const isOpen = open.has(node.id) || !!filter;
  const visible = (n) => !filter || n.name.toLowerCase().includes(filter) || (n.sigle || '').toLowerCase().includes(filter) || n.children.some(visible);
  if (!visible(node)) return null;
  return (
    <li>
      <div className={`tree-row ${selected === node.id ? 'active' : ''}`} style={{ paddingLeft: depth * 16 + 6 }}>
        {node.children.length > 0
          ? <button type="button" className="icon-btn tiny" onClick={() => toggle(node.id)} aria-label={isOpen ? 'Replier' : 'Déplier'}>{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
          : <span className="tree-spacer" />}
        <button type="button" className="tree-label" onClick={() => onSelect(node.id)}>
          <span className={`type-dot t-${node.type}`} /> {node.sigle || node.name}
          <small className="muted"> {node.name !== node.sigle && node.sigle ? node.name : ''}</small>
        </button>
        <span className="tree-count" title="Effectif total">{node.total_agents}</span>
      </div>
      {isOpen && node.children.length > 0 && (
        <ul>{node.children.map((c) => <Node key={c.id} node={c} depth={depth + 1} selected={selected} onSelect={onSelect} open={open} toggle={toggle} filter={filter} />)}</ul>
      )}
    </li>
  );
}

function StructureForm({ parents, mode, structure, onClose, onSaved }) {
  const toast = useToast();
  const { isCentral } = useAuth();
  const [form, setForm] = useState({ code: '', name: '', sigle: '', type: 'service', parent_id: structure?.id || '', region: '' });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    try {
      if (isCentral && mode === 'create') await api.post('/structures', form);
      else await api.post('/structures/requests', { action: 'create', payload: form });
      toast.success(isCentral ? 'Structure créée' : 'Proposition envoyée pour validation centrale (SGG / DSI)');
      onSaved();
    } catch (err) { toast.error(err); }
  };
  return (
    <Modal title={isCentral ? 'Créer une structure' : 'Proposer une nouvelle structure'} onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>Annuler</button><button form="st-form" className="btn btn-primary">{isCentral ? 'Créer' : 'Proposer'}</button></>}>
      <form id="st-form" className="form-grid" onSubmit={submit}>
        <Field label="Code *"><input required value={form.code} onChange={set('code')} placeholder="MEN-IA-STL" /></Field>
        <Field label="Sigle"><input value={form.sigle} onChange={set('sigle')} /></Field>
        <Field label="Nom *" full><input required value={form.name} onChange={set('name')} /></Field>
        <Field label="Type"><select value={form.type} onChange={set('type')}>
          {Object.entries(STRUCTURE_TYPES).filter(([k]) => isCentral || !['presidence', 'sgg', 'ministere'].includes(k)).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select></Field>
        <Field label="Région"><input value={form.region} onChange={set('region')} /></Field>
        {!['presidence', 'sgg', 'ministere'].includes(form.type) && (
          <Field label="Structure parente *" full><select required value={form.parent_id} onChange={set('parent_id')}>
            <option value="">—</option>{parents.map((p) => <option key={p.id} value={p.id}>{p.institution_sigle} — {p.name}</option>)}
          </select></Field>
        )}
      </form>
    </Modal>
  );
}

function Detail({ id, onChanged }) {
  const { user, isDRH } = useAuth();
  const toast = useToast();
  const { data, loading, reload } = useFetch(`/structures/${id}`);
  const [head, setHead] = useState('');
  if (loading || !data) return <Loader />;
  const mine = isDRH && data.institution_id === user.institution_id;
  const setHeadAgent = async () => {
    try { await api.put(`/structures/${id}`, { head_agent_id: head || null }); toast.success('Responsable désigné'); reload(); onChanged(); } catch (err) { toast.error(err); }
  };
  return (
    <div className="card">
      <div className="card-head">
        <div><h2>{data.name}</h2><p className="muted">{STRUCTURE_TYPES[data.type]} · {data.code}{data.region && ` · ${data.region}`}</p></div>
        <span className="badge badge-muted">{data.institution_sigle}</span>
      </div>
      <dl className="info-grid">
        <div><dt>Rattachement</dt><dd>{data.parent_name || '—'}</dd></div>
        <div><dt>Responsable</dt><dd>{data.head_name ? `${data.head_name}` : <span className="badge badge-warning">Poste vacant</span>}<small className="block muted">{data.head_fonction}</small></dd></div>
        <div><dt>Effectif (sous-structures incluses)</dt><dd>{data.stats.effectif}</dd></div>
        <div><dt>Taux de féminisation</dt><dd>{data.stats.effectif ? Math.round((data.stats.femmes / data.stats.effectif) * 100) : 0} %</dd></div>
      </dl>
      {mine && (
        <div className="row gap wrap">
          <select value={head} onChange={(e) => setHead(e.target.value)} aria-label="Nouveau responsable">
            <option value="">Désigner un responsable…</option>{data.agents.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
          </select>
          <button type="button" className="btn btn-sm" disabled={!head} onClick={setHeadAgent}>Enregistrer</button>
        </div>
      )}
      {data.children.length > 0 && (<><h4>Sous-structures</h4><div className="chips">{data.children.map((c) => <span key={c.id} className="badge badge-muted">{c.sigle || c.name}</span>)}</div></>)}
      {data.positions.length > 0 && (
        <>
          <h4>Postes ({data.positions.filter((p) => !p.employee_id).length} vacant(s))</h4>
          <table className="table"><thead><tr><th>Code</th><th>Intitulé</th><th>Hiér.</th><th>Occupant</th></tr></thead>
            <tbody>{data.positions.map((p) => <tr key={p.id}><td className="mono small">{p.code}</td><td>{p.title}</td><td>{p.hierarchie}</td>
              <td>{p.occupant_name || <span className="badge badge-warning">Vacant</span>}</td></tr>)}</tbody></table>
        </>
      )}
      <h4>Agents ({data.agents.length})</h4>
      {data.agents.length === 0 ? <p className="muted small">Aucun agent affecté directement</p> : (
        <ul className="member-list">{data.agents.map((a) => <li key={a.id}><b>{a.full_name}</b> <span className="muted">— {a.fonction || '—'}</span></li>)}</ul>
      )}
    </div>
  );
}

function RequestsTab() {
  const { isCentral } = useAuth();
  const toast = useToast();
  const { data, reload } = useFetch('/structures/requests');
  const decide = async (r, decision) => {
    const comment = decision === 'reject' ? window.prompt('Motif du rejet :') : '';
    if (decision === 'reject' && !comment) return;
    try { await api.patch(`/structures/requests/${r.id}`, { decision, comment }); toast.success('Décision enregistrée'); reload(); } catch (err) { toast.error(err); }
  };
  if (!data) return <Loader />;
  if (!data.length) return <Empty>Aucune proposition</Empty>;
  return (
    <div className="card table-wrap">
      <table className="table">
        <thead><tr><th>Date</th><th>Institution</th><th>Proposition</th><th>Par</th><th>Statut</th>{isCentral && <th />}</tr></thead>
        <tbody>{data.map((r) => (
          <tr key={r.id}>
            <td className="small">{dateTime(r.created_at)}</td><td>{r.institution_name}</td>
            <td><b>{{ create: 'Création', update: 'Modification', deactivate: 'Désactivation' }[r.action]}</b> — {r.payload.name || r.structure_name}
              <small className="block muted">{r.payload.code} {r.payload.type && `· ${STRUCTURE_TYPES[r.payload.type]}`}</small>
              {r.review_comment && <small className="block">↳ {r.reviewed_by_name} : {r.review_comment}</small>}</td>
            <td>{r.requested_by_name}</td>
            <td><Badge map={{ pending: ['En attente', 'warning'], approved: ['Validée', 'success'], rejected: ['Rejetée', 'danger'] }} value={r.status} /></td>
            {isCentral && <td className="actions">{r.status === 'pending' && (<>
              <button type="button" className="btn btn-sm btn-success" onClick={() => decide(r, 'approve')}><Check size={14} /> Valider</button>
              <button type="button" className="btn btn-sm btn-danger-outline" onClick={() => decide(r, 'reject')}><X size={14} /> Rejeter</button></>)}</td>}
          </tr>))}</tbody>
      </table>
    </div>
  );
}

export default function Structures() {
  const { isDRH, isCentral } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'tree';
  const { data: tree, reload } = useFetch('/structures');
  const { data: flat } = useFetch('/structures?flat=1');
  const [selected, setSelected] = useState(null);
  const [open, setOpen] = useState(new Set());
  const [filter, setFilter] = useState('');
  const [creating, setCreating] = useState(false);
  const toggle = (id) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const total = useMemo(() => (tree || []).reduce((t, n) => t + n.total_agents, 0), [tree]);

  return (
    <>
      <PageHeader title="Organigramme de l’État" subtitle={`Référentiel national des structures — ${flat?.length ?? '…'} structures, ${total} agents en fonction`}>
        {(isDRH || isCentral) && <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> {isCentral ? 'Créer une structure' : 'Proposer une structure'}</button>}
      </PageHeader>
      <Tabs value={tab} onChange={(v) => setParams({ tab: v })} tabs={[
        { value: 'tree', label: 'Organigramme' },
        (isDRH || isCentral) && { value: 'requests', label: 'Propositions de modification' },
      ]} />
      {tab === 'tree' && (
        <div className="split">
          <div className="card tree-card">
            <div className="search"><Search size={16} /><input placeholder="Filtrer…" value={filter} onChange={(e) => setFilter(e.target.value.toLowerCase())} /></div>
            {!tree ? <Loader /> : (
              <ul className="tree">{tree.map((n) => <Node key={n.id} node={n} depth={0} selected={selected} onSelect={setSelected} open={open} toggle={toggle} filter={filter} />)}</ul>
            )}
            <div className="legend">{Object.entries(STRUCTURE_TYPES).map(([k, l]) => <span key={k}><i className={`type-dot t-${k}`} /> {l}</span>)}</div>
          </div>
          <div>{selected ? <Detail key={selected} id={selected} onChanged={reload} /> : <Empty icon={Building2}>Sélectionnez une structure dans l’organigramme</Empty>}</div>
        </div>
      )}
      {tab === 'requests' && <RequestsTab />}
      {creating && flat && <StructureForm parents={flat.filter((s) => s.is_active)} mode="create" onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); }} />}
    </>
  );
}
