const express = require('express');
const cors = require('cors');
let compression;
try { compression = require('compression'); } catch { compression = () => (req,res,next)=>next(); }
const path = require('path');
const fs = require('fs');
const http = require('http');

require('./seed')();

const app = express();
// CORS : en production, n'autoriser que les origines listées dans CORS_ORIGIN (séparées par des virgules).
// Si CORS_ORIGIN est vide (défaut), aucun en-tête CORS n'est émis : le client est servi par ce même serveur.
const corsOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim()) : false;
app.use(compression({ threshold: 1024 }));
app.use(cors({ origin: corsOrigins }));
app.use(express.json({ limit: '2mb' }));
// Anti-crash : ne jamais laisser une exception non capturée tuer le process (log + keep alive)
process.on('uncaughtException', (err) => console.error('[uncaughtException]', err.message));
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err?.message || err));

const { requireAuth, requireRole, requireModule } = require('./middleware/auth');
const { auditLog } = require('./middleware/audit');
const { db } = require('./db');
const { notifyDataChanged, onDataChanged } = require('./routes/dataSync');

// Sonde de santé publique — utilisée par l'hébergeur (Render, Docker…) pour
// vérifier que le service répond. Doit rester AVANT requireAuth, sinon elle
// renvoie 401 et l'hébergeur considère le déploiement en échec.
app.get('/api/health', (req, res) => {
  try {
    db.prepare('SELECT 1').get();
    res.json({ status: 'ok', uptime: Math.round(process.uptime()) });
  } catch (err) {
    res.status(503).json({ status: 'error', error: 'base de données indisponible' });
  }
});

// Auth publique (login) — /me et /logout sont protégés en interne
app.use('/api/auth', require('./routes/auth'));

// Tout le reste des /api exige un compte authentifié
app.use('/api', requireAuth);

// Synchronisation « temps réel » : après toute écriture API réussie (POST/PUT/DELETE 2xx), signale
// aux caches d'indicateurs (tableau de bord) de se vider — les données affichées restent ainsi
// cohérentes avec les rectifications, importations et validations apportées à l'instant.
app.use('/api', (req, res, next) => {
  res.on('finish', () => {
    if (req.method !== 'GET' && res.statusCode >= 200 && res.statusCode < 300) notifyDataChanged();
  });
  next();
});

// Mouchard : journalise chaque opération authentifiée (lecture/ajout/modification/suppression) — super_admin uniquement
app.use('/api/mouchard', requireRole('super_admin'), require('./routes/mouchard'));
app.use('/api', auditLog);

// Super Admin uniquement — gestion des comptes, import, maintenance, calendrier de l'année
app.use('/api/comptes', requireRole('super_admin'), require('./routes/comptes'));
app.use('/api/maintenance', requireRole('super_admin'), require('./routes/maintenance'));
app.use('/api/import', requireRole('super_admin'), require('./routes/import'));
app.use('/api/calendrier', requireRole('super_admin'), require('./routes/calendrier'));
app.use('/api/codes-paie', requireRole('super_admin'), require('./routes/codes-paie'));
// Grille de salaire : lecture pour super_admin + consultation + moderateur (options des listes
// Rubrique / Grade / Classe / Echelon côté Employés) ; écritures super_admin uniquement
app.use('/api/grille-salaire', (req, res, next) =>
  req.method === 'GET' ? lecture(req, res, next) : requireRole('super_admin')(req, res, next),
  require('./routes/grille-salaire'));
// Règles de calcul de la paie (Référentiel → Paramètre de Salaire) : nomenclature des rubriques du
// bulletin de paie — lecture super_admin + consultation + moderateur, écritures super_admin
app.use('/api/regles-calcul-paie', (req, res, next) =>
  req.method === 'GET' ? lecture(req, res, next) : requireRole('super_admin')(req, res, next),
  require('./routes/regles-calcul-paie'));
// Cycle de calcul mensuel (début / fin de cycle par mois) — mêmes droits que les règles de paie
app.use('/api/cycles-calcul', (req, res, next) =>
  req.method === 'GET' ? lecture(req, res, next) : requireRole('super_admin')(req, res, next),
  require('./routes/cycles-calcul'));
// Indemnités F&V (Paie Mensuelle) : lecture pour super_admin + consultation + moderateur ;
// écritures super_admin uniquement (données de paie)
app.use('/api/indemnites-fv', (req, res, next) =>
  req.method === 'GET' ? lecture(req, res, next) : requireRole('super_admin')(req, res, next),
  require('./routes/indemnites-fv'));
// Paramètres des indemnités F&V (Paie Mensuelle) : montants fixes par catégorie avec historique
// par mois d'effet — lecture super_admin + consultation + moderateur, écritures super_admin
app.use('/api/parametres-indemnites', (req, res, next) =>
  req.method === 'GET' ? lecture(req, res, next) : requireRole('super_admin')(req, res, next),
  require('./routes/parametres-indemnites'));
// Paramètres de présence : lecture pour super_admin + consultation + moderateur (journal de
// présence / dashboard liés) ; écritures super_admin uniquement (départements « Présent par défaut »)
app.use('/api/parametres-presence', (req, res, next) =>
  req.method === 'GET' ? lecture(req, res, next) : requireRole('super_admin')(req, res, next),
  require('./routes/parametres-presence'));
// Paramètres généraux (Référentiel) : identité de l'organisme — lecture pour super_admin +
// consultation + moderateur, écritures super_admin uniquement
app.use('/api/parametres-generaux', (req, res, next) =>
  req.method === 'GET' ? lecture(req, res, next) : requireRole('super_admin')(req, res, next),
  require('./routes/parametres-generaux'));
// Tolérances de retard et de sortie par catégorie (Référentiel → Paramètres de Pointage) :
// lecture pour super_admin + consultation + moderateur, écritures super_admin uniquement
app.use('/api/tolerances', (req, res, next) =>
  req.method === 'GET' ? lecture(req, res, next) : requireRole('super_admin')(req, res, next),
  require('./routes/tolerances'));

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
app.use('/api/edition-conges', lecture, require('./routes/edition-conges'));
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
const { JWT_SECRET, parseCookies, verifierRefreshToken } = require('./middleware/auth');
const jwt = require('jsonwebtoken');
const chat = require('./routes/chat');
const io = new Server(server, { cors: { origin: corsOrigins || false }, maxHttpBufferSize: 1e5 });

// Règle de synchronisation « temps réel » : chaque écriture API réussie (POST/PUT/DELETE 2xx)
// est diffusée à tous les clients connectés (event rh:donnees-change). Les tableaux de bord
// ouverts rafraîchissent alors immédiatement leurs filtres (départements, employés, catégories)
// et leurs graphiques — tout changement futur dans la sous-catégorie Employés (Renseignements RH),
// import compris, est synchronisé instantanément.
onDataChanged(() => io.emit('rh:donnees-change'));

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
    const token = String((socket.handshake.auth || {}).token || '');
    let compte = null;
    if (token) {
      try {
        const payload = jwt.verify(token, JWT_SECRET);
        compte = db.prepare('SELECT id, login, role, actif FROM utilisateurs WHERE id = ?').get(payload.id);
      } catch {
        // Jeton d'accès expiré → repli sur la session durable (cookie HttpOnly) ci-dessous.
      }
    }
    if (!compte) {
      // Les cookies accompagnent la requête de handshake (même origine) : le refresh token
      // HttpOnly authentifie aussi les sockets, indépendamment de la durée du JWT d'accès.
      const refresh = verifierRefreshToken(parseCookies({ headers: socket.handshake.headers }).refreshToken);
      if (refresh) {
        compte = db.prepare('SELECT id, login, role, actif FROM utilisateurs WHERE id = ?').get(refresh.utilisateur_id);
      }
    }
    if (!compte || !compte.actif) return next(new Error('Non authentifié.'));
    socket.user = { id: compte.id, login: compte.login, role: compte.role };
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

// Photos employés — copie asynchrone pour ne pas bloquer le démarrage (page d'accès)
const photosDir = path.join(__dirname, '..', 'data', 'photos');
if (!fs.existsSync(photosDir)) fs.mkdirSync(photosDir, { recursive: true });
setImmediate(() => {
  const photosReference = path.join(__dirname, 'photos-reference', 'photos');
  if (!fs.existsSync(photosReference)) return;
  try {
    let copiees = 0;
    for (const f of fs.readdirSync(photosReference)) {
      if (!/\.webp$/i.test(f)) continue;
      const dest = path.join(photosDir, f);
      if (!fs.existsSync(dest)) { fs.copyFileSync(path.join(photosReference, f), dest); copiees++; }
    }
    if (copiees > 0) console.log(`[photos] ${copiees} photo(s) de référence copiée(s) dans data/photos`);
  } catch (e) { console.warn('[photos] sync ignorée :', e.message); }
});
app.use('/photos', express.static(photosDir, {
  maxAge: '1h',
  etag: true,
  setHeaders: (res) => res.setHeader('Cache-Control', 'public, max-age=3600'),
}));

app.use((err, req, res, next) => {
  console.error('[api-error]', req.method, req.path, err.message);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ error: err.message || 'Erreur interne.' });
});

// ---- PWA Xmator Terminal (borne biométrique indépendante) ----
const terminalDist = path.join(__dirname, '..', 'terminal', 'dist');
if (fs.existsSync(terminalDist)) {
  app.use('/terminal', express.static(terminalDist, { maxAge: '1y', immutable: true, index: false, etag: true }));
  // Fallback SPA de la borne : les routes internes (/borne, /login…) servent l'index du terminal
  // (le serveur de fichiers statiques ci-dessus répond aux assets ; les autres chemins tombent ici)
  app.get(['/terminal', '/terminal/*'], (req, res) => {
    // Jamais de mise en cache de l'app shell : un téléphone qui a déjà eu une réponse erronée
    // (ex. page d'accueil du SaaS pendant un redémarrage) la reprendrait depuis son cache.
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.sendFile(path.join(terminalDist, 'index.html'));
  });
}

const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  // Assets versionnés (hash dans le nom) → 1 an immutable, ultra-rapide au 2e chargement
  app.use(express.static(clientDist, { maxAge: '1y', immutable: true, index: false, etag: true }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    if (req.path.startsWith('/photos')) return next();
    // index.html toujours frais (no-cache) pour éviter la page blanche après déploiement
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}
app.disable('x-powered-by');

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`API Amicale démarrée sur http://localhost:${PORT} (chat temps réel Socket.IO actif)`);
  // Affiche les identifiants admin à chaque démarrage pour éviter les oublis
  try {
    const admin = db.prepare("SELECT login FROM utilisateurs WHERE role = 'super_admin' LIMIT 1").get();
    if (admin) {
      console.log(`\n╔══════════════════════════════════════════════════════╗`);
      console.log(`║  Identifiants Super Admin (par défaut) :             ║`);
      console.log(`║  Login       : ${admin.login.padEnd(37)}║`);
      console.log(`║  Mot de passe: admin123                             ║`);
      console.log(`║  (réinitialisable via : node resetpw2.js)           ║`);
      console.log(`╚══════════════════════════════════════════════════════╝\n`);
    }
  } catch {}
});
