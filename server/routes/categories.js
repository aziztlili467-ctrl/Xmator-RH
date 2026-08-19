const { Router } = require('express');
const { db } = require('../db');
const router = Router();

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM categories ORDER BY libelle').all());
});

router.post('/', (req, res) => {
  const { libelle } = req.body || {};
  if (!libelle || !String(libelle).trim()) {
    return res.status(400).json({ error: 'Le libellé de la catégorie est obligatoire.' });
  }
  try {
    const r = db.prepare('INSERT INTO categories (libelle) VALUES (?)').run(String(libelle).trim());
    res.status(201).json({ id: r.lastInsertRowid, libelle: String(libelle).trim() });
  } catch (e) {
    res.status(400).json({ error: 'Cette catégorie existe déjà.' });
  }
});

router.put('/:id', (req, res) => {
  const { libelle } = req.body || {};
  if (!libelle || !String(libelle).trim()) {
    return res.status(400).json({ error: 'Le libellé de la catégorie est obligatoire.' });
  }
  const lib = String(libelle).trim();
  const conflict = db.prepare('SELECT id FROM categories WHERE libelle = ? AND id != ?').get(lib, req.params.id);
  if (conflict) return res.status(400).json({ error: 'Cette catégorie existe déjà.' });
  const r = db.prepare('UPDATE categories SET libelle = ? WHERE id = ?').run(lib, req.params.id);
  if (r.changes === 0) return res.status(404).json({ error: 'Catégorie introuvable.' });
  res.json({ ok: true, id: Number(req.params.id), libelle: lib });
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
