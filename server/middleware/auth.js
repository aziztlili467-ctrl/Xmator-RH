const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { db } = require('../db');

// Aucun secret « par défaut » connu n'est utilisé : soit JWT_SECRET est défini dans
// l'environnement, soit (hors production uniquement) une clé éphémère aléatoire est
// générée à chaque démarrage — jamais une constante du dépôt.
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET manquant : définir la variable JWT_SECRET dans l\'environnement (voir .env.example).');
  }
  console.warn('[auth] JWT_SECRET non défini : clé éphémère générée — les sessions seront invalidées au prochain redémarrage.');
}

// Le jeton d'accès est court (mémoire client) ; la session durable repose sur un
// refresh token opaque transporté en cookie HttpOnly (rotation à chaque usage).
const ACCESS_TOKEN_EXPIRES = process.env.JWT_EXPIRES || '15m';
const REFRESH_TOKEN_EXPIRES_DAYS = Number(process.env.REFRESH_TOKEN_EXPIRES_DAYS) || 30;

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

// ---- Cookies (parse + Set-Cookie) ----
function parseCookies(req) {
  const map = {};
  const str = req.headers.cookie;
  if (!str) return map;
  for (const pair of str.split(';')) {
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    const key = pair.slice(0, eq).trim();
    if (key) {
      try { map[key] = decodeURIComponent(pair.slice(eq + 1).trim()); } catch { map[key] = pair.slice(eq + 1).trim(); }
    }
  }
  return map;
}

function setRefreshCookie(res, token, maxAgeDays = REFRESH_TOKEN_EXPIRES_DAYS) {
  const parts = [
    `refreshToken=${encodeURIComponent(token)}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${maxAgeDays * 86400}`,
  ];
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearRefreshCookie(res) {
  res.setHeader('Set-Cookie', 'refreshToken=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0');
}

// ---- Refresh tokens opaques (stockés hashés ? Non : UUID aléatoire non devinable) ----
function fmtLocal(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function nettoyerRefreshTokens() {
  try {
    db.prepare("DELETE FROM refresh_tokens WHERE expires_at <= datetime('now','localtime') OR (revoked_at IS NOT NULL AND datetime('now','localtime') > datetime(created_at, '+1 day'))").run();
  } catch { /* best effort */ }
}

// Crée un refresh token opaque, lié à la session appareil. Un seul actif par session :
// l'ancien (s'il existe) est révoqué pour garantir la rotation.
function signRefreshToken(utilisateurId, sessionId, maxAgeDays = REFRESH_TOKEN_EXPIRES_DAYS) {
  nettoyerRefreshTokens();
  revokeRefreshForSession(sessionId);
  const id = crypto.randomUUID();
  const expires = fmtLocal(new Date(Date.now() + maxAgeDays * 86400000));
  db.prepare('INSERT INTO refresh_tokens (id, utilisateur_id, session_id, expires_at) VALUES (?,?,?,?)')
    .run(id, utilisateurId, sessionId, expires);
  return { id, expiresAt: expires };
}

// Vérifie un refresh token non révoqué et non expiré.
function verifierRefreshToken(id) {
  if (!id) return null;
  const r = db.prepare('SELECT * FROM refresh_tokens WHERE id = ?').get(id);
  if (!r) return null;
  if (r.revoked_at) return null;
  if (r.expires_at <= db.prepare("SELECT datetime('now','localtime') AS v").get().v) {
    revokeRefreshToken(id);
    return null;
  }
  return r;
}

// Distingue l'origine d'un refresh token invalide pour décider si le cookie peut être effacé :
//   'absent'  → token inconnu / aucun cookie : on peut effacer le cookie (défensif)
//   'expired' → session expirée : on efface le cookie (défensif)
//   'revoked' → token ROTÉ (réutilisation) : un jeton plus récent de la même session vient d'être
//               émis (rotation concurrente légitime : deux onglets, double effet StrictMode,
//               AuthContext + socket au démarrage). Le cookie frais est en cours d'arrivée dans le
//               navigateur : il NE FAUT PAS effacer le cookie, sinon la session valide est détruite.
function raisonRefreshInvalide(id) {
  if (!id) return 'absent';
  const r = db.prepare('SELECT * FROM refresh_tokens WHERE id = ?').get(id);
  if (!r) return 'absent';
  if (r.revoked_at) return 'revoked';
  if (r.expires_at <= db.prepare("SELECT datetime('now','localtime') AS v").get().v) return 'expired';
  return null;
}

function revokeRefreshToken(id) {
  try { db.prepare("UPDATE refresh_tokens SET revoked_at = datetime('now','localtime') WHERE id = ?").run(id); } catch {}
}

function revokeRefreshForSession(sessionId) {
  if (!sessionId) return;
  try { db.prepare("UPDATE refresh_tokens SET revoked_at = datetime('now','localtime') WHERE session_id = ? AND revoked_at IS NULL").run(sessionId); } catch {}
}

// ---- JWT d'accès ----
function sign(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRES });
}

// Reconstruit req.user à partir d'une ligne utilisateur, en revalidant l'activation.
function creerReqUser(c, sessionId) {
  if (!c || !c.actif) return null;
  return {
    id: c.id,
    login: c.login,
    role: c.role,
    employe_id: c.employe_id,
    actif: c.actif,
    permissions: c.permissions,
    session_id: sessionId || null,
  };
}

// Relit le compte en base à chaque requête : changement de rôle / permissions / désactivation immédiats.
// Authentification acceptée via (1) en-tête Authorization: Bearer ou (2) cookie refreshToken HttpOnly
// (auto-régénérant : le nouveau cookie est posé sur la réponse).
function requireAuth(req, res, next) {
  const header = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (header) {
    try {
      const payload = jwt.verify(header, JWT_SECRET);
      const u = creerReqUser(db.prepare('SELECT id, login, role, employe_id, actif, permissions FROM utilisateurs WHERE id = ?').get(payload.id), payload.session_id);
      if (u) { req.user = u; return next(); }
      return res.status(401).json({ error: 'Session expirée ou compte désactivé.' });
    } catch {
      return res.status(401).json({ error: 'Session expirée ou invalide.' });
    }
  }
  const refresh = parseCookies(req).refreshToken;
  if (refresh) {
    const raison = raisonRefreshInvalide(refresh);
    const r = raison === null ? verifierRefreshToken(refresh) : null;
    const c = r
      ? db.prepare('SELECT id, login, role, employe_id, actif, permissions FROM utilisateurs WHERE id = ?').get(r.utilisateur_id)
      : null;
    const u = creerReqUser(c, r ? r.session_id : null);
    if (u) {
      // Rotation : un nouveau refresh token est émis, posé en cookie, l'ancien est révoqué.
      const nouveau = signRefreshToken(u.id, r.session_id);
      setRefreshCookie(res, nouveau.id);
      req.user = u;
      return next();
    }
    if (raison === 'revoked') {
      // Rotation concurrente légitime (deux onglets, StrictMode, AuthContext+socket) :
      // un jeton plus récent de la même session vient d'être émis et le cookie frais
      // est en cours d'arrivée dans le navigateur. Ne pas effacer le cookie, sinon
      // on détruirait une session encore valide (le client relira le cookie le plus récent).
      return res.status(401).json({ error: 'Session expirée.' });
    }
    clearRefreshCookie(res);
    return res.status(401).json({ error: 'Session expirée.' });
  }
  return res.status(401).json({ error: 'Non authentifié.' });
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

module.exports = {
  JWT_SECRET,
  ACCESS_TOKEN_EXPIRES,
  REFRESH_TOKEN_EXPIRES_DAYS,
  sign,
  requireAuth,
  requireRole,
  requireModule,
  compteAvecEmploye,
  parseCookies,
  setRefreshCookie,
  clearRefreshCookie,
  signRefreshToken,
  verifierRefreshToken,
  raisonRefreshInvalide,
  revokeRefreshToken,
  revokeRefreshForSession,
  ROLES,
  MODULES,
  parsePermissions,
};