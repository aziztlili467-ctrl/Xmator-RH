const { Router } = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../db');
const {
  JWT_SECRET, sign, requireAuth, compteAvecEmploye,
  setRefreshCookie, clearRefreshCookie, parseCookies,
  signRefreshToken, verifierRefreshToken, revokeRefreshToken, revokeRefreshForSession,
} = require('../middleware/auth');
const { logActivite } = require('../middleware/audit');
const router = Router();

// ---- Détection de l'appareil depuis le User-Agent (sans dépendance externe) ----
function parserUserAgent(ua) {
  const s = String(ua || '');
  // Type d'appareil
  let type = 'pc';
  if (/iPad|Tablet|PlayBook|Silk/i.test(s) || (/Android/i.test(s) && !/Mobile/i.test(s))) type = 'tablette';
  else if (/Mobi|iPhone|iPod|Android.*Mobile|Windows Phone/i.test(s)) type = 'mobile';
  else if (!s) type = 'autre';
  // Navigateur (ordre important : les UA contiennent plusieurs noms)
  let nav = 'Navigateur';
  if (/Edg\//.test(s)) nav = 'Edge';
  else if (/OPR\/|Opera/.test(s)) nav = 'Opera';
  else if (/SamsungBrowser/.test(s)) nav = 'Samsung Internet';
  else if (/Firefox\//.test(s)) nav = 'Firefox';
  else if (/Chrome\//.test(s)) nav = 'Chrome';
  else if (/Safari\//.test(s)) nav = 'Safari';
  // Système d'exploitation
  let os = '';
  if (/Windows NT/.test(s)) os = 'Windows';
  else if (/Android/.test(s)) os = 'Android';
  else if (/iPhone OS|iPad|iOS/.test(s)) os = 'iOS';
  else if (/Mac OS X/.test(s)) os = 'macOS';
  else if (/Linux/.test(s)) os = 'Linux';
  return { type, nom: os ? `${nav} — ${os}` : nav };
}

// Ouvre une ligne de session (appelé après un login réussi)
function ouvrirSession(utilisateur, req) {
  const ua = parserUserAgent(req.headers['user-agent']);
  const deviceId = String((req.body || {}).device_id || '').slice(0, 64) || null;
  const r = db.prepare(`
    INSERT INTO sessions_appareils (utilisateur_id, login, role, type_appareil, nom_appareil, user_agent, ip_adresse, identifiant_appareil)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(utilisateur.id, utilisateur.login, utilisateur.role, ua.type, ua.nom, String(req.headers['user-agent'] || ''), req.ip || null, deviceId);
  return r.lastInsertRowid;
}

// Clôture une session (déconnexion explicite, beacon de fermeture ou expiration détectée)
function fermerSession(sessionId, motif) {
  const s = db.prepare("SELECT id, date_connexion FROM sessions_appareils WHERE id = ? AND statut = 'connecte'").get(sessionId);
  if (!s) return false;
  db.prepare(`
    UPDATE sessions_appareils
    SET statut = 'deconnecte', date_deconnexion = datetime('now','localtime'),
        duree_secondes = CAST((julianday(datetime('now','localtime')) - julianday(date_connexion)) * 86400 AS INTEGER)
    WHERE id = ?
  `).run(sessionId);
  return true;
}

// POST /api/auth/login — authentification (message d'erreur générique, ne précise ni login ni mot de passe)
router.post('/login', (req, res) => {
  const { login, password } = req.body || {};
  if (!login || !password) return res.status(400).json({ error: 'Login et mot de passe sont obligatoires.' });

  const c = db.prepare('SELECT * FROM utilisateurs WHERE login = ?').get(String(login).trim());
  if (!c || !bcrypt.compareSync(String(password), c.password_hash)) {
    logActivite({ login: String(login || '').trim(), action: 'echec_login', detail: 'Échec de connexion (identifiants invalides)', statut: 401, ip: req.ip });
    return res.status(401).json({ error: 'Identifiants invalides.' });
  }
  if (!c.actif) {
    logActivite({ utilisateur_id: c.id, login: c.login, role: c.role, action: 'echec_login', detail: 'Connexion refusée (compte désactivé)', statut: 401, ip: req.ip });
    return res.status(401).json({ error: 'Compte désactivé. Contactez l\'administrateur.' });
  }

  db.prepare('UPDATE utilisateurs SET derniere_connexion = datetime(\'now\',\'localtime\') WHERE id = ?').run(c.id);
  logActivite({ utilisateur_id: c.id, login: c.login, role: c.role, action: 'login', detail: 'Connexion réussie', statut: 200, ip: req.ip });

  // Tracking appareils : une ligne par connexion réussie ; l'id de session voyage dans le JWT
  const sessionId = ouvrirSession(c, req);
  const token = sign({ id: c.id, login: c.login, role: c.role, employe_id: c.employe_id, session_id: sessionId });
  // Session durable : refresh token opaque en cookie HttpOnly (jamais accessible au JS)
  const refresh = signRefreshToken(c.id, sessionId);
  setRefreshCookie(res, refresh.id);
  res.json({ token, user: compteAvecEmploye(c), session_id: sessionId });
});

// POST /api/auth/refresh — renouvelle le jeton d'accès depuis le cookie HttpOnly « refreshToken ».
// Le refresh token est roté : l'ancien est révoqué, un nouveau est émis (détection de réutilisation).
router.post('/refresh', (req, res) => {
  const refresh = parseCookies(req).refreshToken;
  if (!refresh) return res.status(401).json({ error: 'Non authentifié.' });
  const r = verifierRefreshToken(refresh);
  if (!r) {
    clearRefreshCookie(res);
    return res.status(401).json({ error: 'Session expirée, veuillez vous reconnecter.' });
  }
  const c = db.prepare('SELECT * FROM utilisateurs WHERE id = ?').get(r.utilisateur_id);
  if (!c || !c.actif) {
    revokeRefreshToken(refresh);
    clearRefreshCookie(res);
    return res.status(401).json({ error: 'Compte désactivé.' });
  }
  const nouveau = signRefreshToken(c.id, r.session_id);
  setRefreshCookie(res, nouveau.id);
  const token = sign({ id: c.id, login: c.login, role: c.role, employe_id: c.employe_id, session_id: r.session_id });
  res.json({ token, user: compteAvecEmploye(c), session_id: r.session_id });
});

// POST /api/auth/logout — déconnexion explicite : révoque le refresh token de la session et efface le cookie
router.post('/logout', requireAuth, (req, res) => {
  logActivite({ utilisateur_id: req.user.id, login: req.user.login, role: req.user.role, action: 'logout', detail: 'Déconnexion', statut: 200, ip: req.ip });
  if (req.user.session_id) revokeRefreshForSession(req.user.session_id);
  clearRefreshCookie(res);
  if (req.user.session_id) fermerSession(req.user.session_id, 'logout');
  res.json({ ok: true });
});

// POST /api/auth/logout-beacon — fermeture d'onglet/navigateur : navigator.sendBeacon ne peut pas
// poser d'en-tête Authorization, le JWT est donc transmis dans le corps et vérifié manuellement.
router.post('/logout-beacon', (req, res) => {
  try {
    const payload = jwt.verify(String((req.body || {}).token || ''), JWT_SECRET);
    if (payload && payload.session_id) {
      fermerSession(payload.session_id, 'fermeture navigateur');
      revokeRefreshForSession(payload.session_id);
    }
  } catch { /* token expiré/invalide : rien à faire */ }
  clearRefreshCookie(res);
  res.json({ ok: true });
});

// GET /api/auth/me — profil du compte connecté (fraîchement relu en base)
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: compteAvecEmploye(req.user), session_id: req.user.session_id || null });
});

module.exports = router;
