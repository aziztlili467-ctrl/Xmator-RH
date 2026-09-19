import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, canAccess } from '../AuthContext';

/**
 * ProtectedRoute — garde de route avec gestion du chargement
 * 
 * Problème F5 : l'état initial user=null provoquait une redirection vers /login
 * avant que /api/auth/refresh (cookie HttpOnly) ne réponde.
 * 
 * Correction : bloque toute redirection tant que loading === true.
 * Fix F5 : le state user démarre à null au reload, mais le refresh async via cookie HttpOnly
 * doit d'abord répondre. Sans garde loading, redirection immédiate vers /login.
 */
export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  // CORRECTION F5 : bloque tout rendu ou redirection tant que loading === true
  if (loading) {
    return <div className="flex items-center justify-center h-screen">Chargement de la session...</div>;
  }

  if (!user) {
    return <Navigate replace to="/login" state={{ from: location }} />;
  }

  // Vérification additionnelle des droits par rôle (super_admin, moderateur, etc.)
  if (!canAccess(user.role, location.pathname)) {
    return <Navigate to="/acces-refuse" replace />;
  }

  return children;
}

/**
 * PublicOnly — inverse de ProtectedRoute : bloque l'accès à /login si déjà connecté
 * avec la même garde loading pour éviter un redirect prématuré au F5.
 */
export function PublicOnlyRoute({ children }) {
  const { user, loading } = useAuth();

  // Même garde loading que ProtectedRoute
  if (loading) {
    return <div className="flex items-center justify-center h-screen">Chargement de la session...</div>;
  }

  if (user) {
    return <Navigate to={user.role === 'employe' ? '/mon-espace' : '/modules'} replace />;
  }

  return children;
}
