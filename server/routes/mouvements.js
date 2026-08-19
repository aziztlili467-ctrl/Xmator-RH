const { Router } = require('express');
const { db, insertMouvement, soldeEmploye, TYPES, isDebit } = require('../db');
const router = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

router.get('/', (req, res) => {
  const { employe, categorie, type, debut, fin, search } = req.query;
  let sql = `
    SELECT m.*, e.matricule, e.nom, e.prenom, e.categorie_id, c.libelle AS categorie
    FROM mouvements m
    JOIN employes e ON e.id = m.employe_id
    JOIN categories c ON c.id = e.categorie_id
    WHERE 1=1
  `;
  const params = [];
  if (employe) { sql += ' AND m.employe_id = ?'; params.push(Number(employe)); }
  if (categorie) { sql += ' AND e.categorie_id = ?'; params.push(Number(categorie)); }
  if (type && TYPES.includes(type)) { sql += ' AND m.type_operation = ?'; params.push(type); }
  if (debut && DATE_RE.test(debut)) { sql += ' AND m.date_operation >= ?'; params.push(debut); }
  if (fin && DATE_RE.test(fin)) { sql += ' AND m.date_operation <= ?'; params.push(fin); }
  if (search) {
    sql += ' AND (e.matricule LIKE ? OR e.nom LIKE ? OR e.prenom LIKE ? OR m.motif LIKE ?)';
    const p = `%${search}%`;
    params.push(p, p, p, p);
  }
  sql += ' ORDER BY m.date_operation DESC, m.id DESC';
  res.json(db.prepare(sql).all(...params));
});

router.post('/', (req, res) => {
  const { employe_id, type_operation, date_operation, jours, motif } = req.body || {};

  if (!TYPES.includes(type_operation)) {
    return res.status(400).json({ error: 'Type d\'opération invalide.' });
  }
  const emp = db.prepare('SELECT id FROM employes WHERE id = ?').get(Number(employe_id));
  if (!emp) return res.status(400).json({ error: 'Employé introuvable.' });
  if (!date_operation || !DATE_RE.test(date_operation)) {
    return res.status(400).json({ error: 'Date invalide (format AAAA-MM-JJ attendu).' });
  }
  const j = Number(jours);
  if (!Number.isFinite(j) || j <= 0) {
    return res.status(400).json({ error: 'Le nombre de jours doit être positif.' });
  }

  const soldeType = type_operation === 'maladie' ? 'maladie' : 'conge';
  const soldeAvant = soldeEmploye(Number(employe_id), soldeType);
  if (isDebit(type_operation) && j > soldeAvant + 0.0001) {
    return res.status(400).json({
      error: `Solde ${soldeType === 'maladie' ? 'maladie' : 'de congé'} insuffisant. Disponible : ${soldeAvant} jour(s), prélèvement demandé : ${j} jour(s).`,
    });
  }

  const mvt = insertMouvement({
    employe_id: Number(employe_id),
    type_operation,
    date_operation,
    jours: j,
    motif,
    solde_type: soldeType,
  });
  res.status(201).json(mvt);
});

router.post('/correction-solde', (req, res) => {
  const { employe_id, nouveau_solde, date_operation, motif } = req.body || {};
  const emp = db.prepare('SELECT id FROM employes WHERE id = ?').get(Number(employe_id));
  if (!emp) return res.status(400).json({ error: 'Employé introuvable.' });
  if (!date_operation || !DATE_RE.test(date_operation)) {
    return res.status(400).json({ error: 'Date invalide (format AAAA-MM-JJ attendu).' });
  }
  const cible = Number(nouveau_solde);
  if (!Number.isFinite(cible)) {
    return res.status(400).json({ error: 'Le solde cible doit être un nombre.' });
  }

  const courant = soldeEmploye(Number(employe_id));
  const diff = Math.round((cible - courant) * 1000) / 1000;
  if (Math.abs(diff) < 0.0001) {
    return res.status(200).json({ mvt: null, courant, message: 'Le solde correspond déjà à la valeur cible. Aucune correction nécessaire.' });
  }

  const typeOperation = diff > 0 ? 'ajout_annuel' : 'prelevement';
  const jours = Math.abs(diff);

  if (typeOperation === 'prelevement' && jours > courant + 0.0001) {
    return res.status(400).json({
      error: `Impossible : pour corriger le solde de ${courant} à ${cible} j, il faudrait prélever ${jours} j alors que le solde disponible est de ${courant} j.`,
    });
  }

  const mvt = insertMouvement({
    employe_id: Number(employe_id),
    type_operation: typeOperation,
    date_operation,
    jours,
    motif: `Correction de solde — ${motif || 'régularisation'}`,
  });
  res.status(201).json({ mvt, courant, cible });
});

router.post('/ajout-annuel-masse', (req, res) => {
  const { jours, date_operation, motif, categorie_id, employes } = req.body || {};
  const j = Number(jours);
  if (!Number.isFinite(j) || j <= 0) {
    return res.status(400).json({ error: 'Le nombre de jours doit être positif.' });
  }
  if (!date_operation || !DATE_RE.test(date_operation)) {
    return res.status(400).json({ error: 'Date invalide (format AAAA-MM-JJ attendu).' });
  }

  let sql = 'SELECT id FROM employes WHERE actif = 1';
  const params = [];
  if (categorie_id) { sql += ' AND categorie_id = ?'; params.push(Number(categorie_id)); }
  if (Array.isArray(employes) && employes.length) {
    const placeholders = employes.map(() => '?').join(',');
    sql += ` AND id IN (${placeholders})`;
    params.push(...employes.map(Number));
  }
  const list = db.prepare(sql).all(...params);
  if (!list.length) return res.status(400).json({ error: 'Aucun employé concerné.' });

  const tx = db.transaction(() =>
    list.map((e) => insertMouvement({
      employe_id: e.id,
      type_operation: 'ajout_annuel',
      date_operation,
      jours: j,
      motif,
    }))
  );
  const rows = tx();
  res.status(201).json({ count: rows.length, rows });
});

// Ajout de solde MALADIE annuel en masse (ex. 20 jours)
router.post('/ajout-maladie-masse', (req, res) => {
  const { jours, date_operation, motif, categorie_id, employes } = req.body || {};
  const j = Number(jours);
  if (!Number.isFinite(j) || j <= 0) {
    return res.status(400).json({ error: 'Le nombre de jours doit être positif.' });
  }
  if (!date_operation || !DATE_RE.test(date_operation)) {
    return res.status(400).json({ error: 'Date invalide (format AAAA-MM-JJ attendu).' });
  }

  let sql = 'SELECT id FROM employes WHERE actif = 1';
  const params = [];
  if (categorie_id) { sql += ' AND categorie_id = ?'; params.push(Number(categorie_id)); }
  if (Array.isArray(employes) && employes.length) {
    const placeholders = employes.map(() => '?').join(',');
    sql += ` AND id IN (${placeholders})`;
    params.push(...employes.map(Number));
  }
  const list = db.prepare(sql).all(...params);
  if (!list.length) return res.status(400).json({ error: 'Aucun employé concerné.' });

  const tx = db.transaction(() =>
    list.map((e) => insertMouvement({
      employe_id: e.id,
      type_operation: 'ajout_annuel',
      date_operation,
      jours: j,
      motif: motif || 'Ajout solde maladie annuel',
      solde_type: 'maladie',
    }))
  );
  const rows = tx();
  res.status(201).json({ count: rows.length, rows });
});

router.delete('/:id', (req, res) => {
  const r = db.prepare('DELETE FROM mouvements WHERE id = ?').run(Number(req.params.id));
  if (r.changes === 0) return res.status(404).json({ error: 'Mouvement introuvable.' });
  res.json({ ok: true });
});

module.exports = router;
