import { ChevronLeft, ChevronRight, Globe2, Landmark, Megaphone, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Empty, Field, Loader, Modal, PageHeader, Tabs } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api, { qs } from '../services/api';
import { date, dateTime, MONTHS } from '../utils/format';
import useFetch from '../utils/useFetch';

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Annonces (nationales ou de l'institution) et calendrier personnel. */
export default function Announcements() {
  const [tab, setTab] = useState('annonces');
  return (
    <>
      <PageHeader title="Annonces et calendrier" subtitle="Communication de la Présidence, du SGG et de votre DRH ; vos échéances" />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'annonces', label: 'Annonces' }, { value: 'calendrier', label: 'Calendrier' }]} />
      {tab === 'annonces' ? <List /> : <Calendar />}
    </>
  );
}

function List() {
  const { user, isPilotage, isDRH } = useAuth();
  const toast = useToast();
  const { data, reload } = useFetch('/announcements');
  const [form, setForm] = useState(null);
  const canPublish = isPilotage || isDRH;
  if (!data) return <Loader />;

  const publish = async () => {
    try { await api.post('/announcements', form); setForm(null); toast.success('Annonce publiée'); reload(); } catch (err) { toast.error(err); }
  };
  const remove = async (a) => {
    if (!window.confirm(`Supprimer l’annonce « ${a.title} » ?`)) return;
    try { await api.del(`/announcements/${a.id}`); reload(); } catch (err) { toast.error(err); }
  };
  const canDelete = (a) => a.author_id === user.id || (isPilotage && !a.institution_id) || (isDRH && a.institution_id === user.institution_id);

  return (
    <>
      {canPublish && (
        <div className="toolbar"><span className="grow" />
          <button type="button" className="btn btn-primary" onClick={() => setForm({ title: '', content: '', event_date: '', national: isPilotage })}>
            <Plus size={16} /> Publier une annonce</button>
        </div>
      )}
      {!data.length && <div className="card"><Empty icon={Megaphone}>Aucune annonce</Empty></div>}
      <div className="stack">
        {data.map((a) => (
          <article key={a.id} className="card announcement">
            <div className="row gap">
              <span className={`badge ${a.institution_id ? 'badge-info' : 'badge-success'}`}>
                {a.institution_id ? <><Landmark size={12} /> {a.institution_sigle}</> : <><Globe2 size={12} /> Nationale</>}
              </span>
              {a.event_date && <span className="badge badge-warning">Le {date(a.event_date)}</span>}
              <span className="grow" />
              {canDelete(a) && <button type="button" className="icon-btn" onClick={() => remove(a)} aria-label="Supprimer"><Trash2 size={16} /></button>}
            </div>
            <h3>{a.title}</h3>
            <p className="pre-wrap">{a.content}</p>
            <small className="muted">{a.author_name || '—'} · {dateTime(a.created_at)}</small>
          </article>
        ))}
      </div>
      {form && (
        <Modal title="Nouvelle annonce" onClose={() => setForm(null)}
          footer={<><button type="button" className="btn" onClick={() => setForm(null)}>Annuler</button>
            <button type="button" className="btn btn-primary" disabled={!form.title || !form.content} onClick={publish}>Publier</button></>}>
          <div className="form-grid">
            <Field label="Titre" full><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
            <Field label="Contenu" full><textarea rows={5} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} /></Field>
            <Field label="Date de l’événement (facultatif)"><input type="date" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} /></Field>
            {isPilotage && (
              <Field label="Diffusion"><select value={form.national ? '1' : '0'} onChange={(e) => setForm({ ...form, national: e.target.value === '1' })}>
                <option value="1">Nationale (toutes les institutions)</option><option value="0">Mon institution</option></select></Field>
            )}
          </div>
          <p className="muted small">Les agents concernés sont notifiés à la publication.</p>
        </Modal>
      )}
    </>
  );
}

function Calendar() {
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const from = iso(month);
  const to = iso(new Date(month.getFullYear(), month.getMonth() + 1, 0));
  const { data, loading } = useFetch(`/calendar${qs({ from, to })}`);

  const byDay = useMemo(() => {
    const map = {};
    const add = (d, item) => { (map[d] ||= []).push(item); };
    const span = (start, end, item) => {
      const s = new Date(`${String(start).slice(0, 10)}T00:00:00`);
      const e = new Date(`${String(end).slice(0, 10)}T00:00:00`);
      for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
        const k = iso(d);
        if (k >= from && k <= to) add(k, item);
      }
    };
    if (!data) return map;
    data.events.forEach((e) => add(String(e.date).slice(0, 10), { tone: 'success', label: e.title }));
    data.leaves.forEach((l) => span(l.start_date, l.end_date, { tone: 'info', label: `${l.full_name} — ${l.label}` }));
    data.reviews.forEach((r) => add(String(r.date).slice(0, 10), { tone: 'purple', label: `Évaluation ${r.period} — ${r.full_name}` }));
    data.sessions.forEach((s) => span(s.start_date, s.end_date, { tone: 'warning', label: `Formation : ${s.title}` }));
    data.deadlines.forEach((d) => add(String(d.date).slice(0, 10), { tone: 'danger', label: `Échéance ${d.reference}` }));
    return map;
  }, [data, from, to]);

  const lead = (month.getDay() + 6) % 7; // lundi en premier
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const today = iso(new Date());
  const shift = (n) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));

  return (
    <div className="card">
      <div className="row gap">
        <button type="button" className="icon-btn" onClick={() => shift(-1)} aria-label="Mois précédent"><ChevronLeft size={18} /></button>
        <h3 className="grow center">{MONTHS[month.getMonth()]} {month.getFullYear()}</h3>
        <button type="button" className="icon-btn" onClick={() => shift(1)} aria-label="Mois suivant"><ChevronRight size={18} /></button>
      </div>
      {loading && !data ? <Loader /> : (
        <div className="calendar">
          {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((d) => <div key={d} className="cal-head">{d}</div>)}
          {cells.map((d, i) => {
            if (!d) return <div key={`x${i}`} className="cal-day other" />;
            const key = iso(new Date(month.getFullYear(), month.getMonth(), d));
            const items = byDay[key] || [];
            return (
              <div key={key} className={`cal-day ${key === today ? 'today' : ''} ${i % 7 >= 5 ? 'weekend' : ''}`}>
                <span className="cal-num">{d}</span>
                {items.slice(0, 3).map((it, j) => <span key={j} className={`cal-ev tone-${it.tone}`} title={it.label}>{it.label}</span>)}
                {items.length > 3 && <span className="cal-num muted">+{items.length - 3}</span>}
              </div>
            );
          })}
        </div>
      )}
      <div className="legend">
        <span><i className="dot tone-success" /> Événement</span><span><i className="dot tone-info" /> Congé (moi / mon équipe)</span>
        <span><i className="dot tone-purple" /> Évaluation</span><span><i className="dot tone-warning" /> Formation</span>
        <span><i className="dot tone-danger" /> Échéance de demande</span>
      </div>
    </div>
  );
}
