/**
 * ModulesHub.jsx — Portail de sélection des modules RH (refonte 3D premium)
 * ----------------------------------------------------------------------------
 * Page de transition plein écran affichée juste après la connexion : présente
 * tous les espaces de travail du SaaS sous forme de cartes 3D interactives.
 *
 * Architecture de la page (route STANDALONE — hors Layout — pour offrir 100 %
 * de l'écran aux cartes sur mobile / PWA, sans sidebar obstruant la vue) :
 *
 *  - Header PWA compact : logo "Amicale BCT", profil utilisateur, déconnexion.
 *  - Hero : kicker institutionnel, titre + recherche temps réel.
 *  - Grille adaptative : 1 colonne (mobile) / 2 (tablette) / 3 (desktop).
 *
 * Rendu 3D & animations :
 *  - Icônes monumentales (64–80 px) dans un socle "Sphere Glass / néo-brutalism
 *    doré", en **flottaison continue** (y: [0, -8, 0], 3.2 s, easeInOut) avec
 *    **ombre portée synchronisée** (scale + opacity en contre-phase).
 *  - Parallaxe : l'icône est sur un calque Z (translateZ) et s'incline
 *    indépendamment de la carte (profondeur renforcée au survol).
 *  - Tilt perspective 1200 px piloté par le curseur OU l'inclinaison gyroscope
 *    (deviceorientation, demande de permission sur iOS, échec silencieux).
 *  - Glassmorphism : blanc pur, bordure ambre métallique, spotlight doré qui
 *    suit le pointeur, ombre volumétrique douce au survol.
 *  - Micro-interactions : secousse spring de l'icône (scale 1.12 + rotate 4),
 *    bouton "Accéder" qui se remplit d'un dégradé doré + flèche qui glisse,
 *    badge "N rubriques disponibles" à pastille pulsante.
 *  - Performance : animations sur `transform` uniquement (GPU), `will-change`,
 *    `useReducedMotion()` pour désactiver le superflu, tilt désactivé sur
 *    écrans tactiles grossiers (sauf gyroscope).
 *
 * Charte : anthracite #1c1917 en fond, or/ambre #f59e0b / #fbbf24 / #d97706,
 * cartes blanc pur — or brossé (var(--gold-grad)) pour le socle.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useMotionTemplate,
  useReducedMotion,
  AnimatePresence,
} from 'framer-motion';
import {
  Search,
  ArrowRight,
  X,
  Sparkles,
  LogOut,
} from 'lucide-react';
import { useAuth, canAccess } from '../AuthContext';
import { NAV, itemVisible, buildModules, ROLE_LABELS } from '../navConfig';

/* ========================================================================== *
 *  Les cartes du hub NE SONT PLUS codées en dur : elles sont dérivées
 *  automatiquement des catégories du menu latéral (NAV) via `buildModules`.
 *  Toute nouvelle catégorie principale ajoutée au NAV apparaît donc d'elle-même
 *  dans le hub (voir client/src/navConfig.js → MODULE_META pour personnaliser).
 * ========================================================================== */

/* Variantes d'apparition (stagger) et de sortie (recherche) */
const conteneurVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};

const carteVariants = {
  hidden: { opacity: 0, y: 30, scale: 0.95 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
  exit: {
    opacity: 0,
    scale: 0.92,
    y: -10,
    transition: { duration: 0.2, ease: 'easeIn' },
  },
};

/* Durée commune float / ombre pour garder la synchro */
const FLOAT_DUREE = 3.2;

/* Le tilt pointeur n'a de sens qu'avec un pointeur précis (pas sur tactile) */
const POINTEUR_FIN =
  typeof window !== 'undefined' &&
  window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/* ========================================================================== *
 *  Carte de module 3D
 * ========================================================================== */
function CarteModule({ modu, index, onOuvrir }) {
  const reduce = useReducedMotion();
  const tiltActif = POINTEUR_FIN && !reduce;
  const floatActif = !reduce;

  // Décalage par carte pour désynchroniser les flottaisons (effet vivant)
  const floatDelay = (index % 4) * 0.45;

  /* --- Tilt : position du pointeur (0 → 1), assouplie par ressort --- */
  const curseurX = useMotionValue(0.5);
  const curseurY = useMotionValue(0.5);
  const ressort = { stiffness: 260, damping: 20, mass: 0.5 };
  const douxX = useSpring(curseurX, ressort);
  const douxY = useSpring(curseurY, ressort);

  // Carte ±9°, icône ±8° (parallaxe inverse pour la profondeur)
  const rotateY = useTransform(douxX, [0, 1], ['-9deg', '9deg']);
  const rotateX = useTransform(douxY, [0, 1], ['9deg', '-9deg']);
  const iconeRotateY = useTransform(douxX, [0, 1], ['8deg', '-8deg']);
  const iconeRotateX = useTransform(douxY, [0, 1], ['-8deg', '8deg']);

  /* --- Spotlight doré qui suit le pointeur --- */
  const glareX = useTransform(douxX, [0, 1], ['0%', '100%']);
  const glareY = useTransform(douxY, [0, 1], ['0%', '100%']);
  const glare = useMotionTemplate`radial-gradient(360px circle at ${glareX} ${glareY}, rgba(245, 158, 11, 0.18), transparent 62%)`;

  /* Gyroscope (mobile / PWA) : bascule le tilt sur l'inclinaison de l'appareil.
     Demande de permission sur iOS (uniquement si l'API existe), échec silencieux. */
  useEffect(() => {
    if (tiltActif) return;
    if (typeof window === 'undefined' || !window.matchMedia('(pointer: coarse)').matches) return;
    if (typeof DeviceOrientationEvent === 'undefined') return;

    const surInclinaison = (e) => {
      if (e.gamma == null || e.beta == null) return;
      curseurX.set(Math.max(0, Math.min(1, 0.5 + (e.gamma / 45) * 0.5)));
      curseurY.set(Math.max(0, Math.min(1, 0.5 + (e.beta / 45) * 0.5)));
    };

    let nettoyage = () => {};
    try {
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        const surPremiereInteraction = () => {
          DeviceOrientationEvent.requestPermission()
            .then((etat) => {
              if (etat === 'granted') window.addEventListener('deviceorientation', surInclinaison);
            })
            .catch(() => {});
        };
        window.addEventListener('pointerdown', surPremiereInteraction, { once: true });
        nettoyage = () => window.removeEventListener('pointerdown', surPremiereInteraction);
      } else {
        window.addEventListener('deviceorientation', surInclinaison);
        nettoyage = () => window.removeEventListener('deviceorientation', surInclinaison);
      }
    } catch {
      /* Gyroscope indisponible — le tilt pointeur reste actif sur tactile */
    }
    return nettoyage;
  }, [tiltActif, curseurX, curseurY]);

  const gererDeplacement = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    curseurX.set((e.clientX - rect.left) / rect.width);
    curseurY.set((e.clientY - rect.top) / rect.height);
  };

  const gererSortie = () => {
    curseurX.set(0.5);
    curseurY.set(0.5);
  };

  const Icon = modu.icon;

  /* Variantes de la carte : entrée/sortie + état "hover" (label diffusé aux
     enfants Framer pour l'animation de l'icône — propagation par variants). */
  const variantes = {
    ...carteVariants,
    hover: tiltActif
      ? {
          scale: 1.03,
          y: -6,
          boxShadow: `0 26px 52px -14px ${modu.glow}, 0 12px 24px -10px rgba(0, 0, 0, 0.22)`,
          transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] },
        }
      : undefined,
  };

  return (
    <motion.button
      type="button"
      layout
      variants={variantes}
      whileHover={tiltActif ? 'hover' : undefined}
      whileTap={{ scale: 0.96, transition: { duration: 0.1 } }}
      onMouseMove={tiltActif ? gererDeplacement : undefined}
      onMouseLeave={gererSortie}
      onClick={() => onOuvrir(modu)}
      aria-label={`Accéder au module ${modu.title}`}
      className="group relative flex h-full touch-manipulation flex-col overflow-hidden rounded-3xl border border-amber-500/20 bg-white p-6 text-start shadow-xl shadow-black/20 transition-colors duration-300 hover:border-amber-500/60 focus-visible:outline-none sm:p-7"
      style={{ perspective: '1200px' }}
    >
      {/* Lavage doré dégradé apparaissant au survol */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-amber-50 via-transparent to-orange-50/60 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
      />

      {/* Spotlight doré dynamique suivant le pointeur */}
      {tiltActif && (
        <motion.div
          aria-hidden="true"
          style={{ background: glare }}
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        />
      )}

      {/* Liseré supérieur or brossé */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-amber-400 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
      />

      {/* ==================== Couche de tilt 3D de la carte ==================== */}
      <motion.div
        style={{ rotateX, rotateY, transformStyle: 'preserve-3d', willChange: 'transform' }}
        className="relative flex h-full flex-col items-center text-center"
      >
        {/* ==================== Socle icône 3D (calque Z + parallaxe) ==================== */}
      <motion.div
        style={{ z: 44, rotateX: iconeRotateX, rotateY: iconeRotateY }}
        className="relative mb-7 pb-4"
      >
        {/* Halo diffus derrière le socle */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -inset-4 rounded-[2rem] bg-amber-400/25 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
        />

        {/* Secousse spring au survol de la carte */}
        <motion.div
          variants={{ hover: { scale: 1.12, rotate: 4, transition: { type: 'spring', stiffness: 300, damping: 12 } } }}
          className="relative"
          style={{ willChange: 'transform' }}
        >
          {/* Flottaison continue en boucle infinie */}
          <motion.div
            animate={floatActif ? { y: [0, -8, 0] } : undefined}
            transition={{ duration: FLOAT_DUREE, repeat: Infinity, ease: 'easeInOut', delay: floatDelay }}
            style={{ willChange: 'transform' }}
            className="relative flex h-24 w-24 items-center justify-center rounded-3xl shadow-lg shadow-amber-600/40 sm:h-28 sm:w-28"
          >
            {/* Dégradé doré du socle */}
            <span
              aria-hidden="true"
              className={`absolute inset-0 rounded-3xl bg-gradient-to-br ${modu.gradientAccent}`}
            />
            {/* Reflet métallique néo-brutalism */}
            <span
              aria-hidden="true"
              className="absolute inset-0 rounded-3xl bg-gradient-to-br from-white/45 via-white/0 to-black/15"
            />
            {/* Anneau de verre intérieur */}
            <span
              aria-hidden="true"
              className="absolute inset-1.5 rounded-2xl border border-white/30"
            />
            <Icon
              size={60}
              strokeWidth={2}
              className="relative drop-shadow-[0_2px_4px_rgba(0,0,0,0.28)] text-white sm:size-16"
            />
          </motion.div>

          {/* Ombre portée au sol synchronisée avec la flottaison (contre-phase) */}
          <motion.span
            aria-hidden="true"
            animate={floatActif ? { scaleX: [1, 0.76, 1], opacity: [0.5, 0.16, 0.5] } : undefined}
            transition={{ duration: FLOAT_DUREE, repeat: Infinity, ease: 'easeInOut', delay: floatDelay }}
            className="absolute -bottom-2 left-1/2 h-3 w-20 -translate-x-1/2 rounded-full bg-black/30 blur-md"
            style={{ willChange: 'transform, opacity' }}
          />
        </motion.div>
      </motion.div>

      {/* ==================== Texte ==================== */}
      <h3 className="relative mb-2 font-display text-lg font-bold leading-snug text-stone-900 sm:text-xl">
        {modu.title}
      </h3>
      <p className="relative mb-6 text-sm leading-relaxed text-stone-600">
        {modu.description}
      </p>

      {/* ==================== Pied de carte ==================== */}
      <div className="relative mt-auto flex w-full items-center justify-between gap-3 border-t border-amber-100 pt-5">
        {/* Indicateur "N rubriques disponibles" — pastille pulsante */}
        <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
          </span>
          {modu.rubriquesCount} Rubrique{modu.rubriquesCount > 1 ? 's' : ''} disponible{modu.rubriquesCount > 1 ? 's' : ''}
        </span>

        {/* Bouton "Accéder" — se remplit en doré + flèche qui glisse au survol */}
        <span className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50/80 px-4 py-2 text-sm font-bold text-amber-700 transition-all duration-300 group-hover:border-transparent group-hover:bg-gradient-to-r group-hover:from-amber-500 group-hover:to-amber-600 group-hover:text-white group-hover:shadow-lg group-hover:shadow-amber-500/40">
          Accéder
          <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
        </span>
      </div>
      </motion.div>
    </motion.button>
  );
}

/* ========================================================================== *
 *  Header PWA compact — logo Amicale BCT + profil utilisateur rapide
 * ========================================================================== */
function HeaderPwa({ user, onDeconnexion }) {
  const role = user?.role || 'employe';
  return (
    <header
      className="sticky top-0 z-40 border-b border-amber-500/15 bg-[#17130e]/85 backdrop-blur-xl"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div
        className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 sm:px-6"
        style={{ minHeight: '3.5rem' }}
      >
        {/* Logo */}
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold"
            style={{
              background: 'var(--gold-grad)',
              color: '#2E2013',
              border: '1px solid rgba(255, 236, 175, 0.55)',
              boxShadow: 'var(--shadow-gold)',
            }}
          >
            A
          </div>
          <div className="min-w-0">
            <p className="truncate font-display text-sm font-bold leading-tight text-white">
              Amicale BCT
            </p>
            <p className="truncate text-[11px] leading-tight text-amber-300/80">
              Service RH
            </p>
          </div>
        </div>

        {/* Profil + déconnexion */}
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-extrabold"
            style={{
              background: 'var(--gold-grad)',
              color: '#2E2013',
              border: '1px solid rgba(255, 236, 175, 0.55)',
            }}
          >
            {user?.login?.slice(0, 1)?.toUpperCase() || 'A'}
          </div>
          <div className="hidden text-end xs:block">
            <p className="text-sm font-semibold leading-tight text-white">{user?.login}</p>
            <p className="text-[11px] leading-tight text-amber-300/80">
              {ROLE_LABELS[role] || role}
            </p>
          </div>
          <button
            type="button"
            onClick={onDeconnexion}
            title="Se déconnecter"
            aria-label="Se déconnecter"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-amber-200/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </header>
  );
}

/* ========================================================================== *
 *  Page — Hub / Portail de modules (plein écran, standalone)
 * ========================================================================== */
export default function ModulesHub() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [recherche, setRecherche] = useState('');
  const role = user?.role || 'employe';

  // Cartes dérivées du menu latéral pour ce rôle (auto-hub des nouvelles catégories)
  const accessibles = useMemo(() => {
    let nav = NAV.filter((item) => itemVisible(item, role, user?.permissions || null));
    nav = nav.filter((item, i) => {
      if (!item.section) return true;
      const rest = nav.slice(i + 1);
      const prochaineSection = rest.findIndex((x) => x.section);
      const liens = prochaineSection === -1 ? rest : rest.slice(0, prochaineSection);
      return liens.some((x) => x.to);
    });
    return buildModules(nav).filter((m) => canAccess(role, m.route));
  }, [role, user?.permissions]);

  // Filtrage temps réel : titre, description, mots-clés
  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return accessibles;
    return accessibles.filter(
      (m) =>
        m.title.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q) ||
        m.tags.some((t) => t.includes(q)),
    );
  }, [recherche, accessibles]);

  const ouvrir = (modu) => navigate(modu.route);
  const deconnexion = () => { logout(); navigate('/login', { replace: true }); };

  return (
    <div
      className="relative min-h-screen overflow-x-hidden text-white"
      style={{
        background:
          'radial-gradient(1100px 560px at 82% -12%, rgba(245, 158, 11, 0.16), transparent 60%)' +
          ', radial-gradient(900px 480px at -12% 8%, rgba(217, 119, 6, 0.12), transparent 55%)' +
          ', linear-gradient(165deg, #1c1917 0%, #17130e 52%, #120e0b 100%)',
      }}
    >
      {/* ======================= Header PWA compact ======================= */}
      <HeaderPwa user={user} onDeconnexion={deconnexion} />

      <main className="mx-auto w-full max-w-7xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
        {/* ======================= Hero ======================= */}
        <motion.div
          initial={{ opacity: 0, y: -14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="mb-9 flex flex-col items-start gap-5 sm:mb-12 sm:flex-row sm:items-end sm:justify-between"
        >
          <div className="min-w-0">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-amber-500/25 bg-amber-500/10 px-3.5 py-1.5">
              <Sparkles size={14} className="text-amber-300" strokeWidth={2.4} />
              <span className="text-[11px] font-bold uppercase tracking-widest text-amber-300">
                Amicale du Personnel · Banque Centrale de Tunisie
              </span>
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-4xl">
              Sélectionnez votre espace de travail
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-amber-100/65 sm:text-base">
              Choisissez un module RH pour accéder à vos outils dédiés.
            </p>
          </div>

          {/* ======================= Recherche rapide ======================= */}
          <div className="relative w-full shrink-0 sm:w-72 lg:w-80">
            <Search
              size={18}
              className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-amber-300/60"
              strokeWidth={2.2}
            />
            <input
              type="search"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Rechercher un module…"
              aria-label="Rechercher un module"
              className="w-full touch-manipulation rounded-lg border border-amber-500/25 bg-white/5 py-3 text-base text-white placeholder:text-amber-100/40 transition-colors focus:border-amber-400 focus:outline-none pe-11 ps-11"
            />
            {recherche && (
              <button
                type="button"
                onClick={() => setRecherche('')}
                aria-label="Effacer la recherche"
                className="absolute end-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-amber-200/70 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X size={16} strokeWidth={2.4} />
              </button>
            )}
          </div>
        </motion.div>

        {/* ======================= Grille des modules ======================= */}
        {visibles.length > 0 ? (
          <motion.div
            variants={conteneurVariants}
            initial="hidden"
            animate="show"
            className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3 lg:gap-7"
          >
            <AnimatePresence mode="popLayout">
              {visibles.map((modu, i) => (
                <CarteModule key={modu.id} modu={modu} index={i} onOuvrir={ouvrir} />
              ))}
            </AnimatePresence>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-amber-500/30 bg-white/5 px-6 py-20 text-center"
          >
            <Search size={36} className="mb-4 text-amber-300/50" strokeWidth={1.8} />
            <h3 className="font-display text-lg font-bold text-white">
              Aucun module trouvé
            </h3>
            <p className="mt-1.5 text-sm text-amber-100/60">
              Aucun espace ne correspond à « {recherche} ». Essayez un autre terme.
            </p>
            <button
              type="button"
              onClick={() => setRecherche('')}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-amber-500/30 transition hover:brightness-110"
            >
              Réinitialiser la recherche
            </button>
          </motion.div>
        )}

        {/* Pied de page */}
        <p className="mt-12 text-center text-xs text-amber-100/45">
          {visibles.length} module{visibles.length > 1 ? 's' : ''} disponible{visibles.length > 1 ? 's' : ''} pour votre profil
          {' · '}astuce : utilisez la recherche pour filtrer
        </p>
      </main>
    </div>
  );
}
