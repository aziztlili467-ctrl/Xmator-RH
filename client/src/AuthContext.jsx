import { createContext, useContext, useEffect, useState } from 'react';
import { api, setToken, getToken } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api.auth.me()
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (login, password) => {
    const r = await api.auth.login(login, password);
    setToken(r.token);
    setUser(r.user);
    return r.user;
  };

  const logout = () => {
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

const REDIRECT = {
  super_admin: '/',
  consultation: '/',
  moderateur: '/',
  employe: '/mon-espace',
};

// Redirige vers l'espace du rôle après connexion
export function homeForRole(role) {
  return REDIRECT[role] || '/login';
}

// Vérifie qu'un rôle a le droit d'accéder à une route donnée
export function canAccess(role, pathname) {
  if (!role) return false;
  if (pathname === '/login' || pathname === '/acces-refuse') return true;
  if (pathname === '/mon-espace') return role === 'employe' || role === 'super_admin';
  if (role === 'super_admin') return true;
  if (role === 'consultation') {
    return pathname === '/' || pathname === '/stats-journal' || pathname === '/horaires' || pathname === '/presence';
  }
  if (role === 'moderateur') {
    if (pathname === '/mon-espace' || pathname === '/comptes' || pathname === '/maintenance' || pathname === '/mouchard') return false;
    return true;
  }
  return false;
}