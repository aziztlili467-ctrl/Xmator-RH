const { Router } = require('express');
const { db } = require('../db');

const router = Router();

// Heure au format 'HH:mm' (00:00 → 23:59)
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

// Lecture : toutes les catégories rejoignant les tolérances de retard/de sortie configurées.
// Chaque ligne : { categorie_id, libelle, entree_reglementaire, sortie_reglementaire }
// ('' = non configuré → l'horaire par défaut reste appliqué dans Présences & pointages).
router.get('/', (req, res) => {
  const lignes = db.prepare(`
    SELECT c.id AS categorie_id, c.libelle,
           COALESCE(t.entree_reglementaire, '') AS entree_reglementaire,
           COALESCE(t.sortie_reglementaire, '') AS sortie_reglementaire
    FROM categories c
    LEFT JOIN tolerances_categorie t ON t.categorie_id = c.id
    ORDER BY c.libelle
  `).all();
  res.json(lignes);
});

// Enregistre les tolérances par catégorie.
// Corps : { lignes: [{ categorie_id, entree_reglementaire?, sortie_reglementaire? }] }
// ('HH:mm' ou vide pour réinitialiser → horaire par défaut). Seules les catégories existantes sont traitées.
router.put('/', (req, res) => {
  const corps = (req.body || {}).lignes;
  if (!Array.isArray(corps) || corps.length === 0) {
    return res.status(400).json({ error: 'Aucune ligne de tolérance fournie.' });
  }
  const upsert = db.prepare(`
    INSERT INTO tolerances_categorie (categorie_id, entree_reglementaire, sortie_reglementaire, updated_at)
    VALUES (?, ?, ?, datetime('now','localtime'))
    ON CONFLICT(categorie_id) DO UPDATE SET
      entree_reglementaire = excluded.entree_reglementaire,
      sortie_reglementaire = excluded.sortie_reglementaire,
      updated_at = datetime('now','localtime')
  `);
  const existe = db.prepare('SELECT id FROM categories WHERE id = ?');
  const tx = db.transaction(() => {
    for (const l of corps) {
      const id = Number(l.categorie_id);
      if (!Number.isInteger(id) || !existe.get(id)) continue;
      const entree = String(l.entree_reglementaire ?? '').trim();
      const sortie = String(l.sortie_reglementaire ?? '').trim();
      if (entree && !HHMM.test(entree)) throw new Error(`Heure d'entrée invalide pour la catégorie ${id} (attendu HH:mm).`);
      if (sortie && !HHMM.test(sortie)) throw new Error(`Heure de sortie invalide pour la catégorie ${id} (attendu HH:mm).`);
      upsert.run(id, entree, sortie);
    }
  });
  try {
    tx();
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  const lignes = db.prepare(`
    SELECT c.id AS categorie_id, c.libelle,
           COALESCE(t.entree_reglementaire, '') AS entree_reglementaire,
           COALESCE(t.sortie_reglementaire, '') AS sortie_reglementaire
    FROM categories c
    LEFT JOIN tolerances_categorie t ON t.categorie_id = c.id
    ORDER BY c.libelle
  `).all();
  res.json({ ok: true, lignes });
});

module.exports = router;