import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  IconDashboard,
  IconUsers,
  IconCalendarPlus,
  IconArrowDown,
  IconCalendarCheck,
  IconJournal,
  IconTags,
  IconFileText,
  IconClipboardCheck,
  IconStethoscope,
  IconTrendUp,
  IconUserCog,
  IconShieldCheck,
  IconActivity,
  IconClock,
  IconCalendarDays,
  IconUserClock,
  IconLogout,
  IconDownloadApp,
  IconMonitor,
  IconChat,
  IconSettings,
  IconClipboardList,
  IconBellAlert,
} from './icons';
import { useAuth } from '../AuthContext';
import { api, getToken, getSessionId } from '../api';
import PwaInstall from './PwaInstall';
import ChatWidget from './ChatWidget';

const NAV = [
  { to: '/', label: 'Tableau de bord', icon: IconDashboard, end: true, roles: ['super_admin', 'consultation', 'moderateur'] },
  { to: '/employes', label: 'Employés', icon: IconUsers, end: false, roles: ['super_admin', 'moderateur'], module: 'employes' },
  { to: '/categories', label: 'Catégories', icon: IconTags, end: true, roles: ['super_admin', 'moderateur'], module: 'categories' },
  { section: 'Demandes de congé', roles: ['super_admin', 'moderateur'] },
  { to: '/demandes/nouvelle', label: 'Nouvelle demande', icon: IconFileText, end: true, roles: ['super_admin', 'moderateur'], module: 'demandes' },
  { to: '/demandes/instance', label: 'Demandes en instance', icon: IconClipboardCheck, end: true, roles: ['super_admin', 'moderateur'], module: 'demandes' },
  { section: 'Gestion des congés', roles: ['super_admin', 'moderateur'] },
  { to: '/solde-initial', label: 'Nouveau solde initial', icon: IconCalendarPlus, end: true, roles: ['super_admin', 'moderateur'], module: 'soldes' },
  { to: '/prelevement', label: 'Prélèvement de congé', icon: IconArrowDown, end: true, roles: ['super_admin', 'moderateur'], module: 'soldes' },
  { to: '/ajout-annuel', label: 'Ajout de solde annuel', icon: IconCalendarCheck, end: true, roles: ['super_admin', 'moderateur'], module: 'soldes' },
  { to: '/journal', label: 'Journal des mouvements', icon: IconJournal, end: true, roles: ['super_admin', 'moderateur'], module: 'soldes' },
  { section: 'Paie Mensuelle', roles: ['super_admin', 'consultation', 'moderateur'] },
  { to: '/stats-journal', label: 'Journal de paie', icon: IconTrendUp, end: true, roles: ['super_admin', 'consultation', 'moderateur'] },
  { to: '/journal-rma', label: 'Journal RMA', icon: IconClipboardList, end: true, roles: ['super_admin', 'consultation', 'moderateur'] },
  { to: '/parametres-codification', label: 'Paramètres & Codification', icon: IconSettings, end: true, roles: ['super_admin'] },
  { to: '/grille-salaire', label: 'Grille de Salaire', icon: IconClipboardList, end: true, roles: ['super_admin'] },
  { section: 'Horaires', roles: ['super_admin', 'consultation', 'moderateur'] },
  { to: '/horaires', label: 'Horaires de travail', icon: IconClock, end: true, roles: ['super_admin', 'consultation', 'moderateur'] },
  { to: '/presence', label: 'Pointages & présences', icon: IconUserClock, end: true, roles: ['super_admin', 'consultation', 'moderateur'] },
  { to: '/notification-absences', label: "Notification d'Absences", icon: IconBellAlert, end: true, roles: ['super_admin', 'consultation', 'moderateur'] },
  { section: 'Maladie', roles: ['super_admin', 'moderateur'] },
  { to: '/maladie/nouvel-arret', label: 'Nouvel arrêt maladie', icon: IconStethoscope, end: true, roles: ['super_admin', 'moderateur'], module: 'maladie' },
  { to: '/maladie/instance', label: 'Arrêts en instance', icon: IconClipboardCheck, end: true, roles: ['super_admin', 'moderateur'], module: 'maladie' },
  { to: '/maladie/ajout-solde', label: 'Ajout solde maladie annuel', icon: IconCalendarCheck, end: true, roles: ['super_admin', 'moderateur'], module: 'maladie' },
  { to: '/maladie/journal', label: 'Journal des arrêts maladie', icon: IconJournal, end: true, roles: ['super_admin', 'moderateur'], module: 'maladie' },
  { section: 'Administration', roles: ['super_admin'] },
  { to: '/calendrier', label: 'Calendrier de l\'année', icon: IconCalendarDays, end: true, roles: ['super_admin'] },
  { to: '/comptes', label: 'Gestion des comptes', icon: IconUserCog, end: true, roles: ['super_admin'] },
  { to: '/mouchard', label: 'Mouchard (activité)', icon: IconActivity, end: true, roles: ['super_admin'] },
  { to: '/maintenance', label: 'Sauvegarde & données', icon: IconShieldCheck, end: true, roles: ['super_admin'] },
  { section: 'Application Web', roles: ['super_admin'] },
  { to: '/application/telecharger', label: 'Télécharger l\'application', icon: IconDownloadApp, end: true, roles: ['super_admin'] },
  { to: '/application/appareils', label: 'Appareils connectés', icon: IconMonitor, end: true, roles: ['super_admin'] },
  { to: '/application/chat', label: 'Chat en direct', icon: IconChat, end: true, roles: ['super_admin'] },
];

const ROLE_LABELS = {
  super_admin: 'Super Admin',
  consultation: 'Consultation',
  moderateur: 'Modérateur',
  employe: 'Employé',
};

// Un modérateur ne voit que les rubriques pour lesquelles il a au moins un droit (lire/ajouter/modifier)
function itemVisible(item, role, perms) {
  if (!item.roles.includes(role)) return false;
  if (role === 'moderateur' && item.module) {
    const p = perms && perms[item.module];
    return !!(p && (p.lire || p.ajouter || p.modifier));
  }
  return true;
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOuvert, setMenuOuvert] = useState(false);
  const role = user?.role || 'employe';
  const perms = role === 'moderateur' ? user?.permissions : null;
  let nav = NAV.filter((item) => itemVisible(item, role, perms));
  // Retire les sections devenues vides (aucun lien restant entre cette section et la suivante)
  nav = nav.filter((item, i) => {
    if (!item.section) return true;
    const rest = nav.slice(i + 1);
    const prochaineSection = rest.findIndex((x) => x.section);
    const liens = prochaineSection === -1 ? rest : rest.slice(0, prochaineSection);
    return liens.some((x) => x.to);
  });

  // Ferme le menu mobile à chaque changement de route
  useEffect(() => { setMenuOuvert(false); }, [location.pathname]);

  // ---- Tracking de session (Application Web) : heartbeat 60 s + beacon de fermeture ----
  useEffect(() => {
    if (!getToken()) return;
    const battement = setInterval(() => {
      const sid = getSessionId();
      if (!sid) return;
      api.appareilsHeartbeat(sid).catch(() => {});
    }, 60 * 1000);
    const fermeture = () => {
      try {
        const token = getToken();
        if (!token) return;
        navigator.sendBeacon(
          '/api/auth/logout-beacon',
          new Blob([JSON.stringify({ token })], { type: 'application/json' })
        );
      } catch { /* best effort */ }
    };
    window.addEventListener('beforeunload', fermeture);
    window.addEventListener('pagehide', fermeture);
    return () => {
      clearInterval(battement);
      window.removeEventListener('beforeunload', fermeture);
      window.removeEventListener('pagehide', fermeture);
    };
  }, []);

  const deconnexion = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex min-h-screen">
      {menuOuvert && (
        <div className="fixed inset-0 z-30 bg-black/40 backdrop-blur-[2px] md:hidden" onClick={() => setMenuOuvert(false)} />
      )}
      <aside className={`fixed inset-y-0 start-0 z-40 flex w-64 flex-col bg-brand-950 text-white transition-transform duration-200 ease-out md:translate-x-0 ${menuOuvert ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center gap-3 px-5 py-6">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-lg font-extrabold text-white ring-1 ring-white/20">
            A
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold leading-tight">Amicale du Personnel</p>
            <p className="truncate text-xs text-brand-200">Banque Centrale — RH</p>
          </div>
          <button
            onClick={() => setMenuOuvert(false)}
            title="Fermer le menu"
            className="ms-auto rounded-lg p-1.5 text-brand-200 transition hover:bg-white/10 hover:text-white md:hidden"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <nav className="mt-2 flex-1 space-y-1 overflow-y-auto overscroll-contain px-3 pb-4 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.25)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/25 [&::-webkit-scrollbar-track]:bg-transparent">
          {nav.map((item, i) =>
            item.section ? (
              <p key={i} className="px-3 pb-1 pt-4 text-[10px] font-bold uppercase tracking-widest text-brand-300/80">
                {item.section}
              </p>
            ) : (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                    isActive
                      ? 'bg-white/15 text-white shadow-inner'
                      : 'text-brand-200 hover:bg-white/5 hover:text-white'
                  }`
                }
              >
                <span className="shrink-0"><item.icon /></span>
                <span className="truncate">{item.label}</span>
              </NavLink>
            )
          )}
        </nav>
        <div className="border-t border-white/10 px-5 py-4 text-xs text-brand-200">
          Module congés — v1.1
          <br />
          Authentification par rôle
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col md:ms-64">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-8 sm:py-4">
            <div className="flex min-w-0 items-center gap-3">
              <button
                onClick={() => setMenuOuvert(true)}
                title="Ouvrir le menu"
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 md:hidden"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
              </button>
              <div className="min-w-0">
                <h1 className="truncate text-base font-bold text-slate-900 sm:text-lg">Gestion des congés</h1>
                <p className="hidden truncate text-xs text-slate-500 sm:block">Amicale du Personnel de la Banque Centrale — 140 employés</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:gap-4">
              {role === 'employe' && (
                <NavLink to="/mon-espace" className="text-sm font-semibold text-brand-600 hover:underline">
                  Mon espace
                </NavLink>
              )}
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-700 text-sm font-bold text-white">
                  {user?.login?.slice(0, 1)?.toUpperCase() || 'A'}
                </div>
                <div className="hidden text-end sm:block">
                  <p className="text-sm font-semibold leading-tight text-slate-800">{user?.login}</p>
                  <p className="text-xs text-slate-500">{ROLE_LABELS[role] || role}</p>
                </div>
                <button
                  onClick={deconnexion}
                  title="Se déconnecter"
                  className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                >
                  <IconLogout />
                </button>
              </div>
            </div>
          </div>
        </header>
        <main className="flex-1 px-4 py-4 sm:px-8 sm:py-6">
          <Outlet />
        </main>
      </div>
      <PwaInstall />
      <ChatWidget user={user} />
    </div>
  );
}