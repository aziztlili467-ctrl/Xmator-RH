const { Router } = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const AdmZip = require('adm-zip');
const { db } = require('../db');
const { parsePermissions } = require('../middleware/auth');
const router = Router();

const ROLES_VALIDES = ['super_admin', 'consultation', 'moderateur', 'employe'];

const NORMALISER = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // enlève les accents
    .replace(/[^a-z0-9]/g, '');

function genererPassword(len = 10) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length];
  return out;
}

function genererLogin(nom, prenom) {
  let base = `${NORMALISER(prenom)}.${NORMALISER(nom)}`;
  let login = base;
  let n = 1;
  while (db.prepare('SELECT id FROM utilisateurs WHERE login = ?').get(login)) {
    login = `${base}${++n}`;
  }
  return login;
}

const DETAIL = `
  SELECT u.id, u.login, u.role, u.actif, u.employe_id, u.date_creation, u.derniere_connexion, u.permissions,
         e.matricule, e.nom, e.prenom
  FROM utilisateurs u
  LEFT JOIN employes e ON e.id = u.employe_id
`;

// GET /api/comptes — liste des comptes
router.get('/', (req, res) => {
  const rows = db.prepare(DETAIL + ' ORDER BY u.id').all();
  res.json(rows);
});

// POST /api/comptes — créer un compte
router.post('/', (req, res) => {
  const { login, password, role, employe_id, actif, permissions } = req.body || {};
  const lg = String(login || '').trim();
  if (!lg || !password || !role) {
    return res.status(400).json({ error: 'Login, mot de passe et rôle sont obligatoires.' });
  }
  if (!ROLES_VALIDES.includes(role)) {
    return res.status(400).json({ error: 'Rôle invalide.' });
  }
  if (role === 'employe' && !employe_id) {
    return res.status(400).json({ error: 'Un compte employé doit être lié à un employé.' });
  }
  if (employe_id && !db.prepare('SELECT id FROM employes WHERE id = ?').get(Number(employe_id))) {
    return res.status(400).json({ error: 'Employé inconnu.' });
  }
  if (db.prepare('SELECT id FROM utilisateurs WHERE login = ?').get(lg)) {
    return res.status(400).json({ error: 'Ce login existe déjà.' });
  }
  const permsJson = role === 'moderateur' ? JSON.stringify(parsePermissions(permissions)) : null;
  const r = db.prepare('INSERT INTO utilisateurs (login, password_hash, role, employe_id, actif, permissions) VALUES (?,?,?,?,?,?)')
    .run(lg, bcrypt.hashSync(String(password), 10), role, employe_id ? Number(employe_id) : null, actif === false ? 0 : 1, permsJson);
  res.status(201).json(db.prepare(DETAIL + ' WHERE u.id = ?').get(r.lastInsertRowid));
});

// POST /api/comptes/generer-identifiants — unitaire (employe_id) ou en masse (tous / liste)
// Retourne une seule fois les identifiants en clair pour transmission, puis stockés hashés.
router.post('/generer-identifiants', (req, res) => {
  const { tous, employe_ids } = req.body || {};
  let employes;
  if (tous) {
    employes = db.prepare('SELECT id, matricule, nom, prenom FROM employes WHERE actif = 1 ORDER BY id').all();
  } else if (Array.isArray(employe_ids) && employe_ids.length) {
    const marks = employe_ids.map(() => '?').join(',');
    employes = db.prepare(`SELECT id, matricule, nom, prenom FROM employes WHERE id IN (${marks})`).all(...employe_ids.map(Number));
  } else {
    return res.status(400).json({ error: 'Précisez "tous" ou une liste d\'employe_ids.' });
  }

  const generes = [];
  const tx = db.transaction(() => {
    for (const e of employes) {
      const login = genererLogin(e.nom, e.prenom);
      const password = genererPassword();
      const exists = db.prepare('SELECT id FROM utilisateurs WHERE employe_id = ?').get(e.id);
      const hash = bcrypt.hashSync(password, 10);
      if (exists) {
        db.prepare('UPDATE utilisateurs SET login = ?, password_hash = ?, role = \'employe\', actif = 1 WHERE id = ?')
          .run(login, hash, exists.id);
      } else {
        db.prepare('INSERT INTO utilisateurs (login, password_hash, role, employe_id) VALUES (?,?,?,?)')
          .run(login, hash, 'employe', e.id);
      }
      generes.push({ matricule: e.matricule, nom_prenom: `${e.nom} ${e.prenom}`, login, password });
    }
  });
  tx();
  res.json({ generes, count: generes.length });
});

// PUT /api/comptes/:id — modifier rôle / statut / mot de passe / employé lié / permissions
router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const c = db.prepare('SELECT * FROM utilisateurs WHERE id = ?').get(id);
  if (!c) return res.status(404).json({ error: 'Compte introuvable.' });

  const { login, password, role, employe_id, actif, permissions } = req.body || {};
  const next = {
    login: login !== undefined ? String(login).trim() : c.login,
    role: role || c.role,
    employe_id: employe_id !== undefined ? Number(employe_id) : c.employe_id,
    actif: actif !== undefined ? (actif ? 1 : 0) : c.actif,
  };
  if (!next.login) return res.status(400).json({ error: 'Le login ne peut pas être vide.' });
  if (!ROLES_VALIDES.includes(next.role)) {
    return res.status(400).json({ error: 'Rôle invalide.' });
  }
  if (next.role === 'employe' && !next.employe_id) {
    return res.status(400).json({ error: 'Un compte employé doit être lié à un employé.' });
  }
  if (next.login !== c.login && db.prepare('SELECT id FROM utilisateurs WHERE login = ? AND id != ?').get(next.login, id)) {
    return res.status(400).json({ error: 'Ce login existe déjà.' });
  }

  const hash = password ? bcrypt.hashSync(String(password), 10) : c.password_hash;
  const permsJson = next.role === 'moderateur'
    ? JSON.stringify(parsePermissions(permissions !== undefined ? permissions : c.permissions))
    : null;
  db.prepare('UPDATE utilisateurs SET login = ?, password_hash = ?, role = ?, employe_id = ?, actif = ?, permissions = ? WHERE id = ?')
    .run(next.login, hash, next.role, next.employe_id, next.actif, permsJson, id);
  res.json(db.prepare(DETAIL + ' WHERE u.id = ?').get(id));
});

// DELETE /api/comptes/:id — supprimer (interdit sur son propre compte)
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const c = db.prepare('SELECT * FROM utilisateurs WHERE id = ?').get(id);
  if (!c) return res.status(404).json({ error: 'Compte introuvable.' });
  if (req.user && req.user.id === id) return res.status(400).json({ error: 'Impossible de supprimer votre propre compte.' });
  db.prepare('DELETE FROM utilisateurs WHERE id = ?').run(id);
  res.json({ ok: true });
});

// GET /api/comptes/export-csv — export de la liste des comptes (login uniquement, pas de mot de passe)
router.get('/export-csv', (req, res) => {
  const rows = db.prepare(DETAIL + ' ORDER BY u.id').all();
  const lines = [
    'id;login;role;matricule;nom;prenom;actif;date_creation;derniere_connexion',
    ...rows.map((r) =>
      [r.id, r.login, r.role, r.matricule || '', r.nom || '', r.prenom || '', r.actif ? '1' : '0', r.date_creation, r.derniere_connexion || ''].join(';')
    ),
  ];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="comptes.csv"');
  res.send('\uFEFF' + lines.join('\n'));
});

// ---- Photos d'identité : sauvegarde / restauration complètes (ZIP) ----
// Les photos sont des fichiers `{matricule}.webp` dans data/photos — hors base SQLite.
const PHOTOS_DIR = path.join(__dirname, '..', '..', 'data', 'photos');
const uploadZip = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

function horodatage() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}h${p(d.getMinutes())}`;
}

// GET /api/comptes/photos/backup — ZIP complet des photos d'identité (mêmes noms que data/photos,
// à la dernière minute) + manifeste. Téléchargement direct.
router.get('/photos/backup', (req, res) => {
  try {
    const fichiers = fs.existsSync(PHOTOS_DIR)
      ? fs.readdirSync(PHOTOS_DIR).filter((f) => f.toLowerCase().endsWith('.webp')).sort()
      : [];
    const zip = new AdmZip();
    for (const f of fichiers) zip.addFile(f, fs.readFileSync(path.join(PHOTOS_DIR, f)));
    zip.addFile('_manifest.json', Buffer.from(JSON.stringify({
      type: 'photos_identite',
      exporte_le: new Date().toISOString(),
      total: fichiers.length,
      fichiers,
    }, null, 2)));
    const buffer = zip.toBuffer();
    const nom = `photos_identite_${horodatage()}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${nom}"`);
    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: `Échec de la sauvegarde des photos : ${err.message}` });
  }
});

// POST /api/comptes/photos/restaurer — restaure toutes les photos depuis un ZIP généré par la
// sauvegarde (remplace l'ensemble des photos par celles du fichier, mêmes noms de fichiers).
router.post('/photos/restaurer', uploadZip.single('fichier'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier ZIP reçu.' });
  if (req.file.buffer.length < 4 || req.file.buffer.toString('latin1', 0, 2) !== 'PK') {
    return res.status(400).json({ error: 'Fichier invalide : ce n\'est pas un ZIP (utilisez le fichier généré par « Sauvegarder les photos »).' });
  }
  try {
    const zip = new AdmZip(req.file.buffer);
    const entries = zip.getEntries().filter((e) => !e.isDirectory && e.entryName.toLowerCase().endsWith('.webp'));
    if (!entries.length) return res.status(400).json({ error: 'Aucune photo .webp trouvée dans le ZIP.' });
    if (!fs.existsSync(PHOTOS_DIR)) fs.mkdirSync(PHOTOS_DIR, { recursive: true });
    // Restauration complète : on remplace toutes les photos existantes par celles du ZIP.
    for (const f of fs.readdirSync(PHOTOS_DIR)) {
      if (f.toLowerCase().endsWith('.webp')) {
        try { fs.unlinkSync(path.join(PHOTOS_DIR, f)); } catch {}
      }
    }
    let restaurees = 0;
    for (const e of entries) {
      const nom = path.basename(e.entryName); // neutralise tout chemin, on garde juste le nom du fichier
      if (!nom.toLowerCase().endsWith('.webp')) continue;
      fs.writeFileSync(path.join(PHOTOS_DIR, nom), e.getData());
      restaurees++;
    }
    res.json({ ok: true, restaurees });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: `Échec de la restauration des photos : ${err.message}` });
  }
});

module.exports = router;