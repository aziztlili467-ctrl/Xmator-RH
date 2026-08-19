const { Router } = require('express');
const { db } = require('../db');
const router = Router();

const HEADER_KEYS = ['matricule', 'mat', 'nom', 'prenom', 'categorie', 'fonction', 'catégorie', 'fonction'];

router.post('/', (req, res) => {
  const { csv } = req.body || {};
  if (!csv || !String(csv).trim()) {
    return res.status(400).json({ error: 'Contenu CSV vide.' });
  }
  const lines = String(csv).trim().split(/\r?\n/).filter((l) => l.trim().length > 0);
  const sep = lines[0].includes(';') ? ';' : ',';

  const parsed = lines.map((l) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, '')));
  let start = 0;
  const firstLower = parsed[0].map((c) => c.toLowerCase());
  if (HEADER_KEYS.some((h) => firstLower.includes(h))) start = 1;

  if (parsed.length <= start) {
    return res.status(400).json({ error: 'Aucune ligne de données trouvée dans le CSV.' });
  }

  const getCat = db.prepare('SELECT id FROM categories WHERE libelle = ?');
  const insCat = db.prepare('INSERT INTO categories (libelle) VALUES (?)');
  const getEmp = db.prepare('SELECT id FROM employes WHERE matricule = ?');
  const insEmp = db.prepare('INSERT INTO employes (matricule, nom, prenom, categorie_id) VALUES (?,?,?,?)');

  const resultats = [];
  let imports = 0;

  try {
    const tx = db.transaction(() => {
      for (let i = start; i < parsed.length; i++) {
        const [matricule, nom, prenom, categorie] = parsed[i];
        const ligne = i + 1;
        if (!matricule || !nom) {
          resultats.push({ ligne, statut: 'erreur', message: 'matricule ou nom manquant' });
          continue;
        }
        if (getEmp.get(matricule)) {
          resultats.push({ ligne, statut: 'ignoré', message: 'matricule déjà existant' });
          continue;
        }
        let cid = categorie ? getCat.get(categorie)?.id : undefined;
        if (!cid) {
          cid = insCat.run(categorie || 'Sans catégorie').lastInsertRowid;
        }
        insEmp.run(String(matricule), nom, prenom || '', cid);
        imports++;
        resultats.push({ ligne, statut: 'ok' });
      }
    });
    tx();
    res.status(201).json({ imports, total: parsed.length - start, resultats });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
