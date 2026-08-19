// Base de l'API :
// - VITE_API_URL défini au build → l'API distante (ex. https://xmator-rh-backend.onrender.com)
// - sinon : build de production sur un vrai domaine → backend Render (cross-origin, CORS_ORIGIN à configurer)
// - sinon (localhost / 127.0.0.1, dev comme prod) → '/api' relatif : le serveur Express local sert le client ET l'API
const BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL.replace(/\/+$/, '')}/api`
  : (import.meta.env.PROD && typeof window !== 'undefined' && !['localhost', '127.0.0.1'].includes(window.location.hostname)
      ? 'https://xmator-rh-backend.onrender.com/api'
      : '/api');

export const TOKEN_KEY = 'amicale_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request(path, options = {}) {
  const token = getToken();
  const res = await fetch(BASE + path, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.startsWith('/auth/login')) {
    setToken(null);
    if (!window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
  }
  if (!res.ok) {
    const err = new Error(data.error || 'Une erreur est survenue.');
    err.status = res.status;
    throw err;
  }
  return data;
}

const buildQuery = (params = {}) => {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return qs ? `?${qs}` : '';
};

// Récupère un PDF protégé (token Bearer) et l'ouvre dans un nouvel onglet
async function openPdf(path, options = {}) {
  const token = getToken();
  const res = await fetch(BASE + path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    ...options,
  });
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
  const token = getToken();
  const res = await fetch(BASE + path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
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

export const api = {
  auth: {
    login: (login, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ login, password }) }),
    logout: () => request('/auth/logout', { method: 'POST' }),
    me: () => request('/auth/me'),
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
  mouchardExport: async (params = {}) => {
    const token = getToken();
    const res = await fetch(BASE + '/mouchard/export' + buildQuery(params), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
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
    const token = getToken();
    const fd = new FormData();
    fd.append('photo', file);
    const res = await fetch(BASE + `/employes/${matricule}/photo`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || 'Upload impossible.');
      err.status = res.status;
      throw err;
    }
    return data;
  },

  categories: () => request('/categories'),
  createCategorie: (libelle) => request('/categories', { method: 'POST', body: JSON.stringify({ libelle }) }),
  updateCategorie: (id, libelle) => request(`/categories/${id}`, { method: 'PUT', body: JSON.stringify({ libelle }) }),
  deleteCategorie: (id) => request(`/categories/${id}`, { method: 'DELETE' }),

  employes: (params = {}) => request('/employes' + buildQuery(params)),
  employe: (id) => request(`/employes/${id}`),
  createEmploye: (body) => request('/employes', { method: 'POST', body: JSON.stringify(body) }),
  updateEmploye: (id, body) => request(`/employes/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteEmploye: (id) => request(`/employes/${id}`, { method: 'DELETE' }),

  mouvements: (params = {}) => request('/mouvements' + buildQuery(params)),
  createMouvement: (body) => request('/mouvements', { method: 'POST', body: JSON.stringify(body) }),
  correctionSolde: (body) => request('/mouvements/correction-solde', { method: 'POST', body: JSON.stringify(body) }),
  ajoutAnnuelMasse: (body) => request('/mouvements/ajout-annuel-masse', { method: 'POST', body: JSON.stringify(body) }),
  ajoutMaladieMasse: (body) => request('/mouvements/ajout-maladie-masse', { method: 'POST', body: JSON.stringify(body) }),

  arretsMaladie: (params = {}) => request('/arrets-maladie' + buildQuery(params)),
  arretMaladie: (id) => request(`/arrets-maladie/${id}`),
  createArretMaladie: (body) => request('/arrets-maladie', { method: 'POST', body: JSON.stringify(body) }),
  validerArretMaladie: (id) => request(`/arrets-maladie/${id}/valider`, { method: 'POST' }),
  rejeterArretMaladie: (id, motif) => request(`/arrets-maladie/${id}/rejeter`, { method: 'POST', body: JSON.stringify({ motif_rejet: motif }) }),

  journalMaladie: (params = {}) => request('/journal-maladie' + buildQuery(params)),
  statsJournal: (params = {}) => request('/stats-journal' + buildQuery(params)),

  demandesConge: (params = {}) => request('/demandes-conge' + buildQuery(params)),
  demandeConge: (id) => request(`/demandes-conge/${id}`),
  createDemandeConge: (body) => request('/demandes-conge', { method: 'POST', body: JSON.stringify(body) }),
  accepterDemande: (id) => request(`/demandes-conge/${id}/accepter`, { method: 'POST' }),
  rejeterDemande: (id, motif) => request(`/demandes-conge/${id}/rejeter`, { method: 'POST', body: JSON.stringify({ motif_rejet: motif }) }),

  // PDF protégés : récupérés en blob avec l'en-tête Authorization puis ouverts dans un nouvel onglet
  // (un simple <a href> / window.open n'envoie pas le token → 401 « Non authentifié. »)
  statsJournalPdf: (params = {}) => openPdf(`/stats-journal/pdf` + buildQuery(params)),
  demandePdf: (id) => openPdf(`/demandes-conge/${id}/pdf`),

  dashboard: () => request('/dashboard'),
  dashboardAudit: (params = {}) => request('/dashboard/audit' + buildQuery(params)),
  importCsv: (csv) => request('/import', { method: 'POST', body: JSON.stringify({ csv }) }),
  importRh: (csv) => request('/employes/import-rh', { method: 'POST', body: JSON.stringify({ csv }) }),
  horaires: (params = {}) => request('/horaires' + buildQuery(params)),
  importHoraires: (texte) => request('/horaires/import', { method: 'POST', body: JSON.stringify({ texte }) }),
  presence: (params = {}) => request('/presence' + buildQuery(params)),
  importPresence: (texte) => request('/presence/import', { method: 'POST', body: JSON.stringify({ texte }) }),
  presenceExport: (params = {}) => downloadFichier(`/presence/export` + buildQuery(params), `pointages_${params.debut || 'tout'}_${params.fin || 'tout'}.txt`),
  presenceDelete: (params = {}) => request('/presence' + buildQuery(params), { method: 'DELETE' }),
  presenceCorrection: (body) => request('/presence/correction', { method: 'PUT', body: JSON.stringify(body) }),
  supprimerCorrectionPresence: (params = {}) => request('/presence/correction' + buildQuery(params), { method: 'DELETE' }),

  calendrierAnnee: (annee) => request(`/calendrier/${annee}`),
  sauverCalendrier: (annee, body) => request(`/calendrier/${annee}`, { method: 'PUT', body: JSON.stringify(body) }),
  ajouterJourFerie: (annee, body) => request(`/calendrier/${annee}/jours-feries`, { method: 'POST', body: JSON.stringify(body) }),
  modifierJourFerie: (id, body) => request(`/calendrier/jours-feries/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  supprimerJourFerie: (id) => request(`/calendrier/jours-feries/${id}`, { method: 'DELETE' }),
  genererCalendrier: (annee) => request(`/calendrier/${annee}/generer`, { method: 'POST' }),
  modifierJour: (id, body) => request(`/calendrier/jours/${id}`, { method: 'PUT', body: JSON.stringify(body) }),

  maintenance: {
    resetEmployes: (motDePasse) => request('/maintenance/reset/employes', { method: 'POST', body: JSON.stringify({ mot_de_passe: motDePasse }) }),
    resetSoldesConge: (motDePasse) => request('/maintenance/reset/soldes-conge', { method: 'POST', body: JSON.stringify({ mot_de_passe: motDePasse }) }),
    resetSoldesMaladie: (motDePasse) => request('/maintenance/reset/soldes-maladie', { method: 'POST', body: JSON.stringify({ mot_de_passe: motDePasse }) }),
    resetJournal: (motDePasse) => request('/maintenance/reset/journal', { method: 'POST', body: JSON.stringify({ mot_de_passe: motDePasse }) }),
    backupCreer: (libelle) => request('/maintenance/backup', { method: 'POST', body: JSON.stringify({ libelle }) }),
    backupsListe: () => request('/maintenance/backups'),
    restaurerDepuisSauvegarde: (nom) => request(`/maintenance/restaurer/${encodeURIComponent(nom)}`, { method: 'POST' }),
    backupTelecharger: async (nom) => {
      const token = getToken();
      const res = await fetch(BASE + `/maintenance/backups/${encodeURIComponent(nom)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
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
      const token = getToken();
      const fd = new FormData();
      fd.append('fichier', file);
      const res = await fetch(BASE + '/maintenance/restaurer', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
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
    const token = getToken();
    const res = await fetch(BASE + '/comptes/photos/backup', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
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
    const token = getToken();
    const fd = new FormData();
    fd.append('fichier', file);
    const res = await fetch(BASE + '/comptes/photos/restaurer', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || 'Restauration des photos impossible.');
      err.status = res.status;
      throw err;
    }
    return data;
  },
};