const { Router } = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { db } = require('../db');

const router = Router();

const BACKUP_DIR = path.join(__dirname, '..', '..', 'data', 'backups');
const PHOTOS_DIR = path.join(__dirname, '..', '..', 'data', 'photos');
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

// ---- Mot de passe de sécurité (zone de danger) ----
// Stocké UNIQUEMENT hashé (bcrypt) dans settings.danger_password_hash — jamais en clair.
const DEFAULT_DANGER_HASH = '$2b$10$mjJP6oLMARySDIgg/kuiLuWIiBJm6WR2bQfnLiD/VlGRwrBWWV2oi';

function garantirMotDePasseDanger() {
  const h = db.prepare("SELECT valeur FROM settings WHERE cle = 'danger_password_hash'").get();
  if (!h) {
    db.prepare("INSERT OR REPLACE INTO settings (cle, valeur) VALUES ('danger_password_hash', ?)").run(DEFAULT_DANGER_HASH);
  }
}
garantirMotDePasseDanger();

function verifierMotDePasseDanger(req) {
  const pwd = String((req.body || {}).mot_de_passe || '');
  if (!pwd) return false;
  const h = db.prepare("SELECT valeur FROM settings WHERE cle = 'danger_password_hash'").get();
  if (!h || !h.valeur) return false;
  return bcrypt.compareSync(pwd, h.valeur);
}

// Tables copiées lors d'une restauration — TOUTES les tables de l'application (toutes les rubriques :
// employés, catégories, comptes, soldes & mouvements, demandes de congé, arrêts maladie, présences &
// pointages, horaires de travail, calendrier de l'année, journal d'activité, réglages). On ne restaure
// QUE les tables présentes dans le fichier (une sauvegarde plus ancienne laisse les autres intactes).
const TABLES = [
  'categories', 'employes', 'utilisateurs', 'mouvements', 'demandes_conge', 'arrets_maladie',
  'pointages', 'horaires_travail', 'horaires_pointages', 'corrections_pointages',
  'jours_travail', 'jours_feries', 'config_annees', 'audit_logs', 'settings',
  'sessions_appareils', 'messages_chat', 'codes_paie', 'codes_importes',
  'notifications_absence',
];

function horodatage() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}h${p(d.getMinutes())}`;
}

function nomFichierBackup(libelle) {
  let nom = `amicale_${horodatage()}`;
  const label = String(libelle || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  if (label) nom += `_${label}`;
  nom += '.db';
  let final = nom;
  let i = 2;
  while (fs.existsSync(path.join(BACKUP_DIR, final))) {
    final = nom.replace(/\.db$/, `_${i}.db`);
    i++;
  }
  return final;
}

// Remplace le contenu des tables de l'app par celui d'un fichier SQLite (attached).
function restaurerDepuis(chemin) {
  const esc = String(chemin).replace(/'/g, "''");
  db.prepare(`ATTACH DATABASE '${esc}' AS bck`).run();
  try {
    const backupTables = db
      .prepare("SELECT name FROM bck.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all()
      .map((r) => r.name);

    let tables;
    db.pragma('foreign_keys = OFF');
    try {
      tables = db.transaction(() => {
        const counts = {};
        // On ne restaure que les tables réellement présentes dans le fichier de sauvegarde :
        // une table absente d'une sauvegarde plus ancienne reste telle quelle (aucune perte).
        for (const t of backupTables) {
          if (!TABLES.includes(t)) continue;
          db.prepare(`DELETE FROM "${t}"`).run();
          // Intersection des colonnes fichier ↔ base courante : une sauvegarde plus ancienne
          // (schéma plus court) ou un code plus ancien que le fichier ne font plus échouer la
          // restauration — les colonnes inconnues gardent leur valeur par défaut.
          const colsBck = db.prepare(`PRAGMA bck.table_info("${t}")`).all().map((c) => c.name);
          const colsActuelles = db.prepare(`PRAGMA table_info("${t}")`).all().map((c) => c.name);
          const cols = colsBck.filter((c) => colsActuelles.includes(c));
          if (!cols.length) { counts[t] = 0; continue; }
          const colList = cols.map((c) => `"${c}"`).join(',');
          counts[t] = db
            .prepare(`INSERT INTO "${t}" (${colList}) SELECT ${colList} FROM "bck"."${t}"`)
            .run().changes;
        }
        // ⚠️ sqlite_sequence est exclue de backupTables (filtre sqlite_%) : la chercher
        // directement dans le schéma du fichier, sinon les compteurs AUTOINCREMENT
        // (numéros séquentiels demandes/arrêts) repartent de zéro après restauration.
        const seqBck = db.prepare("SELECT name FROM bck.sqlite_master WHERE type='table' AND name='sqlite_sequence'").get();
        const seqLocal = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sqlite_sequence'").get();
        if (seqLocal && seqBck) {
          db.prepare('DELETE FROM sqlite_sequence').run();
          db.prepare('INSERT INTO sqlite_sequence (name, seq) SELECT name, seq FROM bck.sqlite_sequence').run();
        }
        const violations = db.prepare('PRAGMA foreign_key_check').all();
        if (violations.length) {
          throw new Error(`Cohérence (clés étrangères) non respectée dans la sauvegarde : ${violations.length} violation(s).`);
        }
        return counts;
      })();
    } finally {
      db.pragma('foreign_keys = ON');
    }

    // Photos : restaurées depuis le tableau photos_bak de la sauvegarde (s'il existe).
    // Les photos sont des fichiers sur disque, hors base SQLite.
    let photoCount = 0;
    if (backupTables.includes('photos_bak')) {
      const photos = db.prepare('SELECT matricule, data FROM bck.photos_bak').all();
      if (!fs.existsSync(PHOTOS_DIR)) fs.mkdirSync(PHOTOS_DIR, { recursive: true });
      for (const f of fs.readdirSync(PHOTOS_DIR)) {
        if (f.toLowerCase().endsWith('.webp')) {
          try { fs.unlinkSync(path.join(PHOTOS_DIR, f)); } catch {}
        }
      }
      for (const p of photos) {
        try {
          fs.writeFileSync(path.join(PHOTOS_DIR, `${p.matricule}.webp`), p.data);
          photoCount++;
        } catch {}
      }
    }
    return { tables, photoCount };
  } finally {
    try { db.prepare('DETACH DATABASE bck').run(); } catch {}
  }
}

// ---- Noyau de sauvegarde (utilisé par la création manuelle ET les sauvegardes automatiques) ----
// 1) checkpoint WAL → toutes les écritures en attente sont rapatriées dans le fichier principal ;
// 2) db.backup() → copie complète de la base ;
// 3) photos_bak → intégration des photos d'identité (fichiers hors base) dans le fichier ;
// 4) VÉRIFICATION : compteurs des tables clés + integrity_check du fichier produit —
//    une sauvegarde incomplète lève une erreur au lieu de créer un faux sentiment de sécurité.
async function creerFichierSauvegarde(chemin) {
  db.pragma('wal_checkpoint(TRUNCATE)');
  await db.backup(chemin);

  // Vérification immédiate : le fichier doit refléter exactement la base.
  const verif = new Database(chemin, { readonly: true });
  try {
    for (const t of ['employes', 'mouvements', 'demandes_conge', 'arrets_maladie', 'pointages', 'horaires_travail']) {
      const a = db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
      const b = verif.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
      if (a !== b) {
        throw new Error(`Sauvegarde incomplète détectée (${t} : ${b} dans le fichier vs ${a} en base) — réessayez.`);
      }
    }
    const integrite = verif.prepare('PRAGMA integrity_check').get();
    if (!integrite || integrite.integrity_check !== 'ok') throw new Error('Fichier de sauvegarde corrompu (integrity_check).');
  } finally {
    verif.close();
  }

  // Intégration des photos (best effort : ne bloquent jamais la sauvegarde)
  let nbPhotos = 0;
  try {
    const bck = new Database(chemin);
    bck.prepare('CREATE TABLE IF NOT EXISTS photos_bak (matricule TEXT PRIMARY KEY, data BLOB NOT NULL)').run();
    const ins = bck.prepare('INSERT OR REPLACE INTO photos_bak (matricule, data) VALUES (?, ?)');
    if (fs.existsSync(PHOTOS_DIR)) {
      for (const f of fs.readdirSync(PHOTOS_DIR)) {
        if (f.toLowerCase().endsWith('.webp')) {
          ins.run(f.replace(/\.webp$/i, ''), fs.readFileSync(path.join(PHOTOS_DIR, f)));
          nbPhotos++;
        }
      }
    }
    bck.close();
  } catch (e) { /* best effort */ }
  return nbPhotos;
}

// ---- Sauvegardes automatiques : chaque mise à jour d'une rubrique/données est incluse ----
// Déclenchées par le middleware `surveillerEcritures` (index.js) après toute écriture réussie,
// avec anti-rebond (45 s après la dernière écriture) et cadence minimale (1 par 5 min max).
const AUTO_PREFIXE = 'auto_';
const AUTO_GARDEES = 24;
const AUTO_DELAI_MS = 45 * 1000;
const AUTO_CADENCE_MIN_MS = 5 * 60 * 1000;
let autoTimer = null;
let autoDerniereFin = 0;
let autoEnCours = false;

function nettoyerAnciennes(prefixe, garder) {
  try {
    const fichiers = fs.readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith(prefixe) && f.toLowerCase().endsWith('.db'))
      .map((f) => ({ f, t: fs.statSync(path.join(BACKUP_DIR, f)).mtime.getTime() }))
      .sort((a, b) => b.t - a.t);
    for (const x of fichiers.slice(garder)) {
      try { fs.unlinkSync(path.join(BACKUP_DIR, x.f)); } catch {}
    }
  } catch {}
}

async function executerSauvegardeAuto(motif) {
  if (autoEnCours) return;
  autoEnCours = true;
  try {
    let nom = `${AUTO_PREFIXE}amicale_${horodatage()}`;
    let chemin = path.join(BACKUP_DIR, `${nom}.db`);
    let i = 2;
    while (fs.existsSync(chemin)) { chemin = path.join(BACKUP_DIR, `${nom}_${i}.db`); i++; }
    await creerFichierSauvegarde(chemin);
    autoDerniereFin = Date.now();
    nettoyerAnciennes(AUTO_PREFIXE, AUTO_GARDEES);
    console.log(`[sauvegarde auto] ${path.basename(chemin)} — déclenchée par : ${motif}`);
  } catch (e) {
    console.warn('[sauvegarde auto] échec (réessai à la prochaine écriture) :', e.message);
  } finally {
    autoEnCours = false;
  }
}

function planifierSauvegardeAuto(motif) {
  if (autoTimer) clearTimeout(autoTimer);
  autoTimer = setTimeout(() => {
    autoTimer = null;
    if (Date.now() - autoDerniereFin < AUTO_CADENCE_MIN_MS) return;
    executerSauvegardeAuto(motif);
  }, AUTO_DELAI_MS);
}

// Middleware à monter sur /api (après auditLog) : planifie une sauvegarde auto après chaque
// écriture réussie (POST/PUT/DELETE en 2xx). Les lectures, connexions et la création manuelle
// de sauvegarde sont exclues.
function surveillerEcritures(req, res, next) {
  if (req.method === 'GET') return next();
  const url = req.originalUrl || req.url || '';
  if (/^\/api\/auth\//.test(url)) return next();
  if (/^\/api\/maintenance\/backup/.test(url)) return next();
  res.on('finish', () => {
    if (res.statusCode >= 400) return;
    planifierSauvegardeAuto(`${req.method} ${url}`);
  });
  return next();
}

// Snapshot de sécurité AVANT une opération destructive (restauration, réinitialisation).
// Fichiers préfixés `_securite_` : invisibles dans la liste/téléchargement (filtre _*),
// conservés au nombre de 10 — un filet de protection contre une mauvaise manipulation.
async function snapshotSecurite(type) {
  try {
    const nomBase = `_securite_${type}_${horodatage()}`;
    let nom = `${nomBase}.db`;
    let i = 2;
    while (fs.existsSync(path.join(BACKUP_DIR, nom))) { nom = `${nomBase}_${i}.db`; i++; }
    await creerFichierSauvegarde(path.join(BACKUP_DIR, nom));
    nettoyerAnciennes('_securite_', 10);
    console.log(`[sécurité] snapshot créé avant ${type} : ${nom}`);
  } catch (e) {
    console.warn(`[sécurité] snapshot avant ${type} ignoré :`, e.message);
  }
}

// ---- Sauvegarde : création (horodatée + libellé optionnel) ----
router.post('/backup', async (req, res) => {
  try {
    const nom = nomFichierBackup((req.body || {}).libelle);
    const chemin = path.join(BACKUP_DIR, nom);
    const nbPhotos = await creerFichierSauvegarde(chemin);

    const st = fs.statSync(chemin);
    res.json({
      ok: true,
      nom,
      taille: st.size,
      date: st.mtime,
      nbEmployes: db.prepare('SELECT COUNT(*) AS n FROM employes').get().n,
      nbPointages: db.prepare('SELECT COUNT(*) AS n FROM pointages').get().n,
      nbHoraires: db.prepare('SELECT COUNT(*) AS n FROM horaires_travail').get().n,
      nbPhotos,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: `Échec de la sauvegarde : ${err.message}` });
  }
});

// ---- Liste des sauvegardes du serveur ----
router.get('/backups', (req, res) => {
  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.toLowerCase().endsWith('.db') && !f.startsWith('_'))
    .map((f) => {
      const st = fs.statSync(path.join(BACKUP_DIR, f));
      return { nom: f, taille: st.size, date: st.mtime, auto: f.startsWith(AUTO_PREFIXE) };
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  res.json(files);
});

// ---- Téléchargement d'une sauvegarde ----
router.get('/backups/:nom', (req, res) => {
  const nom = path.basename(String(req.params.nom || ''));
  if (!nom.toLowerCase().endsWith('.db') || nom.startsWith('_')) {
    return res.status(400).json({ error: 'Nom de sauvegarde invalide.' });
  }
  const chemin = path.join(BACKUP_DIR, nom);
  if (!fs.existsSync(chemin)) return res.status(404).json({ error: 'Sauvegarde introuvable.' });
  res.download(chemin, nom);
});

// ---- Restauration depuis un fichier uploadé ----
router.post('/restaurer', upload.single('fichier'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu.' });
  if (req.file.size < 16 || req.file.buffer.toString('latin1', 0, 16) !== 'SQLite format 3\u0000') {
    return res.status(400).json({ error: 'Fichier invalide : ce n\'est pas une base SQLite.' });
  }
  const tmp = path.join(BACKUP_DIR, `_restore_${Date.now()}.db`);
  fs.writeFileSync(tmp, req.file.buffer);
  try {
    // Filet de sécurité : l'état actuel est sauvegardé avant d'être remplacé
    await snapshotSecurite('avant_restaurer');
    const r = restaurerDepuis(tmp);
    res.json({ ok: true, tables: r.tables, photoCount: r.photoCount, nbEmployes: db.prepare('SELECT COUNT(*) AS n FROM employes').get().n });
  } catch (err) {
    res.status(400).json({ error: err.message });
  } finally {
    try { fs.unlinkSync(tmp); } catch {}
  }
});

// ---- Restauration depuis une sauvegarde existante du serveur ----
router.post('/restaurer/:nom', async (req, res) => {
  const nom = path.basename(String(req.params.nom || ''));
  if (!nom.toLowerCase().endsWith('.db') || nom.startsWith('_')) {
    return res.status(400).json({ error: 'Nom de sauvegarde invalide.' });
  }
  const chemin = path.join(BACKUP_DIR, nom);
  if (!fs.existsSync(chemin)) return res.status(404).json({ error: 'Sauvegarde introuvable.' });
  try {
    // Filet de sécurité : l'état actuel est sauvegardé avant d'être remplacé
    await snapshotSecurite('avant_restaurer');
    const r = restaurerDepuis(chemin);
    res.json({ ok: true, nom, tables: r.tables, photoCount: r.photoCount, nbEmployes: db.prepare('SELECT COUNT(*) AS n FROM employes').get().n });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ---- Réinitialisations (état vide) — protégées par le mot de passe de sécurité ----
// Chaque réinitialisation crée d'abord un snapshot de sécurité automatique de l'état actuel.

// Réinitialiser les noms : supprime tous les employés + leurs données + comptes employé
router.post('/reset/employes', async (req, res) => {
  if (!verifierMotDePasseDanger(req)) {
    return res.status(403).json({ error: 'Mot de passe de sécurité incorrect.' });
  }
  await snapshotSecurite('avant_reset_employes');
  db.transaction(() => {
    db.prepare("DELETE FROM utilisateurs WHERE role = 'employe'").run();
    db.prepare('DELETE FROM mouvements').run();
    db.prepare('DELETE FROM demandes_conge').run();
    db.prepare('DELETE FROM arrets_maladie').run();
    db.prepare('DELETE FROM employes').run();
    if (fs.existsSync(PHOTOS_DIR)) {
      for (const f of fs.readdirSync(PHOTOS_DIR)) {
        if (f.toLowerCase().endsWith('.webp')) fs.unlinkSync(path.join(PHOTOS_DIR, f));
      }
    }
  })();
  res.json({ ok: true, message: 'Employés (noms), photos et toutes leurs données supprimés. Comptes non-employé et catégories conservés. Un snapshot de sécurité de l\'état antérieur a été créé.' });
});

// Réinitialiser les soldes de congé : tous les mouvements de congé supprimés
router.post('/reset/soldes-conge', async (req, res) => {
  if (!verifierMotDePasseDanger(req)) {
    return res.status(403).json({ error: 'Mot de passe de sécurité incorrect.' });
  }
  await snapshotSecurite('avant_reset_soldes_conge');
  const r = db.prepare("DELETE FROM mouvements WHERE solde_type = 'conge'").run();
  res.json({ ok: true, message: `Soldes de congé remis à 0 (${r.changes} mouvement(s) supprimé(s)). Snapshot de sécurité créé.` });
});

// Réinitialiser les soldes maladie : tous les mouvements de maladie supprimés
router.post('/reset/soldes-maladie', async (req, res) => {
  if (!verifierMotDePasseDanger(req)) {
    return res.status(403).json({ error: 'Mot de passe de sécurité incorrect.' });
  }
  await snapshotSecurite('avant_reset_soldes_maladie');
  const r = db.prepare("DELETE FROM mouvements WHERE solde_type = 'maladie'").run();
  res.json({ ok: true, message: `Soldes maladie remis à 0 (${r.changes} mouvement(s) supprimé(s)). Snapshot de sécurité créé.` });
});

// Réinitialiser les opérations du journal des stats : tous les mouvements + demandes + arrêts supprimés
router.post('/reset/journal', async (req, res) => {
  if (!verifierMotDePasseDanger(req)) {
    return res.status(403).json({ error: 'Mot de passe de sécurité incorrect.' });
  }
  await snapshotSecurite('avant_reset_journal');
  const r = db.transaction(() => {
    const m = db.prepare('DELETE FROM mouvements').run().changes;
    const d = db.prepare('DELETE FROM demandes_conge').run().changes;
    const a = db.prepare('DELETE FROM arrets_maladie').run().changes;
    return { mouvements: m, demandes_conge: d, arrets_maladie: a };
  })();
  res.json({ ok: true, message: `Journal des statistiques vidé (${r.mouvements} mouvement(s), ${r.demandes_conge} demande(s), ${r.arrets_maladie} arrêt(s) supprimés). Snapshot de sécurité créé.` });
});

module.exports = router;
module.exports.surveillerEcritures = surveillerEcritures;
module.exports.planifierSauvegardeAuto = planifierSauvegardeAuto;