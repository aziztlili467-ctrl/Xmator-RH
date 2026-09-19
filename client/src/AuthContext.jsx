import { createContext, useContext, useEffect, useState } from 'react';
import { api, getAppareilId } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Redémarrage : la session durable est dans le cookie HttpOnly → renouvellement
  // automatique du jeton d'accès (aucun token persistant côté client).
  // Verrou anti-race au (re)demarrage : on ne leve la barriere de chargement qu'une
  // fois le refresh de session resolu (succes OU echec). Pendant ce temps, aucune
  // redirection vers /login n'est possible, meme si la session etait persiste localement.
  useEffect(() => {
    let actif = true;
    api.auth.refresh()
      .then((r) => { if (actif) { setUser(r.user); localStorage.setItem('has_session', '1'); } })
      .catch(() => { if (actif) { setUser(null); localStorage.removeItem('has_session'); } })
      .finally(() => { if (actif) setLoading(false); });
    return () => { actif = false; };
  }, []);

  const login = async (login, password) => {
    const r = await api.auth.login(login, password, getAppareilId());
    setUser(r.user);
    localStorage.setItem('has_session', '1');
    return r.user;
  };

  const logout = async () => {
    setUser(null);
    localStorage.removeItem('has_session');
    await api.auth.logout();
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

// Après connexion : portail de sélection des modules (hub), sauf les employés
// qui vont directement sur leur espace personnel.
const REDIRECT = {
  super_admin: '/modules',
  consultation: '/modules',
  moderateur: '/modules',
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
  // Borne kiosk biométrique : réservée au compte kiosque (super_admin)
  if (pathname === '/borne') return role === 'super_admin';
  if (role === 'super_admin') return true;
  if (role === 'consultation') {
    return pathname === '/' || pathname === '/modules' || pathname === '/calcul-paie' || pathname === '/indemnites-fv' || pathname === '/simulateur-impot' || pathname === '/stats-journal' || pathname === '/journal-rma' || pathname === '/horaires' || pathname === '/presence' || pathname === '/pointage-biometrique' || pathname === '/notification-absences';
  }
  if (role === 'moderateur') {
    if (pathname === '/mon-espace' || pathname === '/comptes' || pathname === '/maintenance' || pathname === '/mouchard' || pathname === '/parametres-codification' || pathname === '/indemnites-fv' || pathname === '/parametres-indemnites') return false;
    if (pathname.startsWith('/application')) return false;
    return true;
  }
  return false;
}