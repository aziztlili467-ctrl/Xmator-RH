const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

require('./seed')();

const app = express();
// CORS : en production, n'autoriser que les origines listées dans CORS_ORIGIN (séparées par des virgules).
// Si CORS_ORIGIN est vide (défaut), aucun en-tête CORS n'est émis : le client est servi par ce même serveur.
const corsOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim()) : false;
app.use(cors({ origin: corsOrigins }));
app.use(express.json({ limit: '10mb' }));

const { requireAuth, requireRole, requireModule } = require('./middleware/auth');
const { auditLog } = require('./middleware/audit');

// Auth publique (login) — /me et /logout sont protégés en interne
app.use('/api/auth', require('./routes/auth'));

// Tout le reste des /api exige un compte authentifié
app.use('/api', requireAuth);

// Mouchard : journalise chaque opération authentifiée (lecture/ajout/modification/suppression) — super_admin uniquement
app.use('/api/mouchard', requireRole('super_admin'), require('./routes/mouchard'));
app.use('/api', auditLog);

// Super Admin uniquement — gestion des comptes, import, maintenance, calendrier de l'année
app.use('/api/comptes', requireRole('super_admin'), require('./routes/comptes'));
app.use('/api/maintenance', requireRole('super_admin'), require('./routes/maintenance'));
app.use('/api/import', requireRole('super_admin'), require('./routes/import'));
app.use('/api/calendrier', requireRole('super_admin'), require('./routes/calendrier'));

// Workflow congés / arrêts : écritures et décisions selon les permissions du modérateur
app.use('/api/demandes-conge', requireModule('demandes'), require('./routes/demandes-conge'));
app.use('/api/arrets-maladie', requireModule('maladie'), require('./routes/arrets-maladie'));

// Lecture pour super_admin + consultation + moderateur ; écritures par module (permissions du modérateur)
const lecture = requireRole('super_admin', 'consultation', 'moderateur');

app.use('/api/dashboard', lecture, require('./routes/dashboard'));
app.use('/api/stats-journal', lecture, require('./routes/stats-journal'));
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

// Employés : GET passe au router (qui contrôle : liste/détail super_admin+consultation+moderateur,
// fiche/mouvements/stats par matricule avec isolation employé) ; écritures par module 'employes'
app.use('/api/employes', (req, res, next) => {
  if (req.method !== 'GET') return requireModule('employes')(req, res, next);
  return next();
}, require('./routes/employes'));

// Photos employés (publiques — chargées par <img>) ; source unique = data/photos (ce que lisent et
// écrivent les uploads). Cache navigateur 1 h (re-upload visible sous 1 h ; le SW rafraîchit déjà
// en arrière-plan en stale-while-revalidate sur localhost).
const photosDir = path.join(__dirname, '..', 'data', 'photos');
if (!fs.existsSync(photosDir)) fs.mkdirSync(photosDir, { recursive: true });
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
app.listen(PORT, () => {
  console.log(`API Amicale démarrée sur http://localhost:${PORT}`);
});
