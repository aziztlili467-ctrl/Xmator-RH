const { Router } = require('express');
const { db } = require('../db');
const router = Router();

const HEADER_KEYS = ['matricule', 'mat', 'nom', 'prenom', 'categorie', 'fonction', 'catégorie', 'fonction', 'rubrique', 'grade', 'classe', 'echelon'];

router.post('/', (req, res) => {
  const { csv } = req.body || {};
  if (!csv || !String(csv).trim()) {
    return res.status(400).json({ error: 'Contenu CSV vide.' });
  }
  const lines = String(csv).trim().split(/\r?\n/).filter((l) => l.trim().length > 0);
  const sep = lines[0].includes(';') ? ';' : ',';

  const parsed = lines.map((l) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, '')));
  let start = 0;
  const firstRow = parsed[0].map((c) => c.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
  if (HEADER_KEYS.some((h) => firstRow.some((c) => c.includes(h)))) start = 1;

  // Détection des colonnes optionnelles (rubrique, grade, classe, echelon) dans l'en-tête
  const headers = start ? parsed[0].map((c) => c.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')) : [];
  const colRubrique = headers.findIndex((h) => h.includes('rubrique'));
  const colGrade = headers.findIndex((h) => h.includes('grade'));
  const colClasse = headers.findIndex((h) => h.includes('classe'));
  const colEchelon = headers.findIndex((h) => h.includes('echelon') || h.includes('ech'));

  if (parsed.length <= start) {
    return res.status(400).json({ error: 'Aucune ligne de données trouvée dans le CSV.' });
  }

  const getCat = db.prepare('SELECT id FROM categories WHERE libelle = ?');
  const insCat = db.prepare('INSERT INTO categories (libelle) VALUES (?)');
  const getEmp = db.prepare('SELECT id FROM employes WHERE matricule = ?');
  const insEmp = db.prepare('INSERT INTO employes (matricule, nom, prenom, categorie_id, rubrique, grade, classe, echelon) VALUES (?,?,?,?,?,?,?,?)');

  const resultats = [];
  let imports = 0;

  try {
    const tx = db.transaction(() => {
      for (let i = start; i < parsed.length; i++) {
        const row = parsed[i];
        const matricule = row[0];
        const nom = row[1];
        const prenom = row[2];
        const categorie = row[3];
        const rubrique = colRubrique >= 0 ? (row[colRubrique] || '') : '';
        const grade = colGrade >= 0 ? (row[colGrade] || '') : '';
        const classe = colClasse >= 0 ? (row[colClasse] || '') : '';
        const echelon = colEchelon >= 0 ? (row[colEchelon] || '') : '';
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
        insEmp.run(String(matricule), nom, prenom || '', cid, rubrique, grade, classe, echelon);
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
    tx();
    res.status(201).json({ imports, total: parsed.length - start, resultats });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
