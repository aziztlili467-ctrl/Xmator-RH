const { Router } = require('express');
const { db } = require('../db');
const { parseRepos } = require('../utils/jourOuvrable');
const router = Router();

const REPOS_DEFAULT = '0,6';
// Canonicalise les jours de repos hebdomadaire (0=dimanche … 6=samedi) : ensemble trié, '0,6' par défaut.
function normRepos(v) {
  const set = parseRepos(v);
  if (v == null || v === '') return REPOS_DEFAULT;
  return [...set].sort((a, b) => a - b).join(',');
}

function readBody(req, res) {
  const libelle = (req.body || {}).libelle;
  if (!libelle || !String(libelle).trim()) {
    res.status(400).json({ error: 'Le libellé de la catégorie est obligatoire.' });
    return null;
  }
  return { libelle: String(libelle).trim(), repos: normRepos(req.body.repos_hebdomadaire) };
}

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM categories ORDER BY libelle').all());
});

router.post('/', (req, res) => {
  const body = readBody(req, res);
  if (!body) return;
  try {
    const r = db.prepare('INSERT INTO categories (libelle, repos_hebdomadaire) VALUES (?, ?)').run(body.libelle, body.repos);
    res.status(201).json({ id: r.lastInsertRowid, libelle: body.libelle, repos_hebdomadaire: body.repos });
  } catch (e) {
    res.status(400).json({ error: 'Cette catégorie existe déjà.' });
  }
});

router.put('/:id', (req, res) => {
  const body = readBody(req, res);
  if (!body) return;
  const conflict = db.prepare('SELECT id FROM categories WHERE libelle = ? AND id != ?').get(body.libelle, req.params.id);
  if (conflict) return res.status(400).json({ error: 'Cette catégorie existe déjà.' });
  const r = db.prepare('UPDATE categories SET libelle = ?, repos_hebdomadaire = ? WHERE id = ?').run(body.libelle, body.repos, req.params.id);
  if (r.changes === 0) return res.status(404).json({ error: 'Catégorie introuvable.' });
  res.json({ ok: true, id: Number(req.params.id), libelle: body.libelle, repos_hebdomadaire: body.repos });
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const nb = db.prepare('SELECT COUNT(*) AS n FROM employes WHERE categorie_id = ?').get(id).n;
  if (nb > 0) {
    return res.status(400).json({
      error: `Impossible de supprimer cette catégorie : ${nb} employé(s) y sont rattachés. Déplacez-les d'abord ou modifiez leur catégorie.`,
    });
  }
  const r = db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  if (r.changes === 0) return res.status(404).json({ error: 'Catégorie introuvable.' });
  res.json({ ok: true });
});

module.exports = router;
