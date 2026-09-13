import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState, useMemo } from 'react';
import {
  IconDashboard,
  IconUsers,
  IconCalendarPlus,
  IconArrowDown,
  IconCalendarCheck,
  IconJournal,
  IconEdit,
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
  IconBuildingOffice,
  IconBanknotes,
  IconAward,
  IconPrinter,
  IconCamera,
} from './icons';
import { useAuth } from '../AuthContext';
import { api, getToken, getSessionId } from '../api';
import PwaInstall from './PwaInstall';
import ChatWidget from './ChatWidget';
import ToastHost from './ToastHost';

const NAV = [
  { to: '/', label: 'Tableau de bord', icon: IconDashboard, end: true, roles: ['super_admin', 'consultation', 'moderateur'] },
  { section: 'Renseignements RH', roles: ['super_admin', 'moderateur'] },
  { to: '/employes', label: 'Employés', icon: IconUsers, end: false, roles: ['super_admin', 'moderateur'], module: 'employes' },
  { to: '/categories', label: 'Catégories', icon: IconTags, end: true, roles: ['super_admin', 'moderateur'], module: 'categories' },
  { subSection: 'Fiche Signalétique', roles: ['super_admin', 'moderateur'] },
  { to: '/fiche-signaletique/creation', label: 'Création et Maj Employé', icon: IconUsers, end: true, roles: ['super_admin', 'moderateur'], module: 'employes' },
  { to: '/fiche-signaletique/profil', label: 'Consult. Profil Employé', icon: IconClipboardList, end: true, roles: ['super_admin', 'moderateur'], module: 'employes' },
  { to: '/fiche-signaletique/indemnites', label: 'Consult. Détaillée Indemnités', icon: IconTrendUp, end: true, roles: ['super_admin', 'moderateur'], module: 'employes' },
  { section: 'Demandes de congé', roles: ['super_admin', 'moderateur'] },
  { to: '/demandes/nouvelle', label: 'Nouvelle demande', icon: IconFileText, end: true, roles: ['super_admin', 'moderateur'], module: 'demandes' },
  { to: '/demandes/instance', label: 'Demandes en instance', icon: IconClipboardCheck, end: true, roles: ['super_admin', 'moderateur'], module: 'demandes' },
  { section: 'Gestion des congés', roles: ['super_admin', 'moderateur'] },
  { to: '/solde-initial', label: 'Nouveau solde initial', icon: IconCalendarPlus, end: true, roles: ['super_admin', 'moderateur'], module: 'soldes' },
  { to: '/prelevement', label: 'Prélèvement de congé', icon: IconArrowDown, end: true, roles: ['super_admin', 'moderateur'], module: 'soldes' },
  { to: '/ajout-annuel', label: 'Ajout de solde annuel', icon: IconCalendarCheck, end: true, roles: ['super_admin', 'moderateur'], module: 'soldes' },
  { to: '/journal', label: 'Journal des mouvements', icon: IconJournal, end: true, roles: ['super_admin', 'moderateur'], module: 'soldes' },
  { to: '/editer-solde', label: 'Éditer solde de congé', icon: IconEdit, end: true, roles: ['super_admin', 'moderateur'], module: 'soldes' },
  { subSection: 'Édition des congés', roles: ['super_admin', 'moderateur'] },
  { to: '/edition-conges', label: 'Journal des congés', icon: IconPrinter, end: true, roles: ['super_admin', 'moderateur'], module: 'soldes' },
  { section: 'Paie Mensuelle', roles: ['super_admin', 'consultation', 'moderateur'] },
  { to: '/stats-journal', label: 'Journal de paie', icon: IconTrendUp, end: true, roles: ['super_admin', 'consultation', 'moderateur'] },
  { to: '/journal-rma', label: 'Journal RMA', icon: IconClipboardList, end: true, roles: ['super_admin', 'consultation', 'moderateur'] },
  { to: '/calcul-paie', label: 'Calcul de Paie', icon: IconClipboardList, end: true, roles: ['super_admin', 'consultation', 'moderateur'], module: 'paie' },
  { to: '/indemnites-fv', label: 'Indemnités FV', icon: IconBanknotes, end: true, roles: ['super_admin', 'consultation', 'moderateur'], module: 'paie' },
  { to: '/simulateur-impot', label: 'Simulateur Impôt', icon: IconTrendUp, end: true, roles: ['super_admin', 'consultation', 'moderateur'], module: 'paie' },
  { to: '/parametres-codification', label: 'Paramètres & Codification', icon: IconSettings, end: true, roles: ['super_admin'] },
  { to: '/grille-salaire', label: 'Grille de Salaire', icon: IconClipboardList, end: true, roles: ['super_admin'] },
  { section: 'Horaires', roles: ['super_admin', 'consultation', 'moderateur'] },
  { to: '/horaires', label: 'Horaires de travail', icon: IconClock, end: true, roles: ['super_admin', 'consultation', 'moderateur'] },
  { to: '/presence', label: 'Pointages & présences', icon: IconUserClock, end: true, roles: ['super_admin', 'consultation', 'moderateur'] },
  { to: '/borne', label: 'Borne de pointage (Xmator-Eye)', icon: IconCamera, end: true, roles: ['super_admin', 'consultation', 'moderateur'], module: 'presence' },
  { to: '/pointage-biometrique', label: 'Pointage biométrique', icon: IconCamera, end: true, roles: ['super_admin', 'consultation', 'moderateur'], module: 'presence' },
  { to: '/notification-absences', label: "Notification d'Absences", icon: IconBellAlert, end: true, roles: ['super_admin', 'consultation', 'moderateur'] },
  { section: 'Maladie', roles: ['super_admin', 'moderateur'] },
  { to: '/maladie/nouvel-arret', label: 'Nouvel arrêt maladie', icon: IconStethoscope, end: true, roles: ['super_admin', 'moderateur'], module: 'maladie' },
  { to: '/maladie/instance', label: 'Arrêts en instance', icon: IconClipboardCheck, end: true, roles: ['super_admin', 'moderateur'], module: 'maladie' },
  { to: '/maladie/ajout-solde', label: 'Ajout solde maladie annuel', icon: IconCalendarCheck, end: true, roles: ['super_admin', 'moderateur'], module: 'maladie' },
  { to: '/maladie/journal', label: 'Journal des arrêts maladie', icon: IconJournal, end: true, roles: ['super_admin', 'moderateur'], module: 'maladie' },
  { section: 'Administration', roles: ['super_admin'] },
  { to: '/calendrier', label: "Calendrier de l'année", icon: IconCalendarDays, end: true, roles: ['super_admin'] },
  { to: '/comptes', label: 'Gestion des comptes', icon: IconUserCog, end: true, roles: ['super_admin'] },
  { to: '/mouchard', label: 'Mouchard (activité)', icon: IconActivity, end: true, roles: ['super_admin'] },
  { to: '/maintenance', label: 'Sauvegarde & données', icon: IconShieldCheck, end: true, roles: ['super_admin'] },
  { section: 'Application Web', roles: ['super_admin'] },
  { to: '/application/telecharger', label: "Télécharger l'application", icon: IconDownloadApp, end: true, roles: ['super_admin'] },
  { to: '/application/appareils', label: 'Appareils connectés', icon: IconMonitor, end: true, roles: ['super_admin'] },
  { to: '/application/chat', label: 'Chat en direct', icon: IconChat, end: true, roles: ['super_admin'] },
  { section: 'Référentiel', roles: ['super_admin'] },
  { to: '/referentiel/parametres-generaux', label: 'Paramètres Généraux', icon: IconSettings, end: true, roles: ['super_admin'] },
  { to: '/referentiel/parametres-administratifs', label: 'Paramètres administratifs', icon: IconBuildingOffice, end: true, roles: ['super_admin'] },
  { to: '/referentiel/parametre-salaire', label: 'Paramètre de Salaire', icon: IconBanknotes, end: true, roles: ['super_admin'] },
  { to: '/referentiel/parametres-conge-maladie', label: 'Paramètres de Congé & Maladie', icon: IconCalendarCheck, end: true, roles: ['super_admin'] },
  { to: '/referentiel/parametres-pointage', label: 'Paramètres de Pointage', icon: IconUserClock, end: true, roles: ['super_admin'] },
  { to: '/parametres-presence', label: 'Paramètres de présence', icon: IconSettings, end: true, roles: ['super_admin'], module: 'presence' },
  { to: '/parametres-indemnites', label: 'Paramètres Indemnités', icon: IconBanknotes, end: true, roles: ['super_admin'], module: 'paie' },
  { to: '/referentiel/promotion-notation', label: 'Promotion & Notation', icon: IconAward, end: true, roles: ['super_admin'] },
  { to: '/referentiel/saas-tableau-de-bord', label: 'SaaS & Tableau de Bord', icon: IconDashboard, end: true, roles: ['super_admin'] },
];

const GROUP_ICONS = {
  'Tableau de bord': IconDashboard,
  'Renseignements RH': IconUsers,
  'Demandes de congé': IconFileText,
  'Gestion des congés': IconCalendarCheck,
  'Paie Mensuelle': IconClipboardList,
  'Horaires': IconClock,
  'Maladie': IconStethoscope,
  'Administration': IconUserCog,
  'Application Web': IconMonitor,
  'Référentiel': IconSettings,
};

const ROLE_LABELS = {
  super_admin: 'Super Admin',
  consultation: 'Consultation',
  moderateur: 'Modérateur',
  employe: 'Employé',
};

function itemVisible(item, role, perms) {
  if (!item.roles.includes(role)) return false;
  if (role === 'moderateur' && item.module) {
    const p = perms && perms[item.module];
    return !!(p && (p.lire || p.ajouter || p.modifier));
  }
  return true;
}

function buildGroups(filteredNav) {
  const groups = [];
  let current = null;
  let sub = null;
  for (const item of filteredNav) {
    if (item.section) {
      current = { id: item.section, label: item.section, icon: GROUP_ICONS[item.section] || IconTags, items: [], subGroups: [] };
      sub = null;
      groups.push(current);
    } else if (item.subSection) {
      sub = { id: item.subSection, label: item.subSection, items: [] };
      if (current) current.subGroups.push(sub);
      else {
        current = { id: item.subSection, label: item.subSection, icon: IconTags, items: [], subGroups: [] };
        groups.push(current);
        sub = null;
      }
    } else if (item.to) {
      const target = sub || current;
      if (!target) {
        let dash = groups.find((g) => g.id === 'Tableau de bord');
        if (!dash) { dash = { id: 'Tableau de bord', label: 'Tableau de bord', icon: IconDashboard, items: [], subGroups: [] }; groups.unshift(dash); }
        dash.items.push(item);
      } else {
        target.items.push(item);
      }
    }
  }
  const dashEntry = filteredNav.find((x) => x.to === '/');
  if (dashEntry && !groups.find((g) => g.id === 'Tableau de bord')) {
    groups.unshift({ id: 'Tableau de bord', label: 'Tableau de bord', icon: IconDashboard, items: [dashEntry] });
  }
  return groups.filter((g) => g.items.length > 0 || g.id === 'Tableau de bord');
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOuvert, setMenuOuvert] = useState(false);
  const role = user?.role || 'employe';
  const perms = role === 'moderateur' ? user?.permissions : null;
  let nav = NAV.filter((item) => itemVisible(item, role, perms));
  nav = nav.filter((item, i) => {
    if (!item.section) return true;
    const rest = nav.slice(i + 1);
    const prochaineSection = rest.findIndex((x) => x.section);
    const liens = prochaineSection === -1 ? rest : rest.slice(0, prochaineSection);
    return liens.some((x) => x.to);
  });

  const groups = useMemo(() => buildGroups(nav), [nav]);

  const activeGroupId = useMemo(() => {
    const path = location.pathname;
    for (const g of groups) {
      if (g.items.some((it) => path === it.to || (it.to !== '/' && path.startsWith(it.to)))) return g.id;
    }
    return groups[0]?.id || null;
  }, [location.pathname, groups]);

  const [selectedGroup, setSelectedGroup] = useState(activeGroupId);
  useEffect(() => { if (activeGroupId) setSelectedGroup(activeGroupId); }, [activeGroupId]);
  useEffect(() => { setMenuOuvert(false); }, [location.pathname]);

  // Tiroir mobile : bloque le défilement de la page en dessous et ferme sur Échap.
  useEffect(() => {
    if (!menuOuvert) return;
    const overflowInitial = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const surEchap = (e) => { if (e.key === 'Escape') setMenuOuvert(false); };
    window.addEventListener('keydown', surEchap);
    return () => {
      document.body.style.overflow = overflowInitial;
      window.removeEventListener('keydown', surEchap);
    };
  }, [menuOuvert]);

  // Referme automatiquement le tiroir au passage sur tablette/bureau (>= 768px)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const surChangement = (e) => { if (e.matches) setMenuOuvert(false); };
    mq.addEventListener('change', surChangement);
    return () => mq.removeEventListener('change', surChangement);
  }, []);

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
        navigator.sendBeacon('/api/auth/logout-beacon', new Blob([JSON.stringify({ token })], { type: 'application/json' }));
      } catch {}
    };
    window.addEventListener('beforeunload', fermeture);
    window.addEventListener('pagehide', fermeture);
    return () => { clearInterval(battement); window.removeEventListener('beforeunload', fermeture); window.removeEventListener('pagehide', fermeture); };
  }, []);

  const deconnexion = () => { logout(); navigate('/login', { replace: true }); };

  const activeGroup = groups.find((g) => g.id === selectedGroup) || groups.find((g) => g.id === activeGroupId) || groups[0];
  const subItems = activeGroup ? activeGroup.items : [];
  const subGroups = activeGroup ? (activeGroup.subGroups || []) : [];
  const [ficheOpen, setFicheOpen] = useState(false);

  const handleGroupClick = (g) => {
    setSelectedGroup(g.id);
    if (g.id === 'Tableau de bord') {
      navigate('/');
    } else if (g.items.length === 1) {
      navigate(g.items[0].to);
    }
  };

  // Chrome global unifié « Prestige / Luxe & Tech » : la sidebar chocolat et la
  // topbar crème restent identiques sur TOUTES les pages (le tableau de bord
  // « cockpit » porte lui-même son propre thème sombre dans son contenu).
  const isDashboard = location.pathname === '/';

  return (
    <div className="flex min-h-screen bg-[var(--bg-app)]">
      {/* Voile sombre pour tiroir mobile (< 768px) */}
      {menuOuvert && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] md:hidden"
          onClick={() => setMenuOuvert(false)}
          aria-hidden="true"
        />
      )}

      {/* Barre latérale chocolat profond #37261A :
          - Mobile (< 768px) : tiroir coulissant (drawer)
          - Tablette (768–1023px) : rail d'icônes compact (w-[72px])
          - Bureau (>= 1024px) : barre latérale complète (w-[288px])
          L'élément actif porte un dégradé or brossé, identique sur toutes les pages. */}
      <aside
        id="menu-principal"
        aria-label="Menu principal"
        aria-hidden={!menuOuvert ? undefined : false}
        className={`app-sidebar fixed inset-y-0 start-0 z-[60] flex flex-col items-stretch overflow-y-auto overscroll-contain pb-[var(--safe-bottom)] pt-[var(--safe-top)] transition-transform duration-200 ease-out md:z-40 md:w-[72px] md:translate-x-0 lg:w-[288px] ${
          menuOuvert ? 'w-[min(86vw,288px)] translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0'
        }`}
        style={{
          backgroundColor: 'var(--bg-sidebar)',
          borderRight: '1px solid var(--sidebar-border)',
        }}
      >
        {/* En-tête de la sidebar */}
        <div className="flex items-center justify-between px-4 py-4 md:flex-col md:justify-center md:px-2 md:py-4 lg:flex-row lg:justify-start lg:gap-3 lg:px-5 lg:py-6">
          <div className="flex items-center gap-3 md:flex-col md:gap-0 lg:flex-row lg:gap-3">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-extrabold md:h-10 md:w-10"
              style={{ background: 'var(--gold-grad)', color: '#2E2013', border: '1px solid rgba(255,236,175,0.55)', boxShadow: 'var(--shadow-gold)' }}
            >
              A
            </div>
            <div className="min-w-0 md:hidden lg:block">
              <p className="truncate font-display text-sm font-bold leading-tight text-white">Amicale du Personnel</p>
              <p className="truncate text-xs" style={{ color: 'var(--sidebar-inactive)' }}>Banque Centrale — RH</p>
            </div>
          </div>
          {/* Bouton fermeture sur mobile */}
          <button
            type="button"
            onClick={() => setMenuOuvert(false)}
            aria-label="Fermer le menu"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white md:hidden"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Liste des rubriques */}
        <nav className="mt-1 flex flex-1 flex-col items-stretch gap-1 overflow-y-auto px-2 pb-4 md:items-center md:px-1.5 lg:items-stretch lg:px-3 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.2)_transparent] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/20">
          {groups.map((g) => {
            const isActive = selectedGroup === g.id;
            const GIcon = g.icon;
            const groupHref = g.id === 'Tableau de bord' ? '/' : (g.items[0]?.to || '/');
            return (
              <a
                key={g.id}
                href={groupHref}
                onClick={(e) => {
                  if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
                  e.preventDefault();
                  handleGroupClick(g);
                }}
                title={g.label}
                aria-label={g.label}
                data-active={isActive}
                className="nav-item group flex min-h-touch w-full cursor-pointer flex-row items-center gap-2.5 px-3 py-2.5 text-start text-[13px] no-underline md:min-h-0 md:justify-center md:px-0 md:py-2.5 lg:justify-start lg:px-3"
              >
                <span
                  className="icon-badge nav-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-lg md:h-10 md:w-10 lg:h-8 lg:w-8"
                  style={{
                    background: isActive ? 'rgba(46, 32, 19, 0.24)' : 'rgba(255,255,255,0.06)',
                    color: isActive ? '#2E2013' : 'var(--sidebar-inactive)',
                  }}
                >
                  <GIcon />
                </span>
                <span
                  className="hidden flex-1 whitespace-normal break-words text-start text-[12.5px] font-medium leading-[1.15] tracking-tight md:hidden lg:block"
                  style={{ color: isActive ? '#2E2013' : 'var(--sidebar-inactive)', fontWeight: isActive ? 700 : 500 }}
                >
                  {g.label}
                </span>
                {g.items.length > 1 && (
                  <span
                    className={`hidden ms-auto rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular md:hidden lg:inline-flex ${
                      isActive ? 'bg-[#2E2013]/85 text-[#F3D27A]' : 'bg-white/10 text-white/70'
                    }`}
                  >
                    {g.items.length}
                  </span>
                )}
              </a>
            );
          })}
        </nav>

        {/* Pied de barre latérale */}
        <div
          className="border-t px-4 py-4 text-xs md:hidden lg:block lg:px-5"
          style={{
            borderColor: 'var(--sidebar-border)',
            color: 'var(--sidebar-inactive)',
          }}
        >
          <p className="font-semibold text-[#F5E9D0]">Module congés — v1.2</p>
          <p className="mt-0.5 text-[11px]" style={{ color: 'var(--sidebar-inactive)' }}>
            Rôle : <span className="font-semibold text-white">{ROLE_LABELS[role]}</span>
          </p>
        </div>
      </aside>

      {/* Conteneur de contenu principal décalé selon les paliers :
          - Mobile (< 768px) : ps-0
          - Tablette (768–1023px) : md:ps-[72px]
          - Bureau (>= 1024px) : lg:ps-[288px] */}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col ps-0 md:ps-[72px] lg:ps-[288px]">
        <header
          className="sticky top-0 z-30 border-b pt-[var(--safe-top)] backdrop-blur-md"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-topbar)' }}
        >
          <div className="flex items-center justify-between gap-3 px-3 py-2 sm:px-6 sm:py-3">
            <div className="flex min-w-0 items-center gap-2">
              {/* Bouton burger visible uniquement sur mobile (< 768px) */}
              <button
                type="button"
                onClick={() => setMenuOuvert(true)}
                title="Ouvrir le menu"
                aria-label="Ouvrir le menu"
                aria-expanded={menuOuvert}
                aria-controls="menu-principal"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-stone-700 hover:bg-stone-100 md:hidden"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
              </button>
              <div className="min-w-0">
                <h1 className="truncate font-display text-base font-semibold text-stone-900 sm:text-lg lg:text-xl">
                  {activeGroup?.label || 'Gestion des congés'}
                </h1>
                <p className="hidden truncate text-xs text-stone-600 sm:block">
                  Amicale du Personnel — {activeGroup?.items.length || 0} rubrique(s)
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              {role === 'employe' && (
                <NavLink to="/mon-espace" className="hidden text-sm font-semibold text-brand-600 hover:text-brand-700 hover:underline sm:block">
                  Mon espace
                </NavLink>
              )}
              <div className="flex items-center gap-2">
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-extrabold shadow-sm"
                  style={{ background: 'var(--gold-grad)', color: '#2E2013', border: '1px solid rgba(255,236,175,0.55)' }}
                >
                  {user?.login?.slice(0, 1)?.toUpperCase() || 'A'}
                </div>
                <div className="hidden text-end sm:block">
                  <p className="text-sm font-semibold leading-tight text-stone-800">{user?.login}</p>
                  <p className="text-xs text-stone-600">{ROLE_LABELS[role] || role}</p>
                </div>
                <button
                  type="button"
                  onClick={deconnexion}
                  title="Se déconnecter"
                  aria-label="Se déconnecter"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-stone-500 hover:bg-brand-50 hover:text-brand-700"
                >
                  <IconLogout />
                </button>
              </div>
            </div>
          </div>

          {/* Bandeau de sous-navigation */}
          {(subItems.length > 1 || subGroups.length > 0) && (
            <div className="app-subnav">
              <div className="flex items-center gap-2 overflow-x-auto px-2 py-1.5 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:px-6 sm:py-2 [&::-webkit-scrollbar]:hidden">
                {subItems.length > 0 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    <span className="hidden shrink-0 text-[10px] font-bold uppercase tracking-widest sm:block" style={{ color: 'var(--text-muted)' }}>
                      {activeGroup.label}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {subItems.map((it) => (
                        <NavLink
                          key={it.to}
                          to={it.to}
                          end={it.end}
                          className={({ isActive }) => `subnav-chip shrink-0 ${isActive ? 'is-active' : ''}`}
                        >
                          <span className="flex h-4 w-4 shrink-0 items-center justify-center"><it.icon /></span>
                          {it.label}
                        </NavLink>
                      ))}
                    </div>
                  </div>
                )}
                {subGroups.map((sg) => (
                  <div key={sg.id} className="relative" onMouseEnter={() => setFicheOpen(true)} onMouseLeave={() => setFicheOpen(false)}>
                    <a
                      href={sg.items[0]?.to || '/'}
                      onClick={(e) => {
                        if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
                        e.preventDefault();
                        setFicheOpen((v) => !v);
                      }}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 no-underline hover:bg-stone-50"
                      style={{ borderColor: 'var(--border)' }}
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-600">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                      </span>
                      {sg.label}
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${ficheOpen ? 'rotate-180' : ''}`}><path d="M6 9l6 6 6-6"/></svg>
                    </a>
                    {ficheOpen && (
                      <div className="submenu-slide absolute start-0 top-full z-20 mt-1 flex w-[min(84vw,260px)] min-w-0 sm:min-w-[260px] flex-col gap-1 rounded-xl border border-[#E5D5B5] bg-white/95 p-1.5 shadow-xl backdrop-blur-md">
                        {sg.items.map((it) => (
                          <NavLink
                            key={it.to}
                            to={it.to}
                            end={it.end}
                            onClick={() => setFicheOpen(false)}
                            className={({ isActive }) => `flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition ${isActive ? 'bg-[var(--brand-primary-bg)] text-[#75581A]' : 'text-stone-700 hover:bg-[var(--brand-50)]'}`}
                          >
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--brand-50)] text-[#8F701E]"><it.icon /></span>
                            {it.label}
                          </NavLink>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </header>

        <main className={`w-full min-w-0 max-w-full flex-1 overflow-x-hidden px-3 pt-4 sm:px-6 sm:pt-6 ${isDashboard ? 'pb-6' : 'pb-24 sm:pb-6'}`}>
          {/* Transition de page : fondu de 200 ms à chaque navigation entre catégories */}
          <div key={location.pathname} className="page-fade min-w-0">
            <Outlet />
          </div>
        </main>
      </div>

      <PwaInstall />
      <ChatWidget user={user} />
      <ToastHost />
    </div>
  );
}
