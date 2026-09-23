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

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    setToken(res.token);
    setUser(res.user);
    return res.user;
  };

  const register = async (data) => {
    const res = await api.post('/auth/register', data);
    setToken(res.token);
    setUser(res.user);
    return res.user;
  };

  const logout = () => {
    setToken(null);
    setUser(null);
  };

  const value = useMemo(() => {
    const isHR = user?.role === 'admin' || user?.role === 'hr';
    return {
      user,
      loading,
      login,
      register,
      logout,
      refresh,
      isAdmin: user?.role === 'admin',
      isHR,
      isManager: (user?.managedDepartments?.length ?? 0) > 0,
      canManage: isHR || (user?.managedDepartments?.length ?? 0) > 0,
    };
  }, [user, loading, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
