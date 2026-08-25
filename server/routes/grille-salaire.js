const { Router } = require('express');
const { db } = require('../db');

const router = Router();

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

module.exports = router;
