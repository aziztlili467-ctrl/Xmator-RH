// Base de l'API et origine des médias statiques (photos) :
// - VITE_API_URL défini au build → l'API distante (ex. https://xmator-rh-backend.onrender.com)
// - sinon : build de production sur un vrai domaine → backend Render (cross-origin, CORS_ORIGIN à configurer)
// - sinon (localhost / 127.0.0.1, dev comme prod) → '/api' relatif : le serveur Express local sert le client ET l'API
const MEDIA_ORIGIN = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/+$/, '')
  : (import.meta.env.PROD && typeof window !== 'undefined' && !['localhost', '127.0.0.1'].includes(window.location.hostname)
      ? 'https://xmator-rh-backend.onrender.com'
      : '');

const BASE = MEDIA_ORIGIN ? `${MEDIA_ORIGIN}/api` : '/api';

// Construit l'URL complète d'un média (photo employé) : les chemins relatifs servis par
// l'API (« /photos/35.webp ») sont préfixés par l'origine des médias ; les URL déjà
// absolues (http/https/data:) sont renvoyées telles quelles.
export function mediaSrc(path) {
  if (!path) return '';
  return /^(https?:\/\/|data:)/i.test(path) ? path : `${MEDIA_ORIGIN}${path.startsWith('/') ? '' : '/'}${path}`;
}

// Session durable : le JWT d'accès vit UNIQUEMENT en mémoire (inaccessible à un éventuel
// XSS), la session de longue durée est un refresh token opaque en cookie HttpOnly avec
// rotation à chaque usage. Rien de sensible n'est persisté dans localStorage.
let _token = null;
let _sessionId = null;

export function getToken() {
  return _token;
}

export function setToken(token) {
  _token = token || null;
}

export function getSessionId() {
  return _sessionId;
}

export function setSessionId(id) {
  _sessionId = id !== undefined && id !== null && id !== '' ? String(id) : null;
}

// Identifiant unique de l'appareil (équivalent web de l'adresse MAC) :
// UUID généré une seule fois par navigateur/application installée, envoyé à chaque login.
const APPAREIL_KEY = 'amicale_appareil_id';
export function getAppareilId() {
  let id = localStorage.getItem(APPAREIL_KEY);
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(APPAREIL_KEY, id);
  }
  return id;
}

// Renouvelle le jeton d'accès depuis le cookie HttpOnly (rotation à chaque usage).
// Un seul refresh en vol, partagé par toutes les requêtes concurrentes (double effet
// React StrictMode, AuthContext + socket au démarrage, deux onglets…). Sans cette
// déduplication, deux appels simultanés consomment le même cookie et la rotation
// serveur révoque celui du perdant → 401 intempestif.
// Tolérance à la rotation concurrente : si le premier essai échoue en 401 (token juste
// roté par un appel concurrent), on laisse le Set-Cookie du gagnant arriver dans le
// navigateur puis on relit le cookie (le navigateur détient le plus récent) et on
// n'émet qu'UN seul nouvel essai.
let _refreshing = null;
let _refreshUser = null;
async function tryRefresh() {
  if (_refreshing) return _refreshing;
  _refreshing = (async () => {
    for (let essai = 0; essai < 2; essai += 1) {
      try {
        const res = await fetch(BASE + '/auth/refresh', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!res.ok) {
          if (essai === 0 && res.status === 401) {
            await new Promise((r) => setTimeout(r, 250));
            continue;
          }
          return false;
        }
        const data = await res.json().catch(() => ({}));
        if (!data || !data.token) return false;
        _refreshUser = data.user || null;
        setToken(data.token);
        setSessionId(data.session_id);
        return true;
      } catch {
        if (essai === 0) {
          await new Promise((r) => setTimeout(r, 250));
          continue;
        }
        return false;
      }
    }
    return false;
  })();
  try {
    return await _refreshing;
} finally {
    _refreshing = null;
  }
}

// Redirige vers l'écran de connexion (la borne Xmator Terminal vit sous /terminal/).
function versConnexion() {
  if (typeof window === 'undefined') return;
  const loginTarget = window.location.pathname.startsWith('/terminal')
    ? '/terminal/login'
    : '/login';
  if (window.location.pathname !== loginTarget) {
    window.location.href = loginTarget;
  }
}

async function request(path, options = {}) {
  // « _retriedAuth » est une option interne : autorise UN SEUL renouvellement de jeton
  // par requête (évite les boucles si la session est réellement révoquée).
  const { _retriedAuth, ...netOptions } = options;
  const method = (netOptions.method || 'GET').toUpperCase();
  // Course au démarrage : au lancement du serveur, l'API peut ne pas encore répondre
  // (le proxy Vite renvoie alors un 5xx / une erreur réseau). Les requêtes sans effet
  // de bord (GET/HEAD) tentent 3 fois avec un léger espacement — suffisant pour laisser
  // l'API finir de démarrer sans afficher d'erreur au premier affichage du tableau de bord.
  const essais = method === 'GET' || method === 'HEAD' ? 3 : 1;
  let dernierSouci;
  for (let i = 1; i <= essais; i += 1) {
    if (i > 1) await new Promise((r) => setTimeout(r, 500 * i));
    try {
      const res = await fetch(BASE + path, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
          ...(netOptions.headers || {}),
        },
        ...netOptions,
      });
      if (res.status >= 500 && i < essais) {
        dernierSouci = new Error(`Erreur serveur (${res.status})`);
        continue;
      }
      const data = await res.json().catch(() => ({}));
      // 401 : jeton d'accès expiré → renouvellement une fois via le cookie HttpOnly
      if (res.status === 401 && !path.startsWith('/auth/') && !_retriedAuth) {
        const refreshed = await tryRefresh();
        if (refreshed) return request(path, { ...options, _retriedAuth: true });
        setToken(null);
        setSessionId(null);
        versConnexion();
        const err = new Error(data.error || 'Session expirée, veuillez vous reconnecter.');
        err.status = 401;
        throw err;
      }
      if (!res.ok) {
        const err = new Error(data.error || 'Une erreur est survenue.');
        err.status = res.status;
        throw err;
      }
      return data;
    } catch (err) {
      // Réessaye uniquement les pannes transitoires (erreur réseau sans status HTTP,
      // ou 5xx) ; jamais les 4xx (erreurs métier : 400, 401, 404…).
      if (i < essais && (err.status === undefined || err.status >= 500)) {
        dernierSouci = err;
        continue;
      }
      throw err;
    }
  }
  throw dernierSouci;
}

const buildQuery = (params = {}) => {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return qs ? `?${qs}` : '';
};

// Requête authentifiée brute pour les fichiers binaires (PDF, XLS, CSV, ZIP, photos…).
// Les impressions / exports n'utilisent pas `request()` : sans ce helper, un jeton d'accès
// expiré provoquait « Session expirée ou invalide. » (401) car le cookie HttpOnly n'était
// jamais utilisé pour renouveler le jeton. Ici, comme dans `request()`, un 401 déclenche
// UN renouvellement via `/auth/refresh` puis un nouvel essai. À utiliser pour tout nouvel
// export/impression afin que les journaux futurs fonctionnent sans configuration supplémentaire.
async function fetchAuth(path, options = {}) {
  const { _retriedAuth, headers, ...netOptions } = options;
  const res = await fetch(BASE + path, {
    credentials: 'include',
    ...netOptions,
    headers: {
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      ...(headers || {}),
    },
  });
  if (res.status === 401 && !path.startsWith('/auth/') && !_retriedAuth) {
    const refreshed = await tryRefresh();
    if (refreshed) return fetchAuth(path, { ...options, _retriedAuth: true });
    setToken(null);
    setSessionId(null);
    versConnexion();
  }
  return res;
}

// Récupère un PDF protégé (token Bearer) et l'ouvre dans un nouvel onglet
async function openPdf(path, options = {}) {
  const res = await fetchAuth(path, options);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const err = new Error(data.error || 'Génération du PDF impossible.');
    err.status = res.status;
    throw err;
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// Récupère un fichier protégé (token Bearer) et le télécharge avec un nom donné
async function downloadFichier(path, nom) {
  const res = await fetchAuth(path);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const err = new Error(data.error || 'Téléchargement impossible.');
    err.status = res.status;
    throw err;
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Récupère un PDF protégé (token Bearer) et ouvre directement la boîte d'impression du navigateur
async function printPdf(path) {
  const res = await fetchAuth(path);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const err = new Error(data.error || 'Génération du PDF impossible.');
    err.status = res.status;
    throw err;
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '1px';
  iframe.style.height = '1px';
  iframe.style.opacity = '0';
  iframe.style.border = '0';
  iframe.src = url;
  iframe.onload = () => {
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } catch (e) {
      window.open(url, '_blank');
    }
    setTimeout(() => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      URL.revokeObjectURL(url);
    }, 60000);
  };
  document.body.appendChild(iframe);
}

export const api = {
  auth: {
    login: async (login, password, device_id) => {
      const r = await request('/auth/login', { method: 'POST', body: JSON.stringify({ login, password, device_id }) });
      setToken(r.token);
      setSessionId(r.session_id);
      return r;
    },
    logout: async () => {
      try {
        await request('/auth/logout', { method: 'POST' });
      } catch { /* session déjà invalide : on nettoie quand même l'état local */ }
      setToken(null);
      setSessionId(null);
    },
    me: () => request('/auth/me'),
    refresh: async () => {
      // Dédié : passe par tryRefresh() (single-flight + retry après rotation concurrente)
      // pour ne jamais consommer le cookie deux fois en parallèle (StrictMode, socket…).
      const ok = await tryRefresh();
      if (!ok) {
        const err = new Error('Session expirée, veuillez vous reconnecter.');
        err.status = 401;
        throw err;
      }
      return { token: getToken(), session_id: getSessionId(), user: _refreshUser };
    },
  },

  comptes: (params = {}) => request('/comptes' + buildQuery(params)),
  createCompte: (body) => request('/comptes', { method: 'POST', body: JSON.stringify(body) }),
  updateCompte: (id, body) => request(`/comptes/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteCompte: (id) => request(`/comptes/${id}`, { method: 'DELETE' }),
  genererIdentifiants: (body) => request('/comptes/generer-identifiants', { method: 'POST', body: JSON.stringify(body) }),

  mouchard: () => request('/mouchard'),
  viderMouchard: () => request('/mouchard', { method: 'DELETE' }),
  mouchardSupprimer: (params = {}) => request('/mouchard' + buildQuery(params), { method: 'DELETE' }),
  mouchardRestaurer: (evenements) => request('/mouchard/restaurer', { method: 'POST', body: JSON.stringify({ evenements }) }),
  mouchardPdf: (params = {}) => openPdf('/mouchard/pdf' + buildQuery(params)),
  mouchardPrint: (params = {}) => printPdf('/mouchard/pdf' + buildQuery(params)),
  mouchardExport: async (params = {}) => {
    const res = await fetchAuth('/mouchard/export' + buildQuery(params));
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const err = new Error(data.error || 'Export impossible.');
      err.status = res.status;
      throw err;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mouchard-evenements_${params.debut || 'tout'}_${params.fin || 'tout'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  employeFiche: (matricule) => request(`/employes/${matricule}/fiche`),
  employeMouvements: (matricule, params = {}) => request(`/employes/${matricule}/mouvements` + buildQuery(params)),
  employeStats: (matricule, params = {}) => request(`/employes/${matricule}/stats` + buildQuery(params)),
  employeHeures: (matricule, params = {}) => request(`/employes/${matricule}/heures` + buildQuery(params)),
  uploadPhoto: async (matricule, file) => {
    const fd = new FormData();
    fd.append('photo', file);
    const res = await fetchAuth(`/employes/${matricule}/photo`, { method: 'POST', body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || 'Upload impossible.');
      err.status = res.status;
      throw err;
    }
    return data;
  },

  categories: () => request('/categories'),
  createCategorie: (libelle, repos_hebdomadaire = '0,6') => request('/categories', { method: 'POST', body: JSON.stringify({ libelle, repos_hebdomadaire }) }),
  updateCategorie: (id, libelle, repos_hebdomadaire) => request(`/categories/${id}`, { method: 'PUT', body: JSON.stringify({ libelle, repos_hebdomadaire }) }),
  deleteCategorie: (id) => request(`/categories/${id}`, { method: 'DELETE' }),

  employes: (params = {}) => request('/employes' + buildQuery(params)),
  employe: (id) => request(`/employes/${id}`),
  createEmploye: (body) => request('/employes', { method: 'POST', body: JSON.stringify(body) }),
  updateEmploye: (id, body) => request(`/employes/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteEmploye: (id) => request(`/employes/${id}`, { method: 'DELETE' }),
  faceEmploye: (id) => request(`/employes/${id}/face-descriptor`),
  sauvegarderFace: (id, descriptor, repertoire = 'a') => request(`/employes/${id}/face-descriptor`, { method: 'PUT', body: JSON.stringify({ descriptor, repertoire }) }),
  supprimerFace: (id) => request(`/employes/${id}/face-descriptor`, { method: 'DELETE' }),
  descripteursFace: () => request('/employes/descriptors'),

  mouvements: (params = {}) => request('/mouvements' + buildQuery(params)),
  mouvementsPdf: (params = {}) => openPdf('/mouvements/pdf' + buildQuery(params)),
  mouvementsPrint: (params = {}) => printPdf('/mouvements/pdf' + buildQuery(params)),
  createMouvement: (body) => request('/mouvements', { method: 'POST', body: JSON.stringify(body) }),
  compteJoursPrelevement: (params = {}) => request('/mouvements/compte-jours' + buildQuery(params)),
  correctionSolde: (body) => request('/mouvements/correction-solde', { method: 'POST', body: JSON.stringify(body) }),
  ajoutAnnuelMasse: (body) => request('/mouvements/ajout-annuel-masse', { method: 'POST', body: JSON.stringify(body) }),
  ajoutMaladieMasse: (body) => request('/mouvements/ajout-maladie-masse', { method: 'POST', body: JSON.stringify(body) }),
  createSolde: (body) => request('/mouvements/balances', { method: 'POST', body: JSON.stringify(body) }),
  createSoldeMasse: (body) => request('/mouvements/balances-masse', { method: 'POST', body: JSON.stringify(body) }),
  clearSoldes: (body) => request('/mouvements/clear-soldes', { method: 'POST', body: JSON.stringify(body) }),
  updateMouvement: (id, body) => request(`/mouvements/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteMouvement: (id) => request(`/mouvements/${id}`, { method: 'DELETE' }),
  journalSoldeConge: (id) => request(`/mouvements/journal-solde/${id}`),
  journalSoldePdf: (id, params = {}) => openPdf(`/mouvements/journal-solde/${id}/pdf` + buildQuery(params)),
  journalSoldePrint: (id, params = {}) => printPdf(`/mouvements/journal-solde/${id}/pdf` + buildQuery(params)),
  journalSoldeXls: (id) => downloadFichier(`/mouvements/journal-solde/${id}/xls`, `journal-solde-conge_${id}.xls`),

  arretsMaladie: (params = {}) => request('/arrets-maladie' + buildQuery(params)),
  arretMaladie: (id) => request(`/arrets-maladie/${id}`),
  createArretMaladie: (body) => request('/arrets-maladie', { method: 'POST', body: JSON.stringify(body) }),
  validerArretMaladie: (id) => request(`/arrets-maladie/${id}/valider`, { method: 'POST' }),
  rejeterArretMaladie: (id, motif) => request(`/arrets-maladie/${id}/rejeter`, { method: 'POST', body: JSON.stringify({ motif_rejet: motif }) }),
  supprimerArretMaladie: (id) => request(`/arrets-maladie/${id}`, { method: 'DELETE' }),

  editionConges: (params = {}) => request('/edition-conges' + buildQuery(params)),
  editionCongesPdf: (params = {}) => openPdf('/edition-conges/pdf' + buildQuery(params)),
  editionCongesPrint: (params = {}) => printPdf('/edition-conges/pdf' + buildQuery(params)),
  editionCongesXls: (params = {}) => downloadFichier('/edition-conges/xls' + buildQuery(params), `journal-conges_${params.fin || 'ref'}.xls`),

  journalMaladie: (params = {}) => request('/journal-maladie' + buildQuery(params)),
  journalMaladiePdf: (params = {}) => openPdf('/journal-maladie/pdf' + buildQuery(params)),
  journalMaladiePrint: (params = {}) => printPdf('/journal-maladie/pdf' + buildQuery(params)),
  statsJournal: (params = {}) => request('/stats-journal' + buildQuery(params)),

  codesPaie: () => request('/codes-paie'),
  createCodePaie: (body) => request('/codes-paie', { method: 'POST', body: JSON.stringify(body) }),
  updateCodePaie: (id, body) => request(`/codes-paie/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteCodePaie: (id) => request(`/codes-paie/${id}`, { method: 'DELETE' }),

  grilleSalaire: () => request('/grille-salaire'),
  grilleSalaireCreer: (body) => request('/grille-salaire', { method: 'POST', body: JSON.stringify(body) }),
  grilleSalaireModifier: (id, body) => request(`/grille-salaire/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  grilleSalaireSupprimer: (id) => request(`/grille-salaire/${id}`, { method: 'DELETE' }),
  grilleSalaireSupprimerRubrique: (rubrique) => request(`/grille-salaire/rubrique/${encodeURIComponent(rubrique)}`, { method: 'DELETE' }),
  grilleSalaireSupprimerTout: () => request('/grille-salaire/all', { method: 'DELETE' }),
  grilleSalaireExporter: async () => {
    const res = await fetchAuth('/grille-salaire/export');
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Export impossible.');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = res.headers.get('Content-Disposition')?.match(/filename="?([^";\n]+)"?/)?.[1] || 'grille_salaire.csv';
    a.click();
    URL.revokeObjectURL(url);
  },
  grilleSalaireImporter: async (fichier) => {
    const fd = new FormData();
    fd.append('fichier', fichier);
    const res = await fetchAuth('/grille-salaire/import', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur lors de l\'import.');
    return data;
  },

  // Indemnités F&V (Paie Mensuelle) — tableau des employés : listage avec valeurs en vigueur
  // pour la période (annee, mois) + enregistrement des surcharges par mois d'effet
  indemnitesFv: (params = {}) => request('/indemnites-fv' + buildQuery(params)),
  sauverIndemnitesFv: (body) => request('/indemnites-fv', { method: 'PUT', body: JSON.stringify(body) }),
  reaffecterIndemnitesFv: (body) => request('/indemnites-fv/reaffecter', { method: 'POST', body: JSON.stringify(body) }),

  // Indemnités F&V — paramètres : montants fixes par catégorie avec historique par mois d'effet
  parametresIndemnites: (params = {}) => request('/parametres-indemnites' + buildQuery(params)),
  sauverParametresIndemnites: (body) => request('/parametres-indemnites', { method: 'PUT', body: JSON.stringify(body) }),
  supprimerChangementIndemnites: (id) => request(`/parametres-indemnites/changements/${id}`, { method: 'DELETE' }),

  // Paramètres de présence : départements affichés PRÉSENT (P1) par défaut sur les jours ouvrables
  parametresPresence: () => request('/parametres-presence'),
  sauverParametresPresence: (body) => request('/parametres-presence', { method: 'PUT', body: JSON.stringify(body) }),

  // Tolérances de retard et de sortie par catégorie (Référentiel → Paramètres de Pointage)
  tolerances: () => request('/tolerances'),
  sauverTolerances: (lignes) => request('/tolerances', { method: 'PUT', body: JSON.stringify({ lignes }) }),

  // Paramètres généraux (Référentiel) : identité de l'organisme — logo/signature encodés en base64
  parametresGeneraux: () => request('/parametres-generaux'),
  sauverParametresGeneraux: (body) => request('/parametres-generaux', { method: 'PUT', body: JSON.stringify(body) }),

  // Règles de calcul de la paie (Référentiel → Paramètre de Salaire) : nomenclature du bulletin de paie
  reglesCalculPaie: () => request('/regles-calcul-paie'),
  ajouterRegleCalculPaie: (body) => request('/regles-calcul-paie', { method: 'POST', body: JSON.stringify(body) }),
  modifierRegleCalculPaie: (id, body) => request('/regles-calcul-paie/' + id, { method: 'PUT', body: JSON.stringify(body) }),
  supprimerRegleCalculPaie: (id) => request('/regles-calcul-paie/' + id, { method: 'DELETE' }),
  // Taux des rubriques calculées (CNSS, CSS, IRPP, retenues sociales) — enregistrés depuis l'onglet Bulletin de Paie
  sauverTauxPaie: (body) => request('/regles-calcul-paie/taux', { method: 'PUT', body: JSON.stringify(body) }),

  // Journal RMA (Repos · Maladie · Absence) — codifications importées fusionnées au journal de paie
  journalRma: (params = {}) => request('/journal-rma' + buildQuery(params)),
  journalRmaPdf: (params = {}) => openPdf('/journal-rma/pdf' + buildQuery(params)),
  journalRmaPrint: (params = {}) => printPdf('/journal-rma/pdf' + buildQuery(params)),
  importCodesRma: (texte, periode = {}) => request('/journal-rma/import', { method: 'POST', body: JSON.stringify({ texte, ...periode }) }),
  deleteCodesRma: (params = {}) => request('/journal-rma' + buildQuery(params), { method: 'DELETE' }),
  updateCodeRma: (body) => request('/journal-rma/update', { method: 'PUT', body: JSON.stringify(body) }),
  deleteCellRma: (params = {}) => request('/journal-rma/cell' + buildQuery(params), { method: 'DELETE' }),

  // Rubrique Horaires › Notification d'Absences : formulaire du supérieur hiérarchique / responsable RH,
  // calcul des jours ouvrables hors repos hebdomadaires et fériés payés, impression PDF, journal
  notificationsAbsence: (params = {}) => request('/notifications-absence' + buildQuery(params)),
  joursOuvrablesAbsence: (params = {}) => request('/notifications-absence/jours' + buildQuery(params)),
  notifierAbsence: (body) => request('/notifications-absence', { method: 'POST', body: JSON.stringify(body) }),
  supprimerNotificationAbsence: (id) => request(`/notifications-absence/${id}`, { method: 'DELETE' }),
  printNotificationAbsence: (id) => printPdf(`/notifications-absence/${id}/pdf`),

  demandesConge: (params = {}) => request('/demandes-conge' + buildQuery(params)),
  demandeConge: (id) => request(`/demandes-conge/${id}`),
  createDemandeConge: (body) => request('/demandes-conge', { method: 'POST', body: JSON.stringify(body) }),
  accepterDemande: (id) => request(`/demandes-conge/${id}/accepter`, { method: 'POST' }),
  rejeterDemande: (id, motif) => request(`/demandes-conge/${id}/rejeter`, { method: 'POST', body: JSON.stringify({ motif_rejet: motif }) }),
  supprimerDemande: (id) => request(`/demandes-conge/${id}`, { method: 'DELETE' }),

  // PDF protégés : récupérés en blob avec l'en-tête Authorization puis ouverts dans un nouvel onglet
  // (un simple <a href> / window.open n'envoie pas le token → 401 « Non authentifié. »)
  statsJournalPdf: (params = {}) => openPdf(`/stats-journal/pdf` + buildQuery(params)),
  statsJournalPrint: (params = {}) => printPdf(`/stats-journal/pdf` + buildQuery(params)),
  statsJournalXls: (params = {}) => downloadFichier(`/stats-journal/xls` + buildQuery(params), `journal-paie_${params.debut}_${params.fin}.xls`),
  demandePdf: (id) => openPdf(`/demandes-conge/${id}/pdf`),

  dashboard: () => request('/dashboard'),
  dashboardAudit: (params = {}) => request('/dashboard/audit' + buildQuery(params)),
  importCsv: (csv) => request('/import', { method: 'POST', body: JSON.stringify({ csv }) }),
  importRh: (csv) => request('/employes/import-rh', { method: 'POST', body: JSON.stringify({ csv }) }),
  horaires: (params = {}) => request('/horaires' + buildQuery(params)),
  viderHoraires: (params = {}) => request('/horaires' + buildQuery(params), { method: 'DELETE' }),
  presence: (params = {}) => request('/presence' + buildQuery(params)),
  importPresence: (texte) => request('/presence/import', { method: 'POST', body: JSON.stringify({ texte }) }),
  pointageBiometrique: (body) => request('/presence/pointage', { method: 'POST', body: JSON.stringify(body) }),
  presenceExport: (params = {}) => downloadFichier(`/presence/export` + buildQuery(params), `pointages_${params.debut || 'tout'}_${params.fin || 'tout'}.txt`),
  presenceDelete: (params = {}) => request('/presence' + buildQuery(params), { method: 'DELETE' }),
  presenceCorrection: (body) => request('/presence/correction', { method: 'PUT', body: JSON.stringify(body) }),
  supprimerCorrectionPresence: (params = {}) => request('/presence/correction' + buildQuery(params), { method: 'DELETE' }),
  presenceBiometrique: (params = {}) => request('/presence/biometrique' + buildQuery(params)),
  presenceBiometriqueDelete: (params = {}) => request('/presence/biometrique' + buildQuery(params), { method: 'DELETE' }),
  presenceBiometriqueXls: (params = {}) => downloadFichier(`/presence/biometrique/xls` + buildQuery(params), `pointages-biometriques_${params.fin || params.debut || 'tout'}.xls`),
  presenceBiometriquePdf: (params = {}) => openPdf(`/presence/biometrique/pdf` + buildQuery(params)),

  calendrierAnnee: (annee) => request(`/calendrier/${annee}`),
  sauverCalendrier: (annee, body) => request(`/calendrier/${annee}`, { method: 'PUT', body: JSON.stringify(body) }),
  ajouterJourFerie: (annee, body) => request(`/calendrier/${annee}/jours-feries`, { method: 'POST', body: JSON.stringify(body) }),
  modifierJourFerie: (id, body) => request(`/calendrier/jours-feries/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  supprimerJourFerie: (id) => request(`/calendrier/jours-feries/${id}`, { method: 'DELETE' }),
  genererCalendrier: (annee) => request(`/calendrier/${annee}/generer`, { method: 'POST' }),
  modifierJour: (id, body) => request(`/calendrier/jours/${id}`, { method: 'PUT', body: JSON.stringify(body) }),

  cyclesCalcul: (annee) => request(`/cycles-calcul/${annee}`),
  sauverCyclesCalcul: (annee, cycles) => request(`/cycles-calcul/${annee}`, { method: 'PUT', body: JSON.stringify({ cycles }) }),
  // Cycle de calcul : règles générales (jour début/fin du cycle, base forfaitaire, carence maladie)
  reglesCycleCalcul: () => request('/cycles-calcul/regles'),
  sauverReglesCycleCalcul: (body) => request('/cycles-calcul/regles', { method: 'PUT', body: JSON.stringify(body) }),
  // Règles de prélèvement (Congé & Maladie) : déduction maladie MA par épisodes
  reglesPrelevement: () => request('/cycles-calcul/prelevement'),
  sauverReglesPrelevement: (body) => request('/cycles-calcul/prelevement', { method: 'PUT', body: JSON.stringify(body) }),
  // Nombre de jours de paie d'un employé pour un mois (cycle résolu automatiquement) — injecté
  // dans la colonne « Nbr / Taux » de la ligne « Salaire de base » (5011) du bulletin de paie.
  calculJoursPaie: (params = {}) => request('/cycles-calcul/calculer' + buildQuery(params)),
  // Prévisions de paie : Nbr_Jours_Paie de tous les employés actifs pour un mois/année
  // (une seule requête pour le calendrier de paie de Calcul de Paie).
  previsionsBulletins: (params = {}) => request('/cycles-calcul/bulletins' + buildQuery(params)),
  // Prix de l'heure par catégorie (régime horaire — taux par la grille)
  prixHeuresCategorie: () => request('/cycles-calcul/prix-heures'),
  sauverPrixHeuresCategorie: (prix) => request('/cycles-calcul/prix-heures', { method: 'PUT', body: JSON.stringify({ prix }) }),

  maintenance: {
    resetEmployes: (motDePasse) => request('/maintenance/reset/employes', { method: 'POST', body: JSON.stringify({ mot_de_passe: motDePasse }) }),
    resetSoldesConge: (motDePasse) => request('/maintenance/reset/soldes-conge', { method: 'POST', body: JSON.stringify({ mot_de_passe: motDePasse }) }),
    resetSoldesMaladie: (motDePasse) => request('/maintenance/reset/soldes-maladie', { method: 'POST', body: JSON.stringify({ mot_de_passe: motDePasse }) }),
    resetJournal: (motDePasse) => request('/maintenance/reset/journal', { method: 'POST', body: JSON.stringify({ mot_de_passe: motDePasse }) }),
    changerMotDePasseDanger: (motDePasseActuel, nouveauMotDePasse) => request('/maintenance/password', { method: 'PUT', body: JSON.stringify({ mot_de_passe_actuel: motDePasseActuel, nouveau_mot_de_passe: nouveauMotDePasse }) }),
    backupCreer: (libelle) => request('/maintenance/backup', { method: 'POST', body: JSON.stringify({ libelle }) }),
    backupsListe: () => request('/maintenance/backups'),
    restaurerDepuisSauvegarde: (nom) => request(`/maintenance/restaurer/${encodeURIComponent(nom)}`, { method: 'POST' }),
    backupSupprimerAncienne: (nom) => request(`/maintenance/backup/${encodeURIComponent(nom)}`, { method: 'DELETE' }),
    backupSupprimerToutes: () => request('/maintenance/backups', { method: 'DELETE' }),
    resetDb: () => request('/maintenance/reset-db', { method: 'DELETE' }),
    backupTelecharger: async (nom) => {
      const res = await fetchAuth(`/maintenance/backups/${encodeURIComponent(nom)}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const err = new Error(data.error || 'Téléchargement impossible.');
        err.status = res.status;
        throw err;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nom;
      a.click();
      URL.revokeObjectURL(url);
    },
    restaurer: async (file) => {
      const fd = new FormData();
      fd.append('fichier', file);
      const res = await fetchAuth('/maintenance/restaurer', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(data.error || 'Restauration impossible.');
        err.status = res.status;
        throw err;
      }
      return data;
    },
  },

  photosBackup: async () => {
    const res = await fetchAuth('/comptes/photos/backup');
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const err = new Error(data.error || 'Téléchargement des photos impossible.');
      err.status = res.status;
      throw err;
    }
    const blob = await res.blob();
    let nom = 'photos_identite.zip';
    const cd = res.headers.get('Content-Disposition') || '';
    const m = cd.match(/filename="?([^";]+)"?/);
    if (m) nom = m[1];
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nom;
    a.click();
    URL.revokeObjectURL(url);
    return { nom };
  },

  photosRestaurer: async (file) => {
    const fd = new FormData();
    fd.append('fichier', file);
    const res = await fetchAuth('/comptes/photos/restaurer', { method: 'POST', body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || 'Restauration des photos impossible.');
      err.status = res.status;
      throw err;
    }
    return data;
  },

  // ---- Application Web ----
  appareilsConnectes: (params = {}) => request('/appareils-connectes' + buildQuery(params)),
  appareilsHeartbeat: (session_id) => request('/appareils/heartbeat', { method: 'POST', body: JSON.stringify({ session_id }) }),
  appareilsSupprimerHistorique: (params = {}) => request('/appareils-connectes' + buildQuery(params), { method: 'DELETE' }),
  appareilsPdf: (params = {}) => openPdf('/appareils/pdf' + buildQuery(params)),

  chatConversations: () => request('/chat/conversations'),
  chatMessages: (utilisateurId) => request('/chat/messages' + buildQuery({ utilisateur_id: utilisateurId })),
  chatEnvoyer: (payload) => request('/chat/envoyer', { method: 'POST', body: JSON.stringify(payload) }),
  chatMarquerLu: (utilisateurId) => request('/chat/marquer-lu', { method: 'PUT', body: JSON.stringify({ utilisateur_id: utilisateurId }) }),
};