import {
  ArrowLeft, Award, BadgeCheck, ClipboardPlus, Eye, FilePlus2, FileText, Fingerprint, GraduationCap, Pencil, ShieldCheck,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import AgentForm from '../components/AgentForm';
import InsightsPanel from '../components/InsightsPanel';
import RequestForm from '../components/RequestForm';
import { Avatar, Badge, Empty, ErrorBox, Field, Loader, Modal, Tabs } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api, { download } from '../services/api';
import {
  age, CAREER_TYPES, date, dateTime, ENROLLMENT_STATUS, LEAVE_STATUS, MONTHS, money, POSITIONS, readFile, REQUEST_STATUS,
  STATUT_EMPLOI, todayISO,
} from '../utils/format';
import useFetch from '../utils/useFetch';

function SmallForm({ title, fields, onSubmit, onClose }) {
  const [form, setForm] = useState(Object.fromEntries(fields.map((f) => [f.key, f.default ?? ''])));
  return (
    <Modal title={title} onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>Annuler</button><button form="small-form" className="btn btn-primary">Enregistrer</button></>}>
      <form id="small-form" className="form-grid" onSubmit={(e) => { e.preventDefault(); onSubmit(form); }}>
        {fields.map((f) => (
          <Field key={f.key} label={f.label} full={f.full}>
            {f.options
              ? <select required={f.required} value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}>
                {f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              : <input type={f.type || 'text'} required={f.required} value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />}
          </Field>
        ))}
      </form>
    </Modal>
  );
}

export default function AgentDossier({ self = false }) {
  const params = useParams();
  const { user, isDRH } = useAuth();
  const toast = useToast();
  const id = self ? user.employee_id : params.id;
  const [tab, setTab] = useState('identite');
  const [modal, setModal] = useState(null);
  const [nin, setNin] = useState(null);
  const fileRef = useRef(null);
  const { data, loading, error, reload } = useFetch(id ? `/employees/${id}/dossier` : null);

  if (!id) return <Empty>Aucun dossier agent n’est rattaché à votre compte.</Empty>;
  if (loading && !data) return <Loader />;
  if (error) return <ErrorBox error={error} />;
  const a = data.agent;
  const full = a.access_level === 'full';
  const canManage = isDRH && full && a.id !== user.employee_id;

  const run = async (fn, msg) => {
    try { await fn(); if (msg) toast.success(msg); reload(); return true; } catch (err) { toast.error(err); return false; }
  };
  const upload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { toast.error('Fichier trop volumineux (3 Mo max)'); return; }
    run(async () => api.post(`/employees/${a.id}/documents`, { name: file.name, mime_type: file.type, content: await readFile(file),
      category: 'dossier' }), 'Pièce archivée dans le dossier');
  };

  const info = [
    ['Identifiant SIGRH', a.sigrh_id], ['Matricule de solde', a.matricule_solde], ['NIN', nin || a.nin_masked],
    ['Sexe', a.sexe === 'F' ? 'Féminin' : a.sexe === 'M' ? 'Masculin' : null],
    ['Date de naissance', a.date_of_birth && `${date(a.date_of_birth)} (${age(a.date_of_birth)} ans)`], ['Lieu de naissance', a.place_of_birth],
    ['Nationalité', a.nationality], ['Situation matrimoniale', a.marital_status], ['Enfants', a.children_count],
    ['Téléphone', a.phone], ['Adresse', a.address],
    ['Identité vérifiée (état civil)', a.identity_verified_at !== undefined ? (a.identity_verified_at ? `Oui, le ${date(a.identity_verified_at)}` : 'Non') : undefined],
    ['Biométrie', a.biometric_enrolled_at !== undefined ? (a.biometric_enrolled_at ? `Enrôlé (${a.biometric_id || '—'})` : 'Non enrôlé') : undefined],
  ].filter(([, v]) => v !== undefined);
  const admin = [
    ['Institution', a.institution_name], ['Structure', a.structure_name], ['Fonction', a.fonction], ['Corps', a.corps_name],
    ['Hiérarchie', a.hierarchie], ['Grade', a.grade], ['Échelon', a.echelon], ['Statut', STATUT_EMPLOI[a.statut_emploi]],
    ['Entrée dans la fonction publique', a.date_entree_fp && date(a.date_entree_fp)], ['Prise de service', a.date_prise_service && date(a.date_prise_service)],
    ['Salaire de base', a.salary !== undefined ? money(a.salary) : undefined],
  ].filter(([, v]) => v !== undefined);

  return (
    <>
      {!self && <Link to="/agents" className="link back"><ArrowLeft size={16} /> Retour aux agents</Link>}
      <div className="card profile-head">
        <Avatar name={a.full_name} size={72} />
        <div className="grow">
          <h2>{a.full_name}</h2>
          <p className="muted">{a.fonction || '—'} · {a.structure_name} · {a.institution_sigle}</p>
          <div className="row gap wrap">
            <span className="badge badge-muted mono">{a.sigrh_id}</span>
            <Badge map={POSITIONS} value={a.position_statutaire} />
            {a.statut_emploi && <span className="badge badge-info">{STATUT_EMPLOI[a.statut_emploi]}</span>}
            {a.identity_verified_at && <span className="badge badge-success"><BadgeCheck size={12} /> Identité vérifiée</span>}
            {a.biometric_enrolled_at && <span className="badge badge-purple"><Fingerprint size={12} /> Biométrie</span>}
            {!full && <span className="badge badge-warning">Vue responsable (données personnelles masquées)</span>}
          </div>
        </div>
        {canManage && (
          <div className="action-col">
            <button type="button" className="btn btn-primary" onClick={() => setModal('acte')}><ClipboardPlus size={16} /> Initier un acte</button>
            <button type="button" className="btn" onClick={() => setModal('edit')}><Pencil size={16} /> Corriger le dossier</button>
          </div>
        )}
      </div>

      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'identite', label: 'Identité et situation' },
        { value: 'carriere', label: 'Carrière', count: data.career.length },
        { value: 'diplomes', label: 'Diplômes', count: data.diplomas.length },
        { value: 'absences', label: 'Absences', count: data.leaves.length },
        { value: 'formation', label: 'Formation', count: data.trainings.length },
        { value: 'evaluation', label: 'Évaluation' },
        { value: 'demandes', label: 'Demandes', count: data.requests.length },
        full && { value: 'remuneration', label: 'Rémunération' },
        full && { value: 'documents', label: 'Documents', count: data.documents.length },
        full && { value: 'historique', label: 'Historique des modifications' },
      ]} />

      {tab === 'identite' && (
        <div className="grid-2">
          <div className="card">
            <div className="card-head"><h3>État civil et coordonnées</h3>
              {full && a.nin_masked && !nin && (
                <button type="button" className="btn btn-sm" onClick={async () => { try { setNin((await api.get(`/employees/${a.id}/nin`)).nin); } catch (err) { toast.error(err); } }}>
                  <Eye size={14} /> Afficher le NIN
                </button>)}
            </div>
            <dl className="info-grid">{info.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v ?? '—'}</dd></div>)}</dl>
            {nin && <p className="muted small">L’affichage du NIN a été enregistré dans le journal d’audit.</p>}
            {canManage && (
              <div className="row gap wrap">
                <button type="button" className="btn btn-sm" onClick={() => run(async () => {
                  const r = await api.post(`/employees/${a.id}/verify-identity`);
                  toast[r.match ? 'success' : 'error'](r.details);
                })}><ShieldCheck size={14} /> Vérifier auprès de l’état civil</button>
                <button type="button" className="btn btn-sm" onClick={() => setModal('bio')}><Fingerprint size={14} /> Enrôlement biométrique</button>
              </div>
            )}
          </div>
          <div className="card">
            <h3>Situation administrative</h3>
            <dl className="info-grid">{admin.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v ?? '—'}</dd></div>)}</dl>
          </div>
        </div>
      )}

      {tab === 'carriere' && (
        <div className="grid-2">
          <div className="card">
            <div className="card-head"><h3>Actes de carrière, sanctions et distinctions</h3>
              {canManage && <button type="button" className="btn btn-sm" onClick={() => setModal('event')}><Award size={14} /> Sanction / distinction</button>}
            </div>
            <ul className="timeline">
              {data.career.map((c) => (
                <li key={c.id} className={`tl-${c.type}`}>
                  <span className="tl-icon"><Award size={14} /></span>
                  <div>
                    <b>{CAREER_TYPES[c.type]}</b> — {c.description}
                    <small className="block muted">{date(c.effective_date)}{c.acte_reference && ` · ${c.acte_reference}`}</small>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="card table-wrap">
            <h3>Affectations successives</h3>
            <table className="table">
              <thead><tr><th>Structure</th><th>Fonction</th><th>Du</th><th>Au</th></tr></thead>
              <tbody>{data.affectations.map((f) => (
                <tr key={f.id}><td>{f.structure_name}</td><td>{f.fonction || '—'}</td><td>{date(f.start_date)}</td><td>{f.end_date ? date(f.end_date) : <span className="badge badge-success">En cours</span>}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'diplomes' && (
        <div className="card table-wrap">
          <div className="card-head"><h3>Diplômes et titres</h3>
            {canManage && <button type="button" className="btn btn-sm" onClick={() => setModal('diploma')}><GraduationCap size={14} /> Ajouter</button>}
          </div>
          {data.diplomas.length === 0 ? <Empty>Aucun diplôme enregistré</Empty> : (
            <table className="table">
              <thead><tr><th>Intitulé</th><th>Niveau</th><th>Établissement</th><th className="num">Année</th>{canManage && <th />}</tr></thead>
              <tbody>{data.diplomas.map((d) => (
                <tr key={d.id}><td>{d.title}</td><td>{d.level || '—'}</td><td>{d.school || '—'}</td><td className="num">{d.year || '—'}</td>
                  {canManage && <td><button type="button" className="link" onClick={() => run(() => api.del(`/employees/${a.id}/diplomas/${d.id}`), 'Diplôme retiré')}>Retirer</button></td>}</tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'absences' && (
        <div className="card table-wrap">
          {data.leaves.length === 0 ? <Empty>Aucune absence</Empty> : (
            <table className="table">
              <thead><tr><th>Type</th><th>Période</th><th className="num">Jours</th><th>Statut</th></tr></thead>
              <tbody>{data.leaves.map((l) => <tr key={l.id}><td>{l.label}{l.destination && <small className="block muted">{l.destination}</small>}</td>
                <td>{date(l.start_date)} → {date(l.end_date)}</td><td className="num">{l.days}</td><td><Badge map={LEAVE_STATUS} value={l.status} /></td></tr>)}</tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'formation' && (
        <div className="card table-wrap">
          {data.trainings.length === 0 ? <Empty>Aucune formation</Empty> : (
            <table className="table">
              <thead><tr><th>Formation</th><th>Organisme</th><th>Période</th><th>Statut</th></tr></thead>
              <tbody>{data.trainings.map((t) => <tr key={t.id}><td>{t.title}{t.is_certifying && <small className="block muted">Certifiante</small>}</td>
                <td>{t.provider}</td><td>{date(t.start_date)} → {date(t.end_date)}</td><td><Badge map={ENROLLMENT_STATUS} value={t.status} /></td></tr>)}</tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'evaluation' && (
        <>
          <InsightsPanel employeeId={a.id} />
          <div className="card table-wrap">
            <h3>Évaluations annuelles</h3>
            {data.reviews.length === 0 ? <Empty>Aucune évaluation</Empty> : (
              <table className="table"><thead><tr><th>Période</th><th>Date</th><th className="num">Note</th><th>Appréciation</th></tr></thead>
                <tbody>{data.reviews.map((r) => <tr key={r.id}><td>{r.period}</td><td>{date(r.review_date)}</td>
                  <td className="num">{r.rating ? `${r.rating}/5` : <span className="badge badge-warning">Planifiée</span>}</td><td className="small">{r.feedback || '—'}</td></tr>)}</tbody></table>
            )}
          </div>
        </>
      )}

      {tab === 'demandes' && (
        <div className="card table-wrap">
          {data.requests.length === 0 ? <Empty>Aucune demande</Empty> : (
            <table className="table clickable-rows"><thead><tr><th>Référence</th><th>Type</th><th>Déposée le</th><th>Statut</th></tr></thead>
              <tbody>{data.requests.map((r) => <tr key={r.id}><td><Link to={`/requests/${r.id}`} className="link mono">{r.reference}</Link></td>
                <td>{r.type_name}</td><td>{date(r.created_at)}</td><td><Badge map={REQUEST_STATUS} value={r.status} /></td></tr>)}</tbody></table>
          )}
        </div>
      )}

      {tab === 'remuneration' && (
        <div className="card table-wrap">
          <h3>Historique de rémunération (Solde)</h3>
          {data.payrolls.length === 0 ? <Empty>Aucun bulletin</Empty> : (
            <table className="table"><thead><tr><th>Période</th><th>Source</th><th className="num">Brut</th><th className="num">Net</th><th /></tr></thead>
              <tbody>{data.payrolls.map((p) => <tr key={p.id}><td>{MONTHS[p.period_month - 1]} {p.period_year}</td>
                <td>{p.source === 'solde' ? 'Solde' : 'Simulation'}</td><td className="num">{money(p.gross)}</td><td className="num"><b>{money(p.net)}</b></td>
                <td><button type="button" className="link" onClick={() => download(`/solde/payslips/${p.id}/pdf`)}>PDF</button></td></tr>)}</tbody></table>
          )}
        </div>
      )}

      {tab === 'documents' && (
        <div className="card">
          <div className="card-head"><h3>Dossier numérique (archivage)</h3>
            <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()}><FilePlus2 size={14} /> Ajouter une pièce</button>
            <input ref={fileRef} type="file" hidden accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.txt" onChange={upload} />
          </div>
          {data.documents.length === 0 && <Empty>Aucune pièce archivée</Empty>}
          <ul className="doc-list">{data.documents.map((d) => (
            <li key={d.id}><FileText size={16} /><button type="button" className="link" onClick={() => download(`/employees/${a.id}/documents/${d.id}`, d.name)}>{d.name}</button>
              <small className="muted">{Math.round(d.size_bytes / 1024)} Ko · {date(d.created_at)}</small></li>
          ))}</ul>
        </div>
      )}

      {tab === 'historique' && (
        <div className="card table-wrap">
          <h3>Traçabilité des modifications</h3>
          {data.changes.length === 0 ? <Empty>Aucune modification</Empty> : (
            <table className="table"><thead><tr><th>Date</th><th>Auteur</th><th>Champ</th><th>Avant</th><th>Après</th></tr></thead>
              <tbody>{data.changes.map((c) => <tr key={c.id}><td className="small">{dateTime(c.created_at)}</td><td>{c.user_name || 'Système'}</td>
                <td className="mono">{c.field}</td><td className="small muted">{c.old_value ?? '—'}</td><td className="small">{c.new_value ?? '—'}</td></tr>)}</tbody></table>
          )}
        </div>
      )}

      {modal === 'edit' && <AgentForm agent={a} institutionId={a.institution_id} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />}
      {modal === 'acte' && <RequestForm employee={a} onClose={() => setModal(null)} />}
      {modal === 'bio' && <SmallForm title="Enrôlement biométrique" onClose={() => setModal(null)}
        fields={[{ key: 'biometric_id', label: 'Identifiant biométrique (terminal)', required: true, default: a.biometric_id || '' }]}
        onSubmit={(f) => run(() => api.post(`/employees/${a.id}/biometrie`, f), 'Agent enrôlé').then((ok) => ok && setModal(null))} />}
      {modal === 'diploma' && <SmallForm title="Ajouter un diplôme" onClose={() => setModal(null)}
        fields={[{ key: 'title', label: 'Intitulé', required: true, full: true }, { key: 'level', label: 'Niveau' },
          { key: 'school', label: 'Établissement' }, { key: 'year', label: 'Année', type: 'number' }]}
        onSubmit={(f) => run(() => api.post(`/employees/${a.id}/diplomas`, f), 'Diplôme ajouté').then((ok) => ok && setModal(null))} />}
      {modal === 'event' && <SmallForm title="Sanction ou distinction" onClose={() => setModal(null)}
        fields={[{ key: 'type', label: 'Type', required: true, options: [['distinction', 'Distinction'], ['sanction', 'Sanction']], default: 'distinction' },
          { key: 'effective_date', label: 'Date', type: 'date', required: true, default: todayISO() },
          { key: 'description', label: 'Description', required: true, full: true }, { key: 'acte_reference', label: 'Référence de l’acte' }]}
        onSubmit={(f) => run(() => api.post(`/employees/${a.id}/career-events`, f), 'Acte enregistré').then((ok) => ok && setModal(null))} />}
    </>
  );
}
