const { Router } = require('express');
const { db } = require('../db');
const { requireRole, requireAuth } = require('../middleware/auth');
const router = Router();

// Le chat relie chaque compte au Super Admin (une conversation par utilisateur_id).
// Les fonctions sont exportées pour être réutilisées par Socket.IO (index.js).

function estAdmin(user) {
  return user && user.role === 'super_admin';
}

// Nombre de messages non lus POUR un utilisateur (messages envoyés par l'admin)
function nonLusPourUtilisateur(utilisateurId) {
  return db.prepare(
    "SELECT COUNT(*) AS n FROM messages_chat WHERE utilisateur_id = ? AND expediteur_role = 'admin' AND lu = 0"
  ).get(utilisateurId).n;
}

// Nombre de messages non lus d'une conversation côté admin (envoyés par l'utilisateur)
function nonLusPourAdmin(utilisateurId) {
  return db.prepare(
    "SELECT COUNT(*) AS n FROM messages_chat WHERE utilisateur_id = ? AND expediteur_role = 'utilisateur' AND lu = 0"
  ).get(utilisateurId).n;
}

// GET /api/chat/conversations — (super_admin) toutes les conversations avec non-lus
router.get('/conversations', requireRole('super_admin'), (req, res) => {
  const lignes = db.prepare(`
    SELECT x.utilisateur_id, u.login, u.role,
           d.contenu AS dernier_message,
           d.date_envoi AS derniere_date
    FROM (SELECT utilisateur_id, MAX(id) AS dernier_id FROM messages_chat GROUP BY utilisateur_id) x
    JOIN messages_chat d ON d.id = x.dernier_id
    JOIN utilisateurs u  ON u.id = x.utilisateur_id
    ORDER BY d.date_envoi DESC
  `).all();
  const conversations = lignes.map((l) => ({
    ...l,
    non_lus: nonLusPourAdmin(l.utilisateur_id),
  }));
  res.json({ conversations, total_non_lus: conversations.reduce((s, c) => s + c.non_lus, 0) });
});

// GET /api/chat/messages?utilisateur_id= — historique persistant de la conversation.
// super_admin : toute conversation ; autres rôles : uniquement la leur.
router.get('/messages', requireAuth, (req, res) => {
  const uid = estAdmin(req.user)
    ? Number(req.query.utilisateur_id)
    : req.user.id;
  if (!uid || Number.isNaN(uid)) return res.status(400).json({ error: 'utilisateur_id invalide.' });
  const existe = db.prepare('SELECT id FROM utilisateurs WHERE id = ?').get(uid);
  if (!existe) return res.status(404).json({ error: 'Utilisateur introuvable.' });
  const messages = db.prepare(`
    SELECT id, utilisateur_id, expediteur_id, expediteur_role, contenu, date_envoi, lu
    FROM messages_chat WHERE utilisateur_id = ?
    ORDER BY date_envoi ASC, id ASC LIMIT 500
  `).all(uid);
  res.json({ messages });
});

// POST /api/chat/envoyer — {contenu} (tout rôle : vers l'admin)
//                        ou {utilisateur_id, contenu} (super_admin : réponse à un compte)
function envoyerMessage(user, payload) {
  const contenu = String((payload || {}).contenu || '').trim();
  if (!contenu) throw Object.assign(new Error('Le message ne peut pas être vide.'), { status: 400 });
  if (contenu.length > 2000) throw Object.assign(new Error('Message trop long (2000 caractères max).'), { status: 400 });
  let uid;
  let roleExpediteur;
  if (estAdmin(user)) {
    uid = Number(payload.utilisateur_id);
    roleExpediteur = 'admin';
    if (!uid || Number.isNaN(uid)) throw Object.assign(new Error('utilisateur_id manquant.'), { status: 400 });
  } else {
    uid = user.id;
    roleExpediteur = 'utilisateur';
  }
  const existe = db.prepare('SELECT id FROM utilisateurs WHERE id = ?').get(uid);
  if (!existe) throw Object.assign(new Error('Utilisateur introuvable.'), { status: 404 });
  const r = db.prepare(`
    INSERT INTO messages_chat (utilisateur_id, expediteur_id, expediteur_role, contenu)
    VALUES (?,?,?,?)
  `).run(uid, user.id, roleExpediteur, contenu);
  const message = db.prepare('SELECT * FROM messages_chat WHERE id = ?').get(r.lastInsertRowid);
  // L'expéditeur a forcément lu son propre message
  if (roleExpediteur === 'admin') db.prepare('UPDATE messages_chat SET lu = 1 WHERE id = ?').run(message.id);
  return message;
}

// PUT /api/chat/marquer-lu — {utilisateur_id} : marque comme lus les messages REÇUS
// (pour l'utilisateur : ceux de l'admin ; pour l'admin : ceux du compte visé).
function marquerLu(user, payload) {
  let uid;
  if (estAdmin(user)) {
    uid = Number((payload || {}).utilisateur_id);
    if (!uid || Number.isNaN(uid)) throw Object.assign(new Error('utilisateur_id manquant.'), { status: 400 });
    db.prepare("UPDATE messages_chat SET lu = 1 WHERE utilisateur_id = ? AND expediteur_role = 'utilisateur'").run(uid);
    return { utilisateur_id: uid };
  }
  db.prepare("UPDATE messages_chat SET lu = 1 WHERE utilisateur_id = ? AND expediteur_role = 'admin'").run(user.id);
  return { utilisateur_id: user.id };
}

router.post('/envoyer', requireAuth, (req, res) => {
  try {
    const message = envoyerMessage(req.user, req.body);
    res.json({ ok: true, message });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.put('/marquer-lu', requireAuth, (req, res) => {
  try {
    res.json({ ok: true, ...marquerLu(req.user, req.body) });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

module.exports = router;
module.exports.estAdmin = estAdmin;
module.exports.envoyerMessage = envoyerMessage;
module.exports.marquerLu = marquerLu;
module.exports.nonLusPourUtilisateur = nonLusPourUtilisateur;
module.exports.nonLusPourAdmin = nonLusPourAdmin;
