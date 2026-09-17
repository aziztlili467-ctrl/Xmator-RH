import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@shared/AuthContext';

const LoginTerminal = lazy(() => import('./LoginTerminal'));
const BorneXmatorEye = lazy(() => import('@shared/pages/BorneXmatorEye'));

function Chargement() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
      <p className="text-sm text-slate-400">Chargement…</p>
    </div>
  );
}

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Chargement />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function AppTerminal() {
  return (
    <Suspense fallback={<Chargement />}>
      <Routes>
        <Route path="/login" element={<LoginTerminal />} />
        <Route path="/borne" element={<RequireAuth><BorneXmatorEye /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/borne" replace />} />
      </Routes>
    </Suspense>
  );
}
