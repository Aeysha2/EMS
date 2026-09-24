import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api, { getToken, setToken } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!getToken());

  const refresh = useCallback(async () => {
    if (!getToken()) { setUser(null); setLoading(false); return; }
    try {
      const { user: u } = await api.get('/auth/me');
      setUser(u);
    } catch {
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const onLogout = () => setUser(null);
    window.addEventListener('ems:logout', onLogout);
    return () => window.removeEventListener('ems:logout', onLogout);
  }, [refresh]);

  const openSession = (res) => {
    setToken(res.token);
    setUser(res.user);
    return res.user;
  };

  /** Étape 1 : mot de passe. Renvoie { mfa_required, mfa_token } si un code est attendu. */
  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    if (res.mfa_required) return res;
    return { user: openSession(res) };
  };

  /** Étape 2 : code de l'application d'authentification. */
  const verifyMfa = async (mfaToken, code) => ({ user: openSession(await api.post('/auth/mfa/verify', { mfa_token: mfaToken, code })) });

  const activate = async (data) => openSession(await api.post('/auth/activate', data));

  const logout = () => { setToken(null); setUser(null); };

  const value = useMemo(() => {
    const role = user?.role;
    return {
      user, setUser, loading, login, verifyMfa, activate, logout, refresh,
      isAgent: role === 'agent',
      isDRH: role === 'gestionnaire_rh',
      isPilotage: role === 'pilotage',
      isDSI: role === 'admin_dsi',
      isChef: !!user?.isChef,
      isCentral: role === 'pilotage' || role === 'admin_dsi',
      hasDossier: !!user?.employee_id,
    };
  }, [user, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
