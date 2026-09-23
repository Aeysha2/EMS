import { useCallback, useEffect, useState } from 'react';
import api from '../services/api';

/** GET `path` and expose { data, loading, error, reload }. Pass null to skip. */
export default function useFetch(path, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(!!path);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    setError(null);
    try {
      setData(await api.get(path));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [path]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, setData, loading, error, reload: load };
}
