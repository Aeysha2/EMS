import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Empty, Field, Modal, PageHeader, Tabs } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api, { qs } from '../services/api';
import { date, LEAVE_TYPES, MONTHS } from '../utils/format';
import useFetch from '../utils/useFetch';

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function Calendar() {
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const start = new Date(cursor);
  start.setDate(1 - ((cursor.getDay() + 6) % 7)); // Monday before the 1st
  const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const { data } = useFetch(`/calendar${qs({ from: iso(days[0]), to: iso(days[41]) })}`);

  const eventsOn = (d) => {
    const k = iso(d);
    if (!data) return [];
    return [
      ...data.events.filter((e) => e.date === k).map((e) => ({ key: `e${e.id}`, tone: 'primary', text: `📢 ${e.title}` })),
      ...data.reviews.filter((r) => r.date === k).map((r) => ({ key: `r${r.id}`, tone: 'purple', text: `🎯 Évaluation ${r.full_name}` })),
      ...data.deadlines.filter((p) => p.date === k).map((p) => ({ key: `p${p.id}`, tone: 'danger', text: `📁 ${p.reference}` })),
      ...data.leaves.filter((l) => l.start_date <= k && l.end_date >= k && d.getDay() % 6 !== 0)
        .map((l) => ({ key: `l${l.id}${k}`, tone: 'success', text: `🌴 ${l.full_name}`, title: LEAVE_TYPES[l.leave_type] })),
    ];
  };

  const today = iso(new Date());
  return (
    <div className="card">
      <div className="card-head">
        <button type="button" className="icon-btn" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><ChevronLeft size={18} /></button>
        <h3>{MONTHS[cursor.getMonth()]} {cursor.getFullYear()}</h3>
        <button type="button" className="icon-btn" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><ChevronRight size={18} /></button>
      </div>
      <div className="calendar">
        {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((d) => <div key={d} className="cal-head">{d}</div>)}
        {days.map((d) => (
          <div key={iso(d)} className={`cal-day ${d.getMonth() !== cursor.getMonth() ? 'other' : ''} ${iso(d) === today ? 'today' : ''} ${d.getDay() % 6 === 0 ? 'weekend' : ''}`}>
            <span className="cal-num">{d.getDate()}</span>
            {eventsOn(d).slice(0, 4).map((e) => <span key={e.key} className={`cal-ev tone-${e.tone}`} title={e.title || e.text}>{e.text}</span>)}
            {eventsOn(d).length > 4 && <small className="muted">+{eventsOn(d).length - 4}</small>}
          </div>
        ))}
      </div>
      <div className="legend">
        <span><i className="dot tone-primary" /> Événement</span><span><i className="dot tone-success" /> Congé</span>
        <span><i className="dot tone-purple" /> Évaluation</span><span><i className="dot tone-danger" /> Échéance dossier</span>
      </div>
    </div>
  );
}

export default function Announcements() {
  const { isHR } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState('news');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', content: '', event_date: '' });
  const { data, reload } = useFetch('/announcements');

  const publish = async (e) => {
    e.preventDefault();
    try {
      await api.post('/announcements', form);
      toast.success('Annonce publiée — tous les agents sont notifiés');
      setCreating(false);
      setForm({ title: '', content: '', event_date: '' });
      reload();
    } catch (err) { toast.error(err); }
  };
  const remove = async (a) => {
    if (!window.confirm('Supprimer cette annonce ?')) return;
    try { await api.del(`/announcements/${a.id}`); reload(); } catch (err) { toast.error(err); }
  };

  return (
    <>
      <PageHeader title="Annonces & calendrier" subtitle="Informations du ministère et agenda">
        {isHR && <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> Publier une annonce</button>}
      </PageHeader>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'news', label: 'Annonces' }, { value: 'calendar', label: 'Calendrier' }]} />
      {tab === 'calendar' && <Calendar />}
      {tab === 'news' && (
        <>
          {data?.length === 0 && <Empty>Aucune annonce</Empty>}
          {data?.map((a) => (
            <div key={a.id} className="card">
              <div className="card-head">
                <h3>{a.title}</h3>
                {isHR && <button type="button" className="icon-btn danger" onClick={() => remove(a)}><Trash2 size={16} /></button>}
              </div>
              <p className="pre">{a.content}</p>
              <small className="muted">{a.author_name} · publié le {date(a.created_at)}{a.event_date && ` · 📅 événement le ${date(a.event_date)}`}</small>
            </div>
          ))}
        </>
      )}
      {creating && (
        <Modal title="Nouvelle annonce" onClose={() => setCreating(false)}
          footer={<><button type="button" className="btn" onClick={() => setCreating(false)}>Annuler</button><button form="ann-form" className="btn btn-primary">Publier</button></>}>
          <form id="ann-form" className="form-grid" onSubmit={publish}>
            <Field label="Titre" full><input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
            <Field label="Contenu" full><textarea required rows={5} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} /></Field>
            <Field label="Date de l’événement (calendrier)"><input type="date" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} /></Field>
          </form>
        </Modal>
      )}
    </>
  );
}
