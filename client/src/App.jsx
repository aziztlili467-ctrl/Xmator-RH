import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth, canAccess, homeForRole } from './AuthContext';
import Layout from './components/Layout';

// Code-splitting par route : seul le code de la page visitée est chargé
const Login = lazy(() => import('./pages/Login'));
const AccesRefuse = lazy(() => import('./pages/AccesRefuse'));
const MonEspace = lazy(() => import('./pages/MonEspace'));
const GestionComptes = lazy(() => import('./pages/GestionComptes'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Employes = lazy(() => import('./pages/Employes'));
const EmployeDetail = lazy(() => import('./pages/EmployeDetail'));
const NouveauSoldeInitial = lazy(() => import('./pages/NouveauSoldeInitial'));
const PrelevementConges = lazy(() => import('./pages/PrelevementConges'));
const AjoutAnnuel = lazy(() => import('./pages/AjoutAnnuel'));
const Journal = lazy(() => import('./pages/Journal'));
const EditerSoldeConge = lazy(() => import('./pages/EditerSoldeConge'));
const EditionConges = lazy(() => import('./pages/EditionConges'));
const Categories = lazy(() => import('./pages/Categories'));
const NouvelleDemande = lazy(() => import('./pages/NouvelleDemande'));
const DemandesInstance = lazy(() => import('./pages/DemandesInstance'));
const ArretMaladie = lazy(() => import('./pages/ArretMaladie'));
const ArretsMaladieInstance = lazy(() => import('./pages/ArretsMaladieInstance'));
const AjoutSoldeMaladie = lazy(() => import('./pages/AjoutSoldeMaladie'));
const JournalMaladie = lazy(() => import('./pages/JournalMaladie'));
const StatsJournal = lazy(() => import('./pages/StatsJournal'));
const ParametresCodification = lazy(() => import('./pages/ParametresCodification'));
const GrilleSalaire = lazy(() => import('./pages/GrilleSalaire'));
const JournalRMA = lazy(() => import('./pages/JournalRMA'));
const NotificationAbsences = lazy(() => import('./pages/NotificationAbsences'));
const FicheCreation = lazy(() => import('./pages/FicheCreation'));
const FicheProfil = lazy(() => import('./pages/FicheProfil'));
const FicheIndemnites = lazy(() => import('./pages/FicheIndemnites'));
const Maintenance = lazy(() => import('./pages/Maintenance'));
const Mouchard = lazy(() => import('./pages/Mouchard'));
const Horaires = lazy(() => import('./pages/Horaires'));
const Presence = lazy(() => import('./pages/Presence'));
const CalendrierAnnee = lazy(() => import('./pages/CalendrierAnnee'));
const TelechargerApp = lazy(() => import('./pages/TelechargerApp'));
const AppareilsConnectes = lazy(() => import('./pages/AppareilsConnectes'));
const ChatDirectAdmin = lazy(() => import('./pages/ChatDirectAdmin'));
const ReferentielParametresGeneraux = lazy(() => import('./pages/ReferentielParametresGeneraux'));
const ReferentielParametresAdministratifs = lazy(() => import('./pages/ReferentielParametresAdministratifs'));
const ReferentielParametreSalaire = lazy(() => import('./pages/ReferentielParametreSalaire'));
const ReferentielParametresCongeMaladie = lazy(() => import('./pages/ReferentielParametresCongeMaladie'));
const ReferentielParametresPointage = lazy(() => import('./pages/ReferentielParametresPointage'));
const ReferentielPromotionNotation = lazy(() => import('./pages/ReferentielPromotionNotation'));
const ReferentielSaasTableauBord = lazy(() => import('./pages/ReferentielSaasTableauBord'));

function Chargement() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-500">
      Chargement…
    </div>
  );
}

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
    <Suspense fallback={<Chargement />}>
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
                <Route path="/application/telecharger" element={<TelechargerApp />} />
                <Route path="/application/appareils" element={<AppareilsConnectes />} />
                <Route path="/application/chat" element={<ChatDirectAdmin />} />
        <Route path="/referentiel/parametres-generaux" element={<ReferentielParametresGeneraux />} />
        <Route path="/referentiel/parametres-administratifs" element={<ReferentielParametresAdministratifs />} />
        <Route path="/referentiel/parametre-salaire" element={<ReferentielParametreSalaire />} />
        <Route path="/referentiel/parametres-conge-maladie" element={<ReferentielParametresCongeMaladie />} />
        <Route path="/referentiel/parametres-pointage" element={<ReferentielParametresPointage />} />
        <Route path="/referentiel/promotion-notation" element={<ReferentielPromotionNotation />} />
        <Route path="/referentiel/saas-tableau-de-bord" element={<ReferentielSaasTableauBord />} />
        <Route path="/" element={<Dashboard />} />
        <Route path="/employes" element={<Employes />} />
        <Route path="/employes/:id" element={<EmployeDetail />} />
        <Route path="/solde-initial" element={<NouveauSoldeInitial />} />
        <Route path="/prelevement" element={<PrelevementConges />} />
        <Route path="/ajout-annuel" element={<AjoutAnnuel />} />
        <Route path="/journal" element={<Journal />} />
        <Route path="/editer-solde" element={<EditerSoldeConge />} />
        <Route path="/edition-conges" element={<EditionConges />} />
        <Route path="/stats-journal" element={<StatsJournal />} />
        <Route path="/parametres-codification" element={<ParametresCodification />} />
        <Route path="/grille-salaire" element={<GrilleSalaire />} />
        <Route path="/journal-rma" element={<JournalRMA />} />
        <Route path="/notification-absences" element={<NotificationAbsences />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/fiche-signaletique/creation" element={<FicheCreation />} />
        <Route path="/fiche-signaletique/profil" element={<FicheProfil />} />
        <Route path="/fiche-signaletique/indemnites" element={<FicheIndemnites />} />
        <Route path="/demandes/nouvelle" element={<NouvelleDemande />} />
        <Route path="/demandes/instance" element={<DemandesInstance />} />
        <Route path="/maladie/nouvel-arret" element={<ArretMaladie />} />
        <Route path="/maladie/instance" element={<ArretsMaladieInstance />} />
        <Route path="/maladie/ajout-solde" element={<AjoutSoldeMaladie />} />
        <Route path="/maladie/journal" element={<JournalMaladie />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}