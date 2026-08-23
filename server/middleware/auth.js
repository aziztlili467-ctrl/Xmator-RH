const jwt = require('jsonwebtoken');
const { db } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? null : 'amicale-dev-secret-2026');
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET manquant : définir la variable JWT_SECRET dans l\'environnement (voir .env.example).');
}
const JWT_EXPIRES = '8h';

const ROLES = ['super_admin', 'consultation', 'moderateur', 'employe'];

// Rubriques (modules) sur lesquelles on peut octroyer des droits à un modérateur
const MODULES = {
  employes: 'Employés',
  categories: 'Catégories',
  soldes: 'Soldes & opérations',
  demandes: 'Demandes de congé',
  maladie: 'Arrêts maladie',
};

// Permissions par défaut (tout décoché)
function permsVides() {
  const out = {};
  for (const k of Object.keys(MODULES)) out[k] = { lire: false, ajouter: false, modifier: false };
  return out;
}

// Normalise une permission (chaîne JSON, objet ou null) → objet { module: { lire, ajouter, modifier } }
function parsePermissions(perm) {
  const out = permsVides();
  if (!perm) return out;
  let obj = perm;
  if (typeof perm === 'string') {
    try {
      obj = JSON.parse(perm);
    } catch {
      return out;
    }
  }
  if (!obj || typeof obj !== 'object') return out;
  for (const k of Object.keys(MODULES)) {
    const m = obj[k] || {};
    out[k] = { lire: !!m.lire, ajouter: !!m.ajouter, modifier: !!m.modifier };
  }
  return out;
}

// Action requise selon la méthode HTTP :
// GET → lire ; PUT/PATCH → modifier ; POST sur la collection (chemin simple) → ajouter ;
// POST avec sous-chemin (accepter/rejeter/valider/photo/correction/masse…) → modifier
function actionPour(req) {
  if (req.method === 'GET') return 'lire';
  if (req.method === 'PUT' || req.method === 'PATCH') return 'modifier';
  if (req.method === 'POST') {
    const extra = req.path.split('/').filter(Boolean).length - 1;
    return extra > 0 ? 'modifier' : 'ajouter';
  }
  return 'modifier';
}

function sign(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

// Relit le compte en base à chaque requête : changement de rôle / permissions / désactivation immédiats
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Non authentifié.' });
  }
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    const c = db.prepare('SELECT id, login, role, employe_id, actif, permissions FROM utilisateurs WHERE id = ?').get(payload.id);
    if (!c || !c.actif) return res.status(401).json({ error: 'Session expirée ou compte désactivé.' });
    req.user = { id: c.id, login: c.login, role: c.role, employe_id: c.employe_id, actif: c.actif, permissions: c.permissions, session_id: payload.session_id || null };
    return next();
  } catch {
    return res.status(401).json({ error: 'Session expirée ou invalide.' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié.' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Accès refusé.' });
    return next();
  };
}

// Garde par module : super_admin = tout ; moderateur = selon ses permissions (et jamais de suppression) ;
// consultation / employe = refusé (leurs routes sont gérées par requireRole)
function requireModule(module) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié.' });
    if (req.user.role === 'super_admin') return next();
    if (req.user.role === 'moderateur') {
      if (req.method === 'DELETE') {
        return res.status(403).json({ error: 'La suppression est réservée au super admin.' });
      }
      const m = parsePermissions(req.user.permissions)[module] || {};
      const action = actionPour(req);
      if (m[action]) return next();
      return res.status(403).json({ error: 'Accès refusé : permission insuffisante pour cette action.' });
    }
    return res.status(403).json({ error: 'Accès refusé.' });
  };
}

// Compte utilisateur complet (avec l'employé lié, si présent, et les permissions parsées)
function compteAvecEmploye(user) {
  const c = db.prepare('SELECT * FROM utilisateurs WHERE id = ?').get(user.id);
  if (!c) return null;
  const e = c.employe_id ? db.prepare(`
    SELECT e.id, e.matricule, e.nom, e.prenom, e.categorie_id, e.photo_url,
           c.libelle AS categorie
    FROM employes e JOIN categories c ON c.id = e.categorie_id
    WHERE e.id = ?
  `).get(c.employe_id) : null;
  return {
    id: c.id,
    login: c.login,
    role: c.role,
    employe_id: c.employe_id,
    actif: c.actif,
    derniere_connexion: c.derniere_connexion,
    permissions: c.role === 'moderateur' ? parsePermissions(c.permissions) : null,
    employe: e || null,
  };
}

module.exports = { JWT_SECRET, JWT_EXPIRES, sign, requireAuth, requireRole, requireModule, compteAvecEmploye, ROLES, MODULES, parsePermissions };