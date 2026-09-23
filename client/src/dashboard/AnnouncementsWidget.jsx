import { Megaphone } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Empty } from '../components/ui';
import { date } from '../utils/format';

export default function AnnouncementsWidget({ items }) {
  return (
    <div className="card">
      <div className="card-head">
        <h3><Megaphone size={18} /> Annonces</h3>
        <Link to="/announcements" className="link">Tout voir</Link>
      </div>
      {items.length === 0 && <Empty>Aucune annonce</Empty>}
      <ul className="announce-list">
        {items.map((a) => (
          <li key={a.id}>
            <b>{a.title}</b>
            <p>{a.content}</p>
            <small className="muted">{a.author_name} · {date(a.created_at)}{a.event_date && ` · 📅 ${date(a.event_date)}`}</small>
          </li>
        ))}
      </ul>
    </div>
  );
}
