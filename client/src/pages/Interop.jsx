import { Copy, KeyRound, Plus } from 'lucide-react';
import { useState } from 'react';
import { Field, Loader, Modal, PageHeader } from '../components/ui';
import { useToast } from '../context/ToastContext';
import api from '../services/api';
import { dateTime } from '../utils/format';
import useFetch from '../utils/useFetch';

export default function Interop() {
  const toast = useToast();
  const { data, reload } = useFetch('/interop/clients');
  const { data: structures } = useFetch('/structures?flat=1');
  const [form, setForm] = useState(null);
  const [created, setCreated] = useState(null);
  if (!data) return <Loader />;
  const create = async () => {
    try { const r = await api.post('/interop/clients', form); setForm(null); setCreated(r); reload(); } catch (err) { toast.error(err); }
  };
  const toggle = async (c) => { try { await api.patch(`/interop/clients/${c.id}`, { is_active: !c.is_active }); reload(); } catch (err) { toast.error(err); } };
  return (
    <>
      <PageHeader title="Interopérabilité" subtitle="Bus d’échange avec la Solde, les terminaux biométriques et les SI des ministères (API REST versionnée)">
        <a className="btn" href="/api/interop/v1/openapi.json" target="_blank" rel="noreferrer">Spécification OpenAPI</a>
        <button type="button" className="btn btn-primary" onClick={() => setForm({ name: '', structure_id: '', scopes: [] })}><Plus size={16} /> Nouveau système partenaire</button>
      </PageHeader>
      <div className="card table-wrap">
        <table className="table">
          <thead><tr><th>Système</th><th>Structure</th><th>Clé</th><th>Habilitations</th><th className="num">Appels (30 j)</th><th>Dernier appel</th><th>Actif</th></tr></thead>
          <tbody>{data.clients.map((c) => (
            <tr key={c.id}><td><b>{c.name}</b></td><td>{c.structure_name || '—'}</td><td className="mono small">{c.key_prefix}…</td>
              <td><div className="chips">{c.scopes.map((s) => <span key={s} className="badge badge-muted mono">{s}</span>)}</div></td>
              <td className="num">{c.appels_30j}</td><td className="small">{c.last_used_at ? dateTime(c.last_used_at) : 'Jamais'}</td>
              <td><input type="checkbox" checked={c.is_active} onChange={() => toggle(c)} aria-label="Actif" /></td></tr>))}</tbody>
        </table>
      </div>
      <div className="card">
        <h3>Points d’accès partenaires</h3>
        <table className="table"><tbody>
          {[['GET', '/api/interop/v1/agents/{identifiant}', 'agents:read'], ['GET', '/api/interop/v1/structures', 'structures:read'],
            ['GET', '/api/interop/v1/statistiques/effectifs', 'statistiques:read'], ['POST', '/api/interop/v1/biometrie/pointages', 'biometrie:write'],
            ['POST', '/api/interop/v1/solde/paiements', 'solde:write']].map(([m, p, s]) => (
            <tr key={p}><td><span className="badge badge-info">{m}</span></td><td className="mono small">{p}</td><td className="mono small">{s}</td><td className="small">{data.scopes[s]}</td></tr>))}
        </tbody></table>
        <p className="muted small">Authentification par l’en-tête <code>X-API-Key</code>. Chaque appel est journalisé.</p>
      </div>
      {form && (
        <Modal title="Nouveau système partenaire" onClose={() => setForm(null)}
          footer={<><button type="button" className="btn" onClick={() => setForm(null)}>Annuler</button><button type="button" className="btn btn-primary" disabled={!form.name || !form.scopes.length} onClick={create}>Générer la clé</button></>}>
          <div className="form-grid">
            <Field label="Nom du système" full><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Structure responsable" full><select value={form.structure_id} onChange={(e) => setForm({ ...form, structure_id: e.target.value })}>
              <option value="">—</option>{structures?.map((s) => <option key={s.id} value={s.id}>{s.institution_sigle} — {s.name}</option>)}</select></Field>
            <div className="field-full"><span className="label">Habilitations (moindre privilège)</span>
              {Object.entries(data.scopes).map(([k, l]) => (
                <label key={k} className="check block"><input type="checkbox" checked={form.scopes.includes(k)}
                  onChange={(e) => setForm({ ...form, scopes: e.target.checked ? [...form.scopes, k] : form.scopes.filter((x) => x !== k) })} /> <code>{k}</code> — {l}</label>))}
            </div>
          </div>
        </Modal>
      )}
      {created && (
        <Modal title="Clé d’API générée" onClose={() => setCreated(null)} footer={<button type="button" className="btn btn-primary" onClick={() => setCreated(null)}>J’ai enregistré la clé</button>}>
          <p className="alert alert-warning"><KeyRound size={16} /> Cette clé ne sera plus jamais affichée. Transmettez-la au système « {created.name} » par un canal sécurisé.</p>
          <div className="row gap"><code className="key-box">{created.api_key}</code>
            <button type="button" className="icon-btn" onClick={() => { navigator.clipboard?.writeText(created.api_key); toast.success('Copiée'); }} aria-label="Copier"><Copy size={16} /></button></div>
        </Modal>
      )}
    </>
  );
}
