import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, canAccess } from '../AuthContext';

/**
 * ProtectedRoute — garde de route avec gestion du chargement
 * 
 * Problème F5 : l'état initial user=null provoquait une redirection vers /login
 * avant que /api/auth/refresh (cookie HttpOnly) ne réponde.
 * 
 * Correction : bloque toute redirection tant que loading === true.
 * Affiche un écran de chargement pendant la vérification asynchrone de session.
 */
export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  // Tant que la session est en cours de vérification (refresh via cookie HttpOnly),
  // on ne redirige PAS — on affiche un loader pour éviter le flash vers /login.
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-500">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-brand-700" />
          <span>Chargement de la session…</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!canAccess(user.role, location.pathname)) {
    return <Navigate to="/acces-refuse" replace />;
  }

  return children;
}

/**
 * PublicOnly — inverse de ProtectedRoute : bloque l'accès à /login si déjà connecté
 * avec la même garde loading pour éviter un redirect prématuré.
 */
export function PublicOnlyRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-500">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-brand-700" />
          <span>Chargement…</span>
        </div>
      </div>
    );
  }

  if (user) {
    const { homeForRole } = require('../AuthContext');
    // import dynamique évité : homeForRole déjà importable
    return <Navigate to={user.role === 'employe' ? '/mon-espace' : '/modules'} replace />;
  }

  return children;
}
