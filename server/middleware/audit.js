const { db } = require('../db');

// Rubriques du mouchard (correspondent aux modules de permissions + zones de lecture/administration)
const MODULES = {
  employes: 'Employés',
  categories: 'Catégories',
  soldes: 'Soldes & opérations',
  demandes: 'Demandes de congé',
  maladie: 'Maladie',
  statistiques: 'Tableau de bord & stats',
  comptes: 'Comptes',
  administration: 'Sauvegarde & import',
  horaires: 'Horaires de travail',
  presence: 'Présence & pointages',
  calendrier: 'Calendrier de l\'année',
  application_web: 'Application Web',
  paie: 'Paie mensuelle & codification',
  rma: "Journal RMA (repos · maladie · absence)",
  notif_absence: "Notification d'absences",
};

function modulePourPath(path) {
  const p = String(path || '').replace(/^\/api/, '');
  const tab = [
    ['/employes', 'employes'],
    ['/categories', 'categories'],
    ['/mouvements', 'soldes'],
    ['/demandes-conge', 'demandes'],
    ['/arrets-maladie', 'maladie'],
    ['/journal-maladie', 'maladie'],
    ['/dashboard', 'statistiques'],
    ['/stats-journal', 'statistiques'],
    ['/comptes', 'comptes'],
    ['/maintenance', 'administration'],
    ['/import', 'administration'],
    ['/horaires', 'horaires'],
    ['/presence', 'presence'],
    ['/calendrier', 'calendrier'],
    ['/codes-paie', 'paie'],
    ['/journal-rma', 'rma'],
    ['/notifications-absence', 'notif_absence'],
    ['/chat', 'application_web'],
    ['/appareils', 'application_web'],
  ];
  for (const [pref, mod] of tab) if (p.startsWith(pref)) return mod;
  return null;
}

// Action selon la méthode : GET→lire, POST collection→ajouter, PUT/PATCH & POST sous-chemin→modifier, DELETE→supprimer
function actionPourRequete(req) {
  const path = (req.originalUrl || '').replace(/^\/api/, '');
  if (path.includes('/generer-identifiants')) return 'ajouter';
  if (path.includes('/horaires/import')) return 'ajouter';
  if (path.includes('/presence/import')) return 'ajouter';
  if (path.includes('/journal-rma/import')) return 'ajouter';
  if (path.includes('/import-rh')) return 'ajouter';
  if (path.includes('/jours-feries') && req.method === 'POST') return 'ajouter';
  if (req.method === 'GET') return 'lire';
  if (req.method === 'POST') {
    const extra = path.split('/').filter(Boolean).length - 1;
    return extra > 0 ? 'modifier' : 'ajouter';
  }
  if (req.method === 'PUT' || req.method === 'PATCH') return 'modifier';
  if (req.method === 'DELETE') return 'supprimer';
  return 'lire';
}

// Insertion d'une entrée du journal (utilisée par le middleware ET par la route d'authentification)
function logActivite({ utilisateur_id, login, role, action, module, detail, statut, ip }) {
  try {
    db.prepare(`
      INSERT INTO audit_logs (utilisateur_id, login, role, action, module, detail, statut, ip)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(utilisateur_id || null, String(login || '?'), role || null, action, module || null, detail || null, statut == null ? null : Number(statut), ip || null);
  } catch {
    // le journal ne doit jamais faire échouer une requête
  }
}

// Middleware : journalise chaque requête authentifiée (sauf le mouchard lui-même et /api/auth gérés à part)
function auditLog(req, res, next) {
  res.on('finish', () => {
    const p = req.originalUrl || '';
    if (p.startsWith('/api/mouchard')) return;
    if (p.startsWith('/api/auth')) return;
    const module = modulePourPath(p);
    const u = req.user || {};
    if (!u.id) return;
    logActivite({
      utilisateur_id: u.id,
      login: u.login,
      role: u.role,
      action: actionPourRequete(req),
      module,
      detail: `${req.method} ${req.originalUrl}`,
      statut: res.statusCode,
      ip: req.ip,
    });
  });
  next();
}

module.exports = { auditLog, logActivite, modulePourPath, actionPourRequete, MODULES };