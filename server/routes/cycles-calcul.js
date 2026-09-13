const { Router } = require('express');
const { db } = require('../db');

const router = Router();

function validerAnnee(annee) {
  const a = Number(annee);
  return Number.isInteger(a) && a >= 2000 && a <= 2100 ? a : null;
}

function isoDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.getUTCFullYear() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

// GET /:annee — cycles de calcul mensuels (début / fin) d'une année
router.get('/:annee', (req, res) => {
  const annee = validerAnnee(req.params.annee);
  if (!annee) return res.status(400).json({ error: 'Année invalide.' });
  const rows = db.prepare('SELECT * FROM cycles_calcul WHERE annee = ? ORDER BY mois').all(annee);
  res.json(rows);
});

// PUT /:annee — enregistre (upsert) un tableau de cycles [{mois, debut, fin}]
router.put('/:annee', (req, res) => {
  const annee = validerAnnee(req.params.annee);
  if (!annee) return res.status(400).json({ error: 'Année invalide.' });
  const cycles = req.body && Array.isArray(req.body.cycles) ? req.body.cycles : [];
  const upsert = db.prepare(`
    INSERT INTO cycles_calcul (annee, mois, debut, fin) VALUES (?,?,?,?)
    ON CONFLICT(annee, mois) DO UPDATE SET debut = excluded.debut, fin = excluded.fin, updated_at = datetime('now','localtime')
  `);
  const tx = db.transaction(() => {
    for (const c of cycles) {
      const mois = Number(c.mois);
      if (!Number.isInteger(mois) || mois < 1 || mois > 12) continue;
      const debut = isoDate(c.debut);
      const fin = isoDate(c.fin);
      if (!debut || !fin) continue;
      upsert.run(annee, mois, debut, fin);
    }
  });
  tx();
  const rows = db.prepare('SELECT * FROM cycles_calcul WHERE annee = ? ORDER BY mois').all(annee);
  res.json(rows);
});

module.exports = router;