const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');

require('./seed')();

const app = express();
// CORS : en production, n'autoriser que les origines listées dans CORS_ORIGIN (séparées par des virgules).
// Si CORS_ORIGIN est vide (défaut), aucun en-tête CORS n'est émis : le client est servi par ce même serveur.
const corsOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim()) : false;
app.use(cors({ origin: corsOrigins }));
app.use(express.json({ limit: '10mb' }));

const { requireAuth, requireRole, requireModule } = require('./middleware/auth');
const { auditLog } = require('./middleware/audit');
const { db } = require('./db');

// Auth publique (login) — /me et /logout sont protégés en interne
app.use('/api/auth', require('./routes/auth'));

// Tout le reste des /api exige un compte authentifié
app.use('/api', requireAuth);

// Mouchard : journalise chaque opération authentifiée (lecture/ajout/modification/suppression) — super_admin uniquement
app.use('/api/mouchard', requireRole('super_admin'), require('./routes/mouchard'));
app.use('/api', auditLog);

// Sauvegardes automatiques : toute écriture réussie (POST/PUT/DELETE sur une rubrique)
// planifie une sauvegarde complète de la base + photos, 45 s après la dernière écriture.
const { surveillerEcritures } = require('./routes/maintenance');
app.use('/api', surveillerEcritures);

// Super Admin uniquement — gestion des comptes, import, maintenance, calendrier de l'année
app.use('/api/comptes', requireRole('super_admin'), require('./routes/comptes'));
app.use('/api/maintenance', requireRole('super_admin'), require('./routes/maintenance'));
app.use('/api/import', requireRole('super_admin'), require('./routes/import'));
app.use('/api/calendrier', requireRole('super_admin'), require('./routes/calendrier'));
app.use('/api/codes-paie', requireRole('super_admin'), require('./routes/codes-paie'));

// Workflow congés / arrêts : écritures et décisions selon les permissions du modérateur
app.use('/api/demandes-conge', requireModule('demandes'), require('./routes/demandes-conge'));
app.use('/api/arrets-maladie', requireModule('maladie'), require('./routes/arrets-maladie'));

// Lecture pour super_admin + consultation + moderateur ; écritures par module (permissions du modérateur)
const lecture = requireRole('super_admin', 'consultation', 'moderateur');

app.use('/api/dashboard', lecture, require('./routes/dashboard'));
app.use('/api/stats-journal', lecture, require('./routes/stats-journal'));

// Journal RMA : lecture pour super_admin + consultation + moderateur ; import/suppression super_admin uniquement
app.use('/api/journal-rma', (req, res, next) =>
  req.method === 'GET' ? lecture(req, res, next) : requireRole('super_admin')(req, res, next),
  require('./routes/journal-rma'));
app.use('/api/journal-maladie', lecture, require('./routes/journal-maladie'));
app.use('/api/mouvements', (req, res, next) =>
  req.method === 'GET' ? lecture(req, res, next) : requireModule('soldes')(req, res, next),
  require('./routes/mouvements'));
app.use('/api/categories', (req, res, next) =>
  req.method === 'GET' ? lecture(req, res, next) : requireModule('categories')(req, res, next),
  require('./routes/categories'));

// Horaires de travail : lecture pour tous (super_admin + consultation + moderateur) ; import super_admin uniquement
app.use('/api/horaires', (req, res, next) =>
  req.method === 'GET' ? lecture(req, res, next) : requireRole('super_admin')(req, res, next),
  require('./routes/horaires'));

// Présences & pointages : lecture pour tous (super_admin + consultation + moderateur) ; import super_admin uniquement
app.use('/api/presence', (req, res, next) =>
  req.method === 'GET' ? lecture(req, res, next) : requireRole('super_admin')(req, res, next),
  require('./routes/presence'));

// Notification d'Absences : lecture pour tous (super_admin + consultation + moderateur) ;
// crǸation/suppression/impression super_admin uniquement (formulaire RH / supǸrieur hiǸrarchique)
app.use('/api/notifications-absence', (req, res, next) =>
  req.method === 'GET' ? lecture(req, res, next) : requireRole('super_admin')(req, res, next),
  require('./routes/notifications-absence'));

// Employés : GET passe au router (qui contrôle : liste/détail super_admin+consultation+moderateur,
// fiche/mouvements/stats par matricule avec isolation employé) ; écritures par module 'employes'
app.use('/api/employes', (req, res, next) => {
  if (req.method !== 'GET') return requireModule('employes')(req, res, next);
  return next();
}, require('./routes/employes'));

// ---- Application Web : routes chat + appareils connectés (super_admin pour les listes,
// tout compte authentifié pour son propre chat / heartbeat) ----
app.use('/api/chat', require('./routes/chat'));
app.use('/api/appareils', requireAuth, require('./routes/appareils'));
// Alias public /api/appareils-connectes : liste (GET, super_admin) + suppression d'historique (DELETE, super_admin)
const appareilsRouteur = require('./routes/appareils');
app.all('/api/appareils-connectes', requireAuth, (req, res) => {
  if (req.method !== 'GET' && req.method !== 'DELETE') return res.status(405).json({ error: 'Méthode non autorisée.' });
  if (req.user.role !== 'super_admin') return res.status(403).json({ error: 'Accès refusé.' });
  req.url = '/appareils-connectes';
  return appareilsRouteur(req, res, () => res.status(404).end());
});

// ---- Chat en direct temps réel (Socket.IO) ----
// Même serveur HTTP que l'API, même origine. Le JWT est transmis à la connexion du socket.
const server = http.createServer(app);
const { Server } = require('socket.io');
const { JWT_SECRET } = require('./middleware/auth');
const jwt = require('jsonwebtoken');
const chat = require('./routes/chat');
const io = new Server(server, { cors: { origin: corsOrigins || false }, maxHttpBufferSize: 1e5 });

function adminsConnectes() {
  let n = 0;
  for (const [, s] of io.of('/').sockets) if (s.user && s.user.role === 'super_admin') n++;
  return n;
}
function diffuserPresenceAdmin() {
  io.emit('presence:admin', { en_ligne: adminsConnectes() > 0 });
}

io.use((socket, next) => {
  try {
    const payload = jwt.verify(String((socket.handshake.auth || {}).token || ''), JWT_SECRET);
    const c = db.prepare('SELECT id, login, role, actif FROM utilisateurs WHERE id = ?').get(payload.id);
    if (!c || !c.actif) return next(new Error('Session expirée ou compte désactivé.'));
    socket.user = { id: c.id, login: c.login, role: c.role };
    return next();
  } catch {
    return next(new Error('Non authentifié.'));
  }
});

io.on('connection', (socket) => {
  socket.join(`user:${socket.user.id}`);
  if (socket.user.role === 'super_admin') socket.join('admins');
  diffuserPresenceAdmin();
  // Badge de non-lus personnel dès la connexion
  socket.emit('chat:non-lus', { total: chat.nonLusPourUtilisateur(socket.user.id) });

  // Envoi d'un message : {contenu} depuis un compte quelconque (vers l'admin),
  // ou {utilisateur_id, contenu} depuis le Super Admin (réponse à un compte).
  socket.on('chat:envoyer', async (data, ack) => {
    try {
      const message = chat.envoyerMessage(socket.user, data || {});
      // Diffusion instantanée au propriétaire de la conversation et aux admins connectés
      io.to(`user:${message.utilisateur_id}`).emit('chat:message', { message });
      io.to('admins').emit('chat:message', { message });
      // Badges de non-lus mis à jour
      io.to(`user:${message.utilisateur_id}`).emit('chat:non-lus', { total: chat.nonLusPourUtilisateur(message.utilisateur_id) });
      for (const s of io.of('/').sockets.values()) {
        if (s.user && s.user.role === 'super_admin') s.emit('chat:admin-non-lus', { total: totalNonLusAdmin() });
      }
      if (typeof ack === 'function') ack({ ok: true, message });
    } catch (e) {
      if (typeof ack === 'function') ack({ ok: false, error: e.message });
    }
  });

  // Marquer comme lus les messages reçus
  socket.on('chat:lire', (data) => {
    try {
      const r = chat.marquerLu(socket.user, data || {});
      if (socket.user.role === 'super_admin') {
        for (const s of io.of('/').sockets.values()) {
          if (s.user && s.user.role === 'super_admin') s.emit('chat:admin-non-lus', { total: totalNonLusAdmin() });
        }
      } else {
        socket.emit('chat:non-lus', { total: chat.nonLusPourUtilisateur(r.utilisateur_id) });
      }
    } catch { /* silencieux */ }
  });

  socket.on('disconnect', () => {
    diffuserPresenceAdmin();
  });
});

function totalNonLusAdmin() {
  const rows = db.prepare(`
    SELECT utilisateur_id FROM messages_chat WHERE expediteur_role = 'utilisateur' AND lu = 0 GROUP BY utilisateur_id
  `).all();
  let t = 0;
  for (const r of rows) t += chat.nonLusPourAdmin(r.utilisateur_id);
  return t;
}

// Photos employés (publiques — chargées par <img>).
// Source unique servie = data/photos (ce que lisent ET écrivent les uploads).
// La photothèque de référence (committée dans le dépôt : server/photos-reference/photos)
// est copiée dans data/photos au démarrage pour les fichiers ABSENTS : garantit que les
// photos existent dès la 1re exécution (clone local, déploiement Render au disque éphémère).
// Cache navigateur 1 h (re-upload visible sous 1 h ; le SW rafraîchit déjà en arrière-plan).
const photosDir = path.join(__dirname, '..', 'data', 'photos');
if (!fs.existsSync(photosDir)) fs.mkdirSync(photosDir, { recursive: true });
const photosReference = path.join(__dirname, 'photos-reference', 'photos');
if (fs.existsSync(photosReference)) {
  try {
    let copiees = 0;
    for (const f of fs.readdirSync(photosReference)) {
      if (!/\.webp$/i.test(f)) continue;
      const dest = path.join(photosDir, f);
      if (!fs.existsSync(dest)) {
        fs.copyFileSync(path.join(photosReference, f), dest);
        copiees++;
      }
    }
    if (copiees > 0) console.log(`[photos] ${copiees} photo(s) de référence copiée(s) dans data/photos`);
  } catch (e) {
    console.warn('[photos] sync de la photothèque de référence ignorée :', e.message);
  }
}
app.use('/photos', express.static(photosDir, {
  maxAge: '1h',
  etag: true,
  setHeaders: (res) => res.setHeader('Cache-Control', 'public, max-age=3600'),
}));

const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    if (req.path.startsWith('/photos')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`API Amicale démarrée sur http://localhost:${PORT} (chat temps réel Socket.IO actif)`);
});
