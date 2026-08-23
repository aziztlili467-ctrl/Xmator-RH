const express = require('express');
const { db } = require('../db');

const router = express.Router();

const normaliserCode = (v) => String(v ?? '').trim().toUpperCase().replace(/\s+/g, '');
const normaliserLibelle = (v) => String(v ?? '').trim().replace(/\s+/g, ' ');
const normaliserCouleur = (v) => {
  const c = String(v ?? '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(c) ? c.toLowerCase() : null;
};

router.get('/', (req, res) => {
  const codes = db.prepare('SELECT id, code, libelle, couleur, created_at, updated_at FROM codes_paie ORDER BY code').all();
  res.json({ codes });
});

router.post('/', (req, res) => {
  const code = normaliserCode(req.body.code);
  const libelle = normaliserLibelle(req.body.libelle);
  if (!code) return res.status(400).json({ error: 'Le code est obligatoire.' });
  if (code.length > 10) return res.status(400).json({ error: 'Le code ne doit pas dépasser 10 caractères.' });
  if (!libelle) return res.status(400).json({ error: 'Le libellé est obligatoire.' });
  if (db.prepare('SELECT id FROM codes_paie WHERE code = ?').get(code)) {
    return res.status(409).json({ error: `Le code « ${code} » existe déjà.` });
  }
  const r = db.prepare('INSERT INTO codes_paie (code, libelle, couleur) VALUES (?,?,?)')
    .run(code, libelle, normaliserCouleur(req.body.couleur));
  res.status(201).json({ ok: true, code: db.prepare('SELECT * FROM codes_paie WHERE id = ?').get(r.lastInsertRowid) });
});

router.put('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM codes_paie WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Paramètre introuvable.' });
  const code = normaliserCode(req.body.code !== undefined ? req.body.code : row.code);
  const libelle = normaliserLibelle(req.body.libelle !== undefined ? req.body.libelle : row.libelle);
  if (!code) return res.status(400).json({ error: 'Le code est obligatoire.' });
  if (code.length > 10) return res.status(400).json({ error: 'Le code ne doit pas dépasser 10 caractères.' });
  if (!libelle) return res.status(400).json({ error: 'Le libellé est obligatoire.' });
  if (db.prepare('SELECT id FROM codes_paie WHERE code = ? AND id != ?').get(code, row.id)) {
    return res.status(409).json({ error: `Le code « ${code} » est déjà utilisé par un autre paramètre.` });
  }
  const couleur = req.body.couleur !== undefined ? normaliserCouleur(req.body.couleur) : row.couleur;
  db.prepare("UPDATE codes_paie SET code = ?, libelle = ?, couleur = ?, updated_at = datetime('now','localtime') WHERE id = ?")
    .run(code, libelle, couleur, row.id);
  res.json({ ok: true, code: db.prepare('SELECT * FROM codes_paie WHERE id = ?').get(row.id) });
});

router.delete('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM codes_paie WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Paramètre introuvable.' });
  db.prepare('DELETE FROM codes_paie WHERE id = ?').run(row.id);
  res.json({ ok: true });
});

module.exports = router;
