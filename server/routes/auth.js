const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { sign, requireAuth, compteAvecEmploye } = require('../middleware/auth');
const { logActivite } = require('../middleware/audit');
const router = Router();

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

  const token = sign({ id: c.id, login: c.login, role: c.role, employe_id: c.employe_id });
  res.json({ token, user: compteAvecEmploye(c) });
});

// POST /api/auth/logout — côté stateless : le client supprime le token
router.post('/logout', requireAuth, (req, res) => {
  logActivite({ utilisateur_id: req.user.id, login: req.user.login, role: req.user.role, action: 'logout', detail: 'Déconnexion', statut: 200, ip: req.ip });
  res.json({ ok: true });
});

// GET /api/auth/me — profil du compte connecté (fraîchement relu en base)
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: compteAvecEmploye(req.user) });
});

module.exports = router;