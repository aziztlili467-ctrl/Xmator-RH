const { Router } = require('express');
const multer = require('multer');
const { db } = require('../db');

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ---- Import CSV / TXT (séparateur ;) ----
router.post('/import', upload.single('fichier'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu.' });

  const raw = req.file.buffer.toString('utf-8');
  const lignes = raw.split(/\r?\n/).filter((l) => l.trim());
  if (!lignes.length) return res.status(400).json({ error: 'Fichier vide.' });

  // Détection de l'en-tête : si la 1re ligne contient « Rubrique » (insensible casse), on la saute
  const premiereLigne = lignes[0];
  const headerRe = /^\s*rubrique\s*[;,.\t|\-]\s*grade/i;
  const startIdx = headerRe.test(premiereLigne) ? 1 : 0;

  let importees = 0;
  let erreurs = [];
  const ins = db.prepare(
    'INSERT INTO grille_salaire (rubrique, grade, classe, echelon, valeur) VALUES (?, ?, ?, ?, ?)'
  );

  const runImport = db.transaction(() => {
    for (let i = startIdx; i < lignes.length; i++) {
      const raw = lignes[i].trim();
      if (!raw || raw.startsWith('#') || raw.startsWith('//')) continue; // commentaires

      // Détection auto du séparateur (; > , > tab > |)
      let sep = ';';
      if (!raw.includes(';')) {
        if (raw.includes(',')) sep = ',';
        else if (raw.includes('\t')) sep = '\t';
        else if (raw.includes('|')) sep = '|';
      }

      const parts = raw.split(sep).map((s) => s.trim());
      if (parts.length < 5) {
        erreurs.push({ ligne: i + 1, contenu: raw, erreur: `Moins de 5 colonnes (${parts.length})` });
        continue;
      }

      const [rubrique, grade, classe, echelon, valeurStr] = parts;
      if (!rubrique || !grade || !classe || !echelon) {
        erreurs.push({ ligne: i + 1, contenu: raw, erreur: 'Champ vide (Rubrique/Grade/Classe/Echelon)' });
        continue;
      }

      const valeur = parseFloat(valeurStr.replace(/\s/g, '').replace(',', '.'));
      if (isNaN(valeur)) {
        erreurs.push({ ligne: i + 1, contenu: raw, erreur: `Valeur invalide : « ${valeurStr} »` });
        continue;
      }

      ins.run(rubrique, grade, classe, echelon, valeur);
      importees++;
    }
  });

  runImport();
  const total = db.prepare('SELECT COUNT(*) AS n FROM grille_salaire').get().n;
  res.json({
    ok: true,
    importees,
    erreurs: erreurs.length,
    detailsErreurs: erreurs,
    total,
    message: importees > 0
      ? `${importees} ligne(s) importée(s). ${erreurs.length ? `${erreurs.length} erreur(s) ignorée(s). ` : ''}Total en base : ${total}.`
      : `Aucune ligne importée. ${erreurs.length} erreur(s).`,
  });
});

// ---- Liste complète ----
router.get('/', (req, res) => {
  const lignes = db.prepare('SELECT * FROM grille_salaire ORDER BY rubrique, grade, classe, echelon').all();
  res.json(lignes);
});

// ---- Créer ----
router.post('/', (req, res) => {
  const { rubrique, grade, classe, echelon, valeur } = req.body || {};
  if (!rubrique || !grade || !classe || !echelon) {
    return res.status(400).json({ error: 'Tous les champs sont requis (Rubrique, Grade, Classe, Echelon).' });
  }
  const val = Number(valeur) || 0;
  const r = db.prepare(
    'INSERT INTO grille_salaire (rubrique, grade, classe, echelon, valeur) VALUES (?, ?, ?, ?, ?)'
  ).run(String(rubrique).trim(), String(grade).trim(), String(classe).trim(), String(echelon).trim(), val);
  const ligne = db.prepare('SELECT * FROM grille_salaire WHERE id = ?').get(r.lastInsertRowid);
  res.json(ligne);
});

// ---- Modifier ----
router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM grille_salaire WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Ligne introuvable.' });

  const { rubrique, grade, classe, echelon, valeur } = req.body || {};
  if (!rubrique || !grade || !classe || !echelon) {
    return res.status(400).json({ error: 'Tous les champs sont requis.' });
  }
  const val = Number(valeur) || 0;
  db.prepare(
    `UPDATE grille_salaire SET rubrique = ?, grade = ?, classe = ?, echelon = ?, valeur = ?,
     updated_at = datetime('now','localtime') WHERE id = ?`
  ).run(String(rubrique).trim(), String(grade).trim(), String(classe).trim(), String(echelon).trim(), val, id);
  const ligne = db.prepare('SELECT * FROM grille_salaire WHERE id = ?').get(id);
  res.json(ligne);
});

// ---- Supprimer ----
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM grille_salaire WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Ligne introuvable.' });
  db.prepare('DELETE FROM grille_salaire WHERE id = ?').run(id);
  res.json({ ok: true, message: 'Ligne supprimée.' });
});

// ---- Supprimer toutes les lignes d'une rubrique ----
router.delete('/rubrique/:rubrique', (req, res) => {
  const rubrique = String(req.params.rubrique || '');
  if (!rubrique) return res.status(400).json({ error: 'Rubrique requise.' });
  const r = db.prepare('DELETE FROM grille_salaire WHERE rubrique = ?').run(rubrique);
  res.json({ ok: true, supprimees: r.changes, message: `${r.changes} ligne(s) supprimée(s) pour « ${rubrique} ».` });
});

// ---- Supprimer TOUTE la grille ----
router.delete('/all', (req, res) => {
  const r = db.prepare('DELETE FROM grille_salaire').run();
  res.json({ ok: true, supprimees: r.changes, message: `${r.changes} ligne(s) supprimée(s). La grille est vide.` });
});

// ---- Télécharger la grille en CSV (;) ----
router.get('/export', (req, res) => {
  const lignes = db.prepare('SELECT rubrique, grade, classe, echelon, valeur FROM grille_salaire ORDER BY rubrique, grade, classe, echelon').all();
  if (!lignes.length) return res.status(404).json({ error: 'Grille vide — rien à télécharger.' });

  const header = 'Rubrique;Grade;Classe;Echelon;Valeur';
  const csv = [header, ...lignes.map((l) => `${l.rubrique};${l.grade};${l.classe};${l.echelon};${Number(l.valeur).toFixed(3)}`)].join('\n');
  const buf = Buffer.from(csv, 'utf-8');

  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const nom = `grille_salaire_${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${nom}"`);
  res.send(buf);
});

module.exports = router;
