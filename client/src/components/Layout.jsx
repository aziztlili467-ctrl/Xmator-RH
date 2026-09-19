import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useRef, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { IconTags, IconLogout } from './icons';
import { useAuth } from '../AuthContext';
import { LayoutGrid } from 'lucide-react';
import { api, getToken, getSessionId } from '../api';
import { NAV, GROUP_ICONS, ROLE_LABELS, itemVisible, buildGroups } from '../navConfig';
import PwaInstall from './PwaInstall';
import ChatWidget from './ChatWidget';
import GlobalTableScroll from './GlobalTableScroll';
import ToastHost from './ToastHost';

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
    const match = (it) => (it.end
      ? path === it.to
      : (path === it.to || path.startsWith(it.to + '/')));
    for (const g of groups) {
      if (g.items.some(match)) return g.id;
      if ((g.subGroups || []).some((sg) => sg.items.some(match))) return g.id;
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
  // Sous-menu : panneau rendu via un portail en position fixe (indépendant de
  // l'overflow horizontal du bandeau → fonctionne aussi sur mobile).
  const [openSub, setOpenSub] = useState(null);
  const closeTimer = useRef(null);
  const hoverDevice = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches,
    [],
  );

  const annulerFermeture = () => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
  };
  const planifierFermeture = () => {
    annulerFermeture();
    closeTimer.current = setTimeout(() => setOpenSub(null), 180);
  };
  const ouvrirSub = (sub, el) => {
    if (!el) return;
    annulerFermeture();
    const r = el.getBoundingClientRect();
    const largeur = Math.max(220, Math.min(280, window.innerWidth - 16));
    const left = Math.max(8, Math.min(r.left, window.innerWidth - largeur - 8));
    const hauteur = 12 + sub.items.length * 40;
    const versLeBas = r.bottom + hauteur <= window.innerHeight - 8;
    setOpenSub({
      sub, largeur, left,
      top: versLeBas ? r.bottom + 6 : null,
      bottom: versLeBas ? null : window.innerHeight - r.top + 6,
    });
  };
  const fermerSub = () => { annulerFermeture(); setOpenSub(null); };

  useEffect(() => () => annulerFermeture(), []);
  useEffect(() => { fermerSub(); }, [location.pathname]);
  useEffect(() => {
    if (!openSub) return undefined;
    const surClicExterieur = (e) => {
      if (e.target.closest?.('.submenu-panel') || e.target.closest?.('.submenu-trigger')) return;
      fermerSub();
    };
    const fermer = () => fermerSub();
    const surTouche = (e) => { if (e.key === 'Escape') fermerSub(); };
    document.addEventListener('pointerdown', surClicExterieur, true);
    window.addEventListener('scroll', fermer, true);
    window.addEventListener('resize', fermer);
    window.addEventListener('keydown', surTouche);
    return () => {
      document.removeEventListener('pointerdown', surClicExterieur, true);
      window.removeEventListener('scroll', fermer, true);
      window.removeEventListener('resize', fermer);
      window.removeEventListener('keydown', surTouche);
    };
  }, [openSub]);

  const handleGroupClick = (g) => {
    setSelectedGroup(g.id);
    if (g.id === 'TABLEAU DE BORD') {
      navigate('/');
    } else if (g.items.length === 1) {
      navigate(g.items[0].to);
    }
  };

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
            const groupHref = g.id === 'TABLEAU DE BORD' ? '/' : (g.items[0]?.to || '/');
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
                  className="flex flex-1 whitespace-normal break-words text-start text-[12.5px] font-medium leading-[1.15] tracking-tight md:hidden lg:block"
                  style={{ color: isActive ? '#2E2013' : 'var(--sidebar-inactive)', fontWeight: isActive ? 700 : 500 }}
                >
                  {g.label}
                </span>
                {g.items.length > 1 && (
                  <span
                    className={`inline-flex ms-auto rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular md:hidden lg:inline-flex ${
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
                  {activeGroup?.label || 'GESTION DES CONGÉS'}
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
              {/* Accès au portail de sélection des modules (hub après login) */}
              {role !== 'employe' && (
                <NavLink
                  to="/modules"
                  title="Espace de travail — Modules"
                  aria-label="Espace de travail — Modules"
                  className={({ isActive }) =>
                    `flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition ${
                      isActive
                        ? 'bg-[var(--brand-50)] text-[#8F701E]'
                        : 'text-stone-500 hover:bg-brand-50 hover:text-brand-700'
                    }`
                  }
                >
                  <LayoutGrid size={20} strokeWidth={2} />
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

          {/* Bandeau de sous-navigation — enfants rendus dans l'ordre du NAV
              (rubriques directes et sous-sections entremêlées). Les sous-menus
              sont affichés via un portail en position fixe (jamais rognés par
              le défilement horizontal du bandeau, y compris sur mobile). */}
          {activeGroup && (activeGroup.children || []).length > 0 && (subItems.length > 1 || subGroups.length > 0) && (
            <div className="app-subnav">
              <div className="flex items-center gap-2 overflow-x-auto px-2 py-1.5 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:px-6 sm:py-2 [&::-webkit-scrollbar]:hidden">
                <span className="hidden shrink-0 text-[10px] font-bold uppercase tracking-widest sm:block" style={{ color: 'var(--text-muted)' }}>
                  {activeGroup.label}
                </span>
                {(activeGroup.children || []).map((c, i) =>
                  c.kind === 'item' ? (
                    <NavLink
                      key={`it-${c.item.to}-${i}`}
                      to={c.item.to}
                      end={c.item.end}
                      className={({ isActive }) => `subnav-chip shrink-0 ${isActive ? 'is-active' : ''}`}
                    >
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center">{c.item.icon ? <c.item.icon /> : <IconTags />}</span>
                      {c.item.label}
                    </NavLink>
                  ) : (
                    <button
                      key={`sub-${c.sub.id}`}
                      type="button"
                      className="submenu-trigger inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                      style={{ borderColor: 'var(--border)' }}
                      onMouseEnter={hoverDevice ? (e) => ouvrirSub(c.sub, e.currentTarget) : undefined}
                      onMouseLeave={hoverDevice ? planifierFermeture : undefined}
                      onClick={(e) => {
                        e.preventDefault();
                        if (openSub?.sub.id === c.sub.id) fermerSub();
                        else ouvrirSub(c.sub, e.currentTarget);
                      }}
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-600">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                      </span>
                      {c.sub.label}
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${openSub?.sub.id === c.sub.id ? 'rotate-180' : ''}`}><path d="M6 9l6 6 6-6"/></svg>
                    </button>
                  ),
                )}
              </div>
            </div>
          )}

          {openSub && createPortal(
            <div
              role="menu"
              className="submenu-panel submenu-slide fixed z-[200] flex flex-col gap-1 rounded-xl border border-[#E5D5B5] bg-white/95 p-1.5 shadow-xl backdrop-blur-md"
              style={{ left: openSub.left, width: openSub.largeur, ...(openSub.top != null ? { top: openSub.top } : { bottom: openSub.bottom }) }}
              onMouseEnter={hoverDevice ? annulerFermeture : undefined}
              onMouseLeave={hoverDevice ? planifierFermeture : undefined}
            >
              {openSub.sub.items.map((it) => (
                <NavLink
                  key={it.to}
                  to={it.to}
                  end={it.end}
                  onClick={fermerSub}
                  className={({ isActive }) => `flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition ${isActive ? 'bg-[var(--brand-primary-bg)] text-[#75581A]' : 'text-stone-700 hover:bg-[var(--brand-50)]'}`}
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--brand-50)] text-[#8F701E]">{it.icon ? <it.icon /> : <IconTags />}</span>
                  {it.label}
                </NavLink>
              ))}
            </div>,
            document.body,
          )}
        </header>

        <main className={`w-full min-w-0 max-w-full flex-1 overflow-x-hidden px-3 pt-4 sm:px-6 sm:pt-6 ${isDashboard ? 'pb-6' : 'pb-24 sm:pb-6'}`}>
          <div key={location.pathname} className="page-fade min-w-0">
            <Outlet />
          </div>
        </main>
      </div>

      <PwaInstall />
      <ChatWidget user={user} />

      <GlobalTableScroll />
      <ToastHost />
    </div>
  );
}
