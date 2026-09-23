import { Clock, LogIn, LogOut, MapPin } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useToast } from '../context/ToastContext';
import api from '../services/api';
import { ATTENDANCE_STATUS, time } from '../utils/format';
import { Badge } from './ui';

/**
 * Ask the browser for the GPS position (mobile attendance). Resolves null if refused/unavailable.
 * The browser's own timeout does not run while the permission prompt is open, hence the extra guard.
 */
const getPosition = () => new Promise((resolve) => {
  if (!navigator.geolocation) return resolve(null);
  const guard = setTimeout(() => resolve(null), 10000);
  navigator.geolocation.getCurrentPosition(
    (p) => { clearTimeout(guard); resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }); },
    () => { clearTimeout(guard); resolve(null); },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
  );
  return null;
});

export default function CheckInCard({ onChange }) {
  const toast = useToast();
  const [record, setRecord] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    api.get('/attendance/today').then(setRecord).catch(() => setRecord(null));
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  const act = async (kind) => {
    setBusy(true);
    try {
      const body = kind === 'check-in' ? (await getPosition()) || {} : {};
      const r = await api.post(`/attendance/${kind}`, body);
      setRecord(r);
      toast.success(kind === 'check-in' ? 'Arrivée enregistrée' : 'Départ enregistré');
      onChange?.();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  if (record === undefined) return <div className="card"><p className="muted">Chargement du pointage…</p></div>;

  return (
    <div className="card checkin">
      <div className="checkin-clock">
        <Clock size={20} />
        <div>
          <b>{now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</b>
          <small>{now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</small>
        </div>
      </div>
      <div className="checkin-info">
        {!record && <span className="muted">Vous n’avez pas encore pointé aujourd’hui.</span>}
        {record && (
          <>
            <span>Arrivée : <b>{time(record.check_in)}</b></span>
            <span>Départ : <b>{time(record.check_out)}</b></span>
            {record.check_out && <span>Durée : <b>{record.working_hours} h</b>{record.overtime > 0 && ` (+${record.overtime} h sup.)`}</span>}
            <Badge map={ATTENDANCE_STATUS} value={record.status} />
            {record.latitude && <span className="muted small"><MapPin size={12} /> GPS enregistré</span>}
          </>
        )}
      </div>
      <div className="checkin-actions">
        {!record && <button type="button" className="btn btn-success" disabled={busy} onClick={() => act('check-in')}><LogIn size={18} /> Pointer l’arrivée</button>}
        {record && record.check_in && !record.check_out && (
          <button type="button" className="btn btn-danger" disabled={busy} onClick={() => act('check-out')}><LogOut size={18} /> Pointer le départ</button>
        )}
        {record?.check_out && <span className="badge badge-success">Journée terminée</span>}
      </div>
    </div>
  );
}
