import { Check, Download, Upload, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { Badge, Empty, Loader, Modal, PageHeader } from '../components/ui';
import { useToast } from '../context/ToastContext';
import api, { download } from '../services/api';
import { dateTime, readFile } from '../utils/format';
import useFetch from '../utils/useFetch';

const STATUS = { draft: ['À valider', 'warning'], applied: ['Intégré', 'success'], rejected: ['Rejeté', 'danger'] };

function BatchDetail({ id, onClose, onDecided }) {
  const toast = useToast();
  const { data } = useFetch(`/imports/${id}`);
  const decide = async (decision) => {
    if (!window.confirm(decision === 'apply' ? 'Intégrer les lignes valides au référentiel national ?' : 'Rejeter ce lot ?')) return;
    try { const r = await api.post(`/imports/${id}/decision`, { decision }); toast.success(`${r.applied} agent(s) intégré(s)`); onDecided(); } catch (err) { toast.error(err); }
  };
  return (
    <Modal wide title={`Lot n° ${id}`} onClose={onClose}
      footer={data?.status === 'draft' && <><button type="button" className="btn btn-danger-outline" onClick={() => decide('reject')}><X size={16} /> Rejeter</button>
        <button type="button" className="btn btn-success" onClick={() => decide('apply')}><Check size={16} /> Valider et intégrer {data.stats.valides} agent(s)</button></>}>
      {!data ? <Loader /> : (
        <div className="table-wrap scroll-y">
          <table className="table"><thead><tr><th>Ligne</th><th>Agent</th><th>Structure</th><th>Contrôle</th></tr></thead>
            <tbody>{data.rows.map((r) => (
              <tr key={r.id}><td className="num">{r.row_number}</td><td><b>{r.data.first_name} {r.data.last_name}</b><small className="block muted">{r.data.email} · NIN {r.data.nin || '—'}</small></td>
                <td className="mono small">{r.data.structure_code}</td>
                <td>{r.errors.length ? <span className="text-danger small">{r.errors.join(' ; ')}</span>
                  : r.duplicate_reason ? <span className="badge badge-warning">Doublon : {r.duplicate_reason}{r.duplicate_sigrh_id && ` (${r.duplicate_sigrh_id})`}</span>
                    : r.applied_employee_id ? <span className="badge badge-success">Intégré</span> : <span className="badge badge-info">Valide</span>}</td></tr>))}</tbody></table>
        </div>
      )}
    </Modal>
  );
}

export default function Reprise() {
  const toast = useToast();
  const ref = useRef(null);
  const { data, reload } = useFetch('/imports');
  const [open, setOpen] = useState(null);
  const upload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try { const r = await api.post('/imports', { filename: file.name, content: await readFile(file) }); toast.success('Fichier analysé'); reload(); setOpen(r.id); } catch (err) { toast.error(err); }
  };
  return (
    <>
      <PageHeader title="Reprise des données existantes" subtitle="Import des fichiers Excel/CSV du ministère : contrôle, dédoublonnage, validation formelle par la DRH">
        <button type="button" className="btn" onClick={() => download('/imports/template')}><Download size={16} /> Modèle CSV</button>
        <button type="button" className="btn btn-primary" onClick={() => ref.current?.click()}><Upload size={16} /> Analyser un fichier</button>
        <input ref={ref} type="file" hidden accept=".csv,text/csv" onChange={upload} />
      </PageHeader>
      <div className="alert alert-info small">Aucune donnée n’est intégrée au référentiel tant que la DRH n’a pas validé le lot. Les doublons sont détectés par NIN,
        matricule de solde, email, ou nom et date de naissance, dans le fichier et dans tout le référentiel national.</div>
      {!data ? <Loader /> : !data.length ? <Empty>Aucun lot importé</Empty> : (
        <div className="card table-wrap"><table className="table clickable-rows">
          <thead><tr><th>Date</th><th>Fichier</th><th className="num">Lignes</th><th className="num">Valides</th><th className="num">Erreurs</th><th className="num">Doublons</th><th>Statut</th></tr></thead>
          <tbody>{data.map((b) => <tr key={b.id} onClick={() => setOpen(b.id)}><td className="small">{dateTime(b.created_at)}</td><td>{b.filename}<small className="block muted">{b.created_by_name}</small></td>
            <td className="num">{b.stats.total}</td><td className="num">{b.stats.valides}</td><td className="num text-danger">{b.stats.erreurs}</td><td className="num">{b.stats.doublons}</td>
            <td><Badge map={STATUS} value={b.status} />{b.stats.integres !== undefined && <small className="block muted">{b.stats.integres} intégré(s)</small>}</td></tr>)}</tbody></table></div>
      )}
      {open && <BatchDetail id={open} onClose={() => setOpen(null)} onDecided={() => { setOpen(null); reload(); }} />}
    </>
  );
}
