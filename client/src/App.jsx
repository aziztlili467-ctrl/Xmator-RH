import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth, canAccess, homeForRole } from './AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import AccesRefuse from './pages/AccesRefuse';
import MonEspace from './pages/MonEspace';
import GestionComptes from './pages/GestionComptes';
import Dashboard from './pages/Dashboard';
import Employes from './pages/Employes';
import EmployeDetail from './pages/EmployeDetail';
import NouveauSoldeInitial from './pages/NouveauSoldeInitial';
import PrelevementConges from './pages/PrelevementConges';
import AjoutAnnuel from './pages/AjoutAnnuel';
import Journal from './pages/Journal';
import Categories from './pages/Categories';
import NouvelleDemande from './pages/NouvelleDemande';
import DemandesInstance from './pages/DemandesInstance';
import ArretMaladie from './pages/ArretMaladie';
import ArretsMaladieInstance from './pages/ArretsMaladieInstance';
import AjoutSoldeMaladie from './pages/AjoutSoldeMaladie';
import JournalMaladie from './pages/JournalMaladie';
import StatsJournal from './pages/StatsJournal';
import Maintenance from './pages/Maintenance';
import Mouchard from './pages/Mouchard';
import Horaires from './pages/Horaires';
import Presence from './pages/Presence';
import CalendrierAnnee from './pages/CalendrierAnnee';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-500">
        Chargement…
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

function PublicOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-500">
        Chargement…
      </div>
    );
  }
  if (user) return <Navigate to={homeForRole(user.role)} replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
      <Route path="/acces-refuse" element={<AccesRefuse />} />

      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/mon-espace" element={<MonEspace />} />
        <Route path="/comptes" element={<GestionComptes />} />
        <Route path="/mouchard" element={<Mouchard />} />
        <Route path="/horaires" element={<Horaires />} />
        <Route path="/presence" element={<Presence />} />
        <Route path="/calendrier" element={<CalendrierAnnee />} />
        <Route path="/maintenance" element={<Maintenance />} />
        <Route path="/" element={<Dashboard />} />
        <Route path="/employes" element={<Employes />} />
        <Route path="/employes/:id" element={<EmployeDetail />} />
        <Route path="/solde-initial" element={<NouveauSoldeInitial />} />
        <Route path="/prelevement" element={<PrelevementConges />} />
        <Route path="/ajout-annuel" element={<AjoutAnnuel />} />
        <Route path="/journal" element={<Journal />} />
        <Route path="/stats-journal" element={<StatsJournal />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/demandes/nouvelle" element={<NouvelleDemande />} />
        <Route path="/demandes/instance" element={<DemandesInstance />} />
        <Route path="/maladie/nouvel-arret" element={<ArretMaladie />} />
        <Route path="/maladie/instance" element={<ArretsMaladieInstance />} />
        <Route path="/maladie/ajout-solde" element={<AjoutSoldeMaladie />} />
        <Route path="/maladie/journal" element={<JournalMaladie />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}