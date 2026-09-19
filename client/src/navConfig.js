/**
 * navConfig.js — Source unique de vérité de la structure du menu latéral.
 * ----------------------------------------------------------------------------
 * Partagée entre Layout.jsx (menu) et ModulesHub.jsx (portail des modules) :
 * toute catégorie/section ajoutée ici apparaît automatiquement dans le menu ET
 * dans le hub de sélection des modules.
 *
 * Une « section » devient une catégorie principale (carte du hub).
 * Une « sous-section » (subSection) regroupe des rubriques sous un groupe.
 * Une entrée `to` est une rubrique cliquable.
 *
 * Les rôles : super_admin, consultation, moderateur, employe.
 * Champ `module` : utilisé pour les permissions fines des modérateurs
 * (`Permissions` de chaque module : lire / ajouter / modifier).
 */

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
  IconDownloadApp,
  IconMonitor,
  IconChat,
  IconSettings,
  IconClipboardList,
  IconBellAlert,
  IconBuildingOffice,
  IconBanknotes,
  IconCreditCard,
  IconAward,
  IconPrinter,
  IconCamera,
} from './components/icons';
import {
  Users,
  Briefcase,
  Banknote,
  Fingerprint,
  Stethoscope,
  ShieldCheck,
  Database,
  Clock,
  Camera,
  Monitor,
} from 'lucide-react';

export const NAV = [
  { to: '/', label: 'TABLEAU DE BORD', icon: IconDashboard, end: true, roles: ['super_admin', 'consultation', 'moderateur'] },
  { section: 'RENSEIGNEMENTS RH', roles: ['super_admin', 'moderateur'] },
  { to: '/employes', label: 'EMPLOYÉS', icon: IconUsers, end: false, roles: ['super_admin', 'moderateur'], module: 'employes' },
  { to: '/categories', label: 'CATÉGORIES', icon: IconTags, end: true, roles: ['super_admin', 'moderateur'], module: 'categories' },
  { subSection: 'FICHE SIGNALÉTIQUE', roles: ['super_admin', 'moderateur'] },
  { to: '/fiche-signaletique/creation', label: 'CRÉATION ET MAJ EMPLOYÉ', icon: IconUsers, end: true, roles: ['super_admin', 'moderateur'], module: 'employes' },
  { to: '/fiche-signaletique/profil', label: 'CONSULT. PROFIL EMPLOYÉ', icon: IconClipboardList, end: true, roles: ['super_admin', 'moderateur'], module: 'employes' },
  { to: '/fiche-signaletique/indemnites', label: 'CONSULT. DÉTAILLÉE INDEMNITÉS', icon: IconTrendUp, end: true, roles: ['super_admin', 'moderateur'], module: 'employes' },
  { section: 'GESTION DES CONGÉS', roles: ['super_admin', 'moderateur'] },
  { to: '/solde-initial', label: 'NOUVEAU SOLDE INITIAL', icon: IconCalendarPlus, end: true, roles: ['super_admin', 'moderateur'], module: 'soldes' },
  { subSection: 'DEMANDES DE CONGÉ', roles: ['super_admin', 'moderateur'] },
  { to: '/demandes/nouvelle', label: 'NOUVELLE DEMANDE', icon: IconFileText, end: true, roles: ['super_admin', 'moderateur'], module: 'demandes' },
  { to: '/demandes/instance', label: 'DEMANDES EN INSTANCE', icon: IconClipboardCheck, end: true, roles: ['super_admin', 'moderateur'], module: 'demandes' },
  { subSectionFin: true, roles: ['super_admin', 'moderateur'] },
  { to: '/prelevement', label: 'PRÉLÈVEMENT DE CONGÉ', icon: IconArrowDown, end: true, roles: ['super_admin', 'moderateur'], module: 'soldes' },
  { to: '/ajout-annuel', label: 'AJOUT DE SOLDE ANNUEL', icon: IconCalendarCheck, end: true, roles: ['super_admin', 'moderateur'], module: 'soldes' },
  { to: '/editer-solde', label: 'ÉDITER SOLDE DE CONGÉ', icon: IconEdit, end: true, roles: ['super_admin', 'moderateur'], module: 'soldes' },
  { subSection: 'JOURNAUX', roles: ['super_admin', 'moderateur'] },
  { to: '/edition-conges', label: 'JOURNAL DES CONGÉS', icon: IconPrinter, end: true, roles: ['super_admin', 'moderateur'], module: 'soldes' },
  { to: '/journal', label: 'JOURNAL DES MOUVEMENTS', icon: IconJournal, end: true, roles: ['super_admin', 'moderateur'], module: 'soldes' },
  { section: 'PAIE MENSUELLE', roles: ['super_admin', 'consultation', 'moderateur'] },
  { to: '/calcul-paie', label: 'CALCUL DE PAIE', icon: IconClipboardList, end: true, roles: ['super_admin', 'consultation', 'moderateur'], module: 'paie' },
  { to: '/indemnites-fv', label: 'INDEMNITÉS FV', icon: IconBanknotes, end: true, roles: ['super_admin', 'consultation', 'moderateur'], module: 'paie' },
  { to: '/simulateur-impot', label: 'SIMULATEUR IMPÔT', icon: IconTrendUp, end: true, roles: ['super_admin', 'consultation', 'moderateur'], module: 'paie' },
  { to: '/parametres-codification', label: 'PARAMÈTRES & CODIFICATION', icon: IconSettings, end: true, roles: ['super_admin'] },
  { to: '/grille-salaire', label: 'GRILLE DE SALAIRE', icon: IconClipboardList, end: true, roles: ['super_admin'] },
  { section: 'HORAIRES', roles: ['super_admin', 'consultation', 'moderateur'] },
  { to: '/horaires', label: 'HORAIRES DE TRAVAIL', icon: IconClock, end: true, roles: ['super_admin', 'consultation', 'moderateur'] },
  { to: '/presence', label: 'POINTAGES & PRÉSENCES', icon: IconUserClock, end: true, roles: ['super_admin', 'consultation', 'moderateur'] },
  { to: '/notification-absences', label: "NOTIFICATION D'ABSENCES", icon: IconBellAlert, end: true, roles: ['super_admin', 'consultation', 'moderateur'] },
  { subSection: 'JOURNAUX', roles: ['super_admin', 'consultation', 'moderateur'] },
  { to: '/stats-journal', label: 'JOURNAL DE PRÉSENCE', icon: IconTrendUp, end: true, roles: ['super_admin', 'consultation', 'moderateur'] },
  { to: '/journal-rma', label: 'JOURNAL RMA', icon: IconClipboardList, end: true, roles: ['super_admin', 'consultation', 'moderateur'] },
  { section: 'POINTAGE BIOMÉTRIQUE', roles: ['super_admin', 'consultation', 'moderateur'] },
  { to: '/borne', label: 'BORNE DE POINTAGE (XMATOR-EYE)', icon: IconCamera, end: true, roles: ['super_admin'] },
  { to: '/pointage-biometrique', label: 'POINTAGE BIOMÉTRIQUE', icon: IconCamera, end: true, roles: ['super_admin', 'consultation', 'moderateur'], module: 'presence' },
  { section: 'MALADIE', roles: ['super_admin', 'moderateur'] },
  { to: '/maladie/nouvel-arret', label: 'NOUVEL ARRÊT MALADIE', icon: IconStethoscope, end: true, roles: ['super_admin', 'moderateur'], module: 'maladie' },
  { to: '/maladie/instance', label: 'ARRÊTS EN INSTANCE', icon: IconClipboardCheck, end: true, roles: ['super_admin', 'moderateur'], module: 'maladie' },
  { to: '/maladie/ajout-solde', label: 'AJOUT SOLDE MALADIE ANNUEL', icon: IconCalendarCheck, end: true, roles: ['super_admin', 'moderateur'], module: 'maladie' },
  { subSection: 'JOURNAUX', roles: ['super_admin', 'moderateur'] },
  { to: '/maladie/journal', label: 'JOURNAL DES ARRÊTS MALADIE', icon: IconJournal, end: true, roles: ['super_admin', 'moderateur'], module: 'maladie' },
  { section: 'CRÉDITS & AVANCES', roles: ['super_admin', 'moderateur'] },
  { to: '/credits-avances', label: 'GESTION DES CRÉDITS & AVANCES', icon: IconCreditCard, end: true, roles: ['super_admin', 'moderateur'], module: 'credits' },
  { section: 'ADMINISTRATION', roles: ['super_admin'] },
  { to: '/calendrier', label: "CALENDRIER DE L'ANNÉE", icon: IconCalendarDays, end: true, roles: ['super_admin'] },
  { to: '/comptes', label: 'GESTION DES COMPTES', icon: IconUserCog, end: true, roles: ['super_admin'] },
  { to: '/maintenance', label: 'SAUVEGARDE & DONNÉES', icon: IconShieldCheck, end: true, roles: ['super_admin'] },
  { subSection: 'JOURNAUX', roles: ['super_admin'] },
  { to: '/mouchard', label: 'MOUCHARD (ACTIVITÉ)', icon: IconActivity, end: true, roles: ['super_admin'] },
  { section: 'APPLICATION WEB', roles: ['super_admin'] },
  { to: '/application/telecharger', label: "TÉLÉCHARGER L'APPLICATION", icon: IconDownloadApp, end: true, roles: ['super_admin'] },
  { to: '/application/appareils', label: 'APPAREILS CONNECTÉS', icon: IconMonitor, end: true, roles: ['super_admin'] },
  { to: '/application/chat', label: 'CHAT EN DIRECT', icon: IconChat, end: true, roles: ['super_admin'] },
  { section: 'RÉFÉRENTIEL', roles: ['super_admin'] },
  { to: '/referentiel/parametres-generaux', label: 'PARAMÈTRES GÉNÉRAUX', icon: IconSettings, end: true, roles: ['super_admin'] },
  { to: '/referentiel/parametres-administratifs', label: 'PARAMÈTRES ADMINISTRATIFS', icon: IconBuildingOffice, end: true, roles: ['super_admin'] },
  { to: '/referentiel/parametre-salaire', label: 'PARAMÈTRE DE SALAIRE', icon: IconBanknotes, end: true, roles: ['super_admin'] },
  { to: '/referentiel/parametres-conge-maladie', label: 'PARAMÈTRES DE CONGÉ & MALADIE', icon: IconCalendarCheck, end: true, roles: ['super_admin'] },
  { to: '/referentiel/parametres-pointage', label: 'PARAMÈTRES DE POINTAGE', icon: IconUserClock, end: true, roles: ['super_admin'] },
  { to: '/parametres-presence', label: 'PARAMÈTRES DE PRÉSENCE', icon: IconSettings, end: true, roles: ['super_admin'], module: 'presence' },
  { to: '/parametres-indemnites', label: 'PARAMÈTRES INDEMNITÉS', icon: IconBanknotes, end: true, roles: ['super_admin'], module: 'paie' },
  { to: '/referentiel/promotion-notation', label: 'PROMOTION & NOTATION', icon: IconAward, end: true, roles: ['super_admin'] },
  { to: '/referentiel/saas-tableau-de-bord', label: 'SAAS & TABLEAU DE BORD', icon: IconDashboard, end: true, roles: ['super_admin'] },
];

/* Icônes des catégories principales du menu (sidebar) */
export const GROUP_ICONS = {
  'TABLEAU DE BORD': IconDashboard,
  'RENSEIGNEMENTS RH': IconUsers,
  'GESTION DES CONGÉS': IconCalendarCheck,
  'PAIE MENSUELLE': IconClipboardList,
  'HORAIRES': IconClock,
  'POINTAGE BIOMÉTRIQUE': IconCamera,
  'MALADIE': IconStethoscope,
  'CRÉDITS & AVANCES': IconCreditCard,
  'ADMINISTRATION': IconUserCog,
  'APPLICATION WEB': IconMonitor,
  'RÉFÉRENTIEL': IconSettings,
};

/* ========================================================================== *
 *  Métadonnées des cartes du hub (ModulesHub) — un socle par catégorie.
 *  Ajoutez une entrée ici pour personnaliser une carte ; sinon `buildModules`
 *  génère automatiquement une carte générique pour toute nouvelle catégorie.
 * ========================================================================== */
export const MODULE_META = {
  'RENSEIGNEMENTS RH': {
    title: 'RENSEIGNEMENTS RH',
    description: "Annuaire des employés, catégories professionnelles et fiches signalétiques.",
    icon: Users,
    route: '/employes',
    gradientAccent: 'from-amber-400 to-amber-600',
    glow: 'rgba(245, 158, 11, 0.38)',
    tags: ['employés', 'annuaire', 'catégories', 'fiche', 'profil'],
  },
  'GESTION DES CONGÉS': {
    title: 'GESTION DES CONGÉS',
    description: 'Soldes, prélèvements, ajouts annuels, demandes et journal des mouvements.',
    icon: Briefcase,
    route: '/editer-solde',
    gradientAccent: 'from-amber-500 to-orange-500',
    glow: 'rgba(249, 115, 22, 0.34)',
    tags: ['solde', 'prélèvement', 'ajout', 'journal', 'mouvement', 'demande', 'instance'],
  },
  'PAIE MENSUELLE': {
    title: 'PAIE MENSUELLE',
    description: 'Grille salariale, indemnités, impôt et paramètres de codification.',
    icon: Banknote,
    route: '/calcul-paie',
    gradientAccent: 'from-amber-400 to-yellow-600',
    glow: 'rgba(234, 179, 8, 0.36)',
    tags: ['paie', 'grille', 'salaire', 'indemnité', 'impôt', 'codification'],
  },
  'HORAIRES': {
    title: 'HORAIRES & PRÉSENCES',
    description: "Horaires de travail, pointages, présences et journaux (présence, RMA).",
    icon: Clock,
    route: '/horaires',
    gradientAccent: 'from-orange-400 to-amber-600',
    glow: 'rgba(251, 146, 60, 0.34)',
    tags: ['horaire', 'présence', 'pointage', 'journal', 'rma'],
  },
  'POINTAGE BIOMÉTRIQUE': {
    title: 'POINTAGE BIOMÉTRIQUE',
    description: "Borne de pointage XMATOR-EYE et pointage biométrique.",
    icon: Camera,
    route: '/pointage-biometrique',
    gradientAccent: 'from-cyan-500 to-amber-600',
    glow: 'rgba(34, 211, 238, 0.34)',
    tags: ['borne', 'biométrique', 'pointage', 'xmatoreye', 'caméra'],
  },
  'MALADIE': {
    title: 'GESTION DES MALADIES',
    description: 'Arrêts maladie : validation, soldes maladie et journal des arrêts.',
    icon: Stethoscope,
    route: '/maladie/instance',
    gradientAccent: 'from-amber-500 to-amber-700',
    glow: 'rgba(217, 119, 6, 0.38)',
    tags: ['maladie', 'arrêt', 'soin', 'solde', 'journal'],
  },
  'CRÉDITS & AVANCES': {
    title: 'CRÉDITS & AVANCES EMPLOI',
    description: 'Référentiel des types de crédits, octroi d\'avances et suivi du capital restant dû (CRD).',
    icon: IconCreditCard,
    route: '/credits-avances',
    gradientAccent: 'from-emerald-500 to-teal-600',
    glow: 'rgba(16, 185, 129, 0.34)',
    tags: ['crédit', 'avance', 'prêt', 'échéance', 'mensualité', 'crd'],
  },
  'ADMINISTRATION': {
    title: 'ADMINISTRATION & PARAMÈTRES',
    description: "Comptes utilisateurs, mouchard, calendrier, codification et sauvegardes.",
    icon: ShieldCheck,
    route: '/comptes',
    gradientAccent: 'from-yellow-500 to-amber-600',
    glow: 'rgba(202, 138, 4, 0.36)',
    tags: ['administration', 'compte', 'sécurité', 'calendrier', 'sauvegarde'],
  },
  'APPLICATION WEB': {
    title: 'APPLICATION WEB',
    description: "Téléchargement de l'application, appareils connectés et chat en direct.",
    icon: Monitor,
    route: '/application/telecharger',
    gradientAccent: 'from-sky-500 to-amber-600',
    glow: 'rgba(14, 165, 233, 0.34)',
    tags: ['application', 'appareil', 'télécharger', 'chat', 'pwa'],
  },
  'RÉFÉRENTIEL': {
    title: 'RÉFÉRENTIEL',
    description: "Paramètres globaux et référentiels métier du SaaS.",
    icon: Database,
    route: '/referentiel/parametres-generaux',
    gradientAccent: 'from-amber-400 to-orange-600',
    glow: 'rgba(249, 115, 22, 0.34)',
    tags: ['référentiel', 'paramètre', 'codification', 'salaire', 'présence'],
  },
};

/* Socle par défaut pour une nouvelle catégorie sans métadonnées (auto-hub) */
const MODULE_DEFAUT = {
  description: 'Espace de travail dédié : outils et rubriques associés.',
  icon: Fingerprint,
  route: (group) => group.items[0]?.to || '/',
  gradientAccent: 'from-amber-500 to-orange-600',
  glow: 'rgba(245, 158, 11, 0.35)',
  tags: [],
};

/** Compte l'ensemble des rubriques cliquables d'un groupe (items + sous-groupes) */
function compteRubriques(g) {
  let n = g.items ? g.items.length : 0;
  if (g.subGroups) for (const s of g.subGroups) n += s.items ? s.items.length : 0;
  return n;
}

/**
 * Construit automatiquement les cartes du hub à partir des sections du NAV
 * filtrées pour le rôle courant. Toute nouvelle catégorie principale ajoutée
 * au NAV apparaît donc automatiquement dans le hub.
 */
export function buildModules(nav) {
  const groups = buildGroups(nav);
  return groups
    .filter((g) => g.id !== 'TABLEAU DE BORD' && g.items.length > 0)
    .map((g) => {
      const meta = MODULE_META[g.id] || {};
      const rubriquesCount = compteRubriques(g);
      const route = typeof (meta.route || MODULE_DEFAUT.route) === 'function'
        ? meta.route(g)
        : (meta.route || MODULE_DEFAUT.route(g));
      return {
        id: g.id.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        title: meta.title || g.label || g.id,
        description: meta.description || MODULE_DEFAUT.description,
        rubriquesCount,
        icon: meta.icon || MODULE_DEFAUT.icon,
        route,
        gradientAccent: meta.gradientAccent || MODULE_DEFAUT.gradientAccent,
        glow: meta.glow || MODULE_DEFAUT.glow,
        tags: meta.tags || MODULE_DEFAUT.tags,
      };
    })
    .filter((m) => m.route);
}

/* Libellés des rôles (affichage profil) */
export const ROLE_LABELS = {
  super_admin: 'Super Admin',
  consultation: 'Consultation',
  moderateur: 'Modérateur',
  employe: 'Employé',
};

/* Un item est-il visible pour ce rôle (avec permissions fines modérateur) ? */
export function itemVisible(item, role, perms) {
  if (!item.roles.includes(role)) return false;
  if (role === 'moderateur' && item.module) {
    const p = perms && perms[item.module];
    return !!(p && (p.lire || p.ajouter || p.modifier));
  }
  return true;
}

/**
 * Construit la hiérarchie des catégories depuis la NAV filtrée.
 * Retourne : [{ id, label, icon, items, subGroups, children: [{kind:'item'|'sub', ...}] }]
 * `children` préserve l'ordre exact du NAV (rubriques et sous-sections entremêlées),
 * ce qui permet de positionner une sous-section à n'importe quel endroit.
 * La borne `{ subSectionFin: true }` referme la sous-section courante : les items
 * suivants redeviennent des rubriques directes de la catégorie.
 */
export function buildGroups(filteredNav) {
  const groups = [];
  let current = null;
  let sub = null;
  const nouveauGroupe = (id, icon) => ({ id, label: id, icon: icon || IconTags, items: [], subGroups: [], children: [] });
  for (const item of filteredNav) {
    if (item.section) {
      current = nouveauGroupe(item.section, GROUP_ICONS[item.section]);
      sub = null;
      groups.push(current);
    } else if (item.subSection) {
      sub = { id: item.subSection, label: item.subSection, items: [] };
      if (current) {
        current.subGroups.push(sub);
        current.children.push({ kind: 'sub', sub });
      } else {
        current = nouveauGroupe(item.subSection);
        groups.push(current);
        sub = null;
      }
    } else if (item.subSectionFin) {
      sub = null;
    } else if (item.to) {
      if (!current) {
        let dash = groups.find((g) => g.id === 'TABLEAU DE BORD');
        if (!dash) { dash = nouveauGroupe('TABLEAU DE BORD', IconDashboard); groups.unshift(dash); }
        dash.items.push(item);
        dash.children.push({ kind: 'item', item });
      } else if (sub) {
        sub.items.push(item);
      } else {
        current.items.push(item);
        current.children.push({ kind: 'item', item });
      }
    }
  }
  const dashEntry = filteredNav.find((x) => x.to === '/');
  if (dashEntry && !groups.find((g) => g.id === 'TABLEAU DE BORD')) {
    const dash = nouveauGroupe('TABLEAU DE BORD', IconDashboard);
    dash.items.push(dashEntry);
    dash.children.push({ kind: 'item', item: dashEntry });
    groups.unshift(dash);
  }
  return groups.filter((g) => g.id === 'TABLEAU DE BORD' || g.items.length > 0 || g.subGroups.some((s) => s.items.length > 0));
}