import { FileDown, FileSpreadsheet } from 'lucide-react';
import { useState } from 'react';
import Indicators from '../components/Indicators';
import { ErrorBox, Loader, PageHeader } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { download, qs } from '../services/api';
import { dateTime } from '../utils/format';
import useFetch from '../utils/useFetch';

export default function Pilotage() {
  const { isPilotage, user } = useAuth();
  const [institution, setInstitution] = useState('');
  const { data: structures } = useFetch(isPilotage ? '/structures' : null);
  const { data, loading, error } = useFetch(`/pilotage/indicators${qs({ institution })}`);
  const query = qs({ institution });
  return (
    <>
      <PageHeader title="Tableaux de bord RH" subtitle={isPilotage ? 'Vue consolidée pour la Présidence et le Secrétariat Général du Gouvernement' : `Indicateurs de ${user.institution_name}`}>
        {isPilotage && (
          <select value={institution} onChange={(e) => setInstitution(e.target.value)} aria-label="Périmètre">
            <option value="">National (toutes institutions)</option>
            {structures?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        <button type="button" className="btn" onClick={() => download(`/pilotage/export.xlsx${query}`)}><FileSpreadsheet size={16} /> Excel</button>
        <button type="button" className="btn" onClick={() => download(`/pilotage/export.pdf${query}`)}><FileDown size={16} /> Note PDF</button>
      </PageHeader>
      {error && <ErrorBox error={error} />}
      {loading && !data && <Loader />}
      {data && (
        <>
          <p className="muted small">Données agrégées — aucun dossier individuel n’est exposé. Situation au {dateTime(data.generated_at)}.</p>
          <Indicators d={data} />
        </>
      )}
    </>
  );
}
