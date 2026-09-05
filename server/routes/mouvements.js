const { Router } = require('express');
const { db, insertMouvement, updateMouvement, deleteMouvement, recomputeSoldeChain, soldeEmploye, soldeCongeRestantDate, journalSoldeConge, TYPES, isDebit } = require('../db');
const router = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isIsoDate = (v) => typeof v === 'string' && DATE_RE.test(v);
const normJours = (v) => Number(v);

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

// GET /api/mouvements/journal-solde/:id — « journal du solde de congé » d'un employé :
// combine les dotations crédit (solde_initial / ajout_annuel) avec les prélèvements CA/DJ
// synchronisés depuis le journal RMA, avec solde courant recalculé en continu.
router.get('/journal-solde/:id', (req, res) => {
  const emp = db.prepare('SELECT id, matricule, nom, prenom FROM employes WHERE id = ?').get(Number(req.params.id));
  if (!emp) return res.status(404).json({ error: 'Employé introuvable.' });
  const journal = journalSoldeConge(Number(req.params.id));
  res.json({
    employe: emp,
    accorde: journal.lignes.filter((l) => l.signe > 0).reduce((s, l) => s + l.jours, 0),
    consomme: journal.lignes.filter((l) => l.signe < 0 && l.deduit !== false).reduce((s, l) => s + l.jours, 0),
    solde: journal.solde,
    lignes: journal.lignes,
  });
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
  // Contrôle sur le solde de congé cohérent avec la fiche et le journal RMA (accorde − consomme)
  const soldeAvant = soldeType === 'conge' ? soldeCongeRestantDate(Number(employe_id)) : soldeEmploye(Number(employe_id), soldeType);
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

  const courant = soldeCongeRestantDate(Number(employe_id));
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

// Éditer solde de congé — dotation d'un solde pour UN employé sur une période [début → fin].
// type_operation : 'solde_initial' (fixe/remplace le socle) ou 'ajout_annuel' (ajoute au solde courant).
router.post('/balances', (req, res) => {
  const { employe_id, type_operation, date_debut, date_fin, date_operation, jours, motif } = req.body || {};
  const emp = db.prepare('SELECT id FROM employes WHERE id = ?').get(Number(employe_id));
  if (!emp) return res.status(400).json({ error: 'Employé introuvable.' });
  const op = type_operation === 'solde_initial' ? 'solde_initial' : 'ajout_annuel';
  const j = Number(jours);
  // Un solde initial peut être NÉGATIF (dette / avance consommée) pour être soustrait des droits annuels futurs.
  const initialNegatif = op === 'solde_initial' && j < 0;
  if (!Number.isFinite(j) || j === 0 || (!initialNegatif && j < 0)) {
    return res.status(400).json({ error: op === 'solde_initial' ? 'Le nombre de jours doit être non nul (négatif autorisé pour un solde initial).' : 'Le nombre de jours doit être positif.' });
  }
  if (!date_debut || !isIsoDate(date_debut) || !date_fin || !isIsoDate(date_fin)) {
    return res.status(400).json({ error: 'Période invalide : date de début et de fin attendues au format AAAA-MM-JJ.' });
  }
  if (date_fin < date_debut) {
    return res.status(400).json({ error: 'La date de fin doit être postérieure ou égale à la date de début.' });
  }
  const dOp = date_operation && isIsoDate(date_operation) ? date_operation : date_debut;
  const mvt = insertMouvement({
    employe_id: Number(employe_id),
    type_operation: op,
    date_operation: dOp,
    date_debut,
    date_fin,
    jours: j,
    motif: motif || (op === 'solde_initial' ? 'Solde initial' : 'Ajout de solde annuel'),
  });
  res.status(201).json({ mvt, solde: soldeCongeRestantDate(Number(employe_id)) });
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

// Éditer solde de congé — dotation en masse par catégorie (période [début → fin] + nombre de jours)
// type_operation : 'solde_initial' (remplace l'historique de congé) ou 'ajout_annuel' (s'ajoute au solde).
router.post('/balances-masse', (req, res) => {
  const { type_operation, date_debut, date_fin, date_operation, jours, motif, categorie_id, employes } = req.body || {};
  const op = type_operation === 'solde_initial' ? 'solde_initial' : 'ajout_annuel';
  const j = Number(jours);
  // Un solde initial peut être NÉGATIF pour être soustrait des droits annuels futurs.
  const initialNegatif = op === 'solde_initial' && j < 0;
  if (!Number.isFinite(j) || j === 0 || (!initialNegatif && j < 0)) {
    return res.status(400).json({ error: op === 'solde_initial' ? 'Le nombre de jours doit être non nul (négatif autorisé pour un solde initial).' : 'Le nombre de jours doit être positif.' });
  }
  if (!date_debut || !isIsoDate(date_debut) || !date_fin || !isIsoDate(date_fin)) {
    return res.status(400).json({ error: 'Période invalide : date de début et de fin attendues au format AAAA-MM-JJ.' });
  }
  if (date_fin < date_debut) {
    return res.status(400).json({ error: 'La date de fin doit être postérieure ou égale à la date de début.' });
  }
  const dOp = date_operation && isIsoDate(date_operation) ? date_operation : date_debut;

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
      type_operation: op,
      date_operation: dOp,
      date_debut,
      date_fin,
      jours: j,
      motif: motif || (op === 'solde_initial' ? 'Solde initial' : 'Ajout de solde annuel'),
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

// Éditer solde de congé — supprimer TOUS les soldes de congé d'un employé ou d'une catégorie (en masse),
// afin d'intégrer de nouvelles valeurs. Ne touche pas aux soldes maladie.
router.post('/clear-soldes', (req, res) => {
  const { employe_id, categorie_id, employes } = req.body || {};
  let sql = 'SELECT id FROM employes';
  const params = [];
  if (employe_id) { sql += ' WHERE id = ?'; params.push(Number(employe_id)); }
  else {
    sql += ' WHERE actif = 1';
    if (categorie_id) { sql += ' AND categorie_id = ?'; params.push(Number(categorie_id)); }
  }
  if (Array.isArray(employes) && employes.length) {
    sql += (sql.includes('WHERE') ? ' AND' : ' WHERE') + ' id IN (' + employes.map(() => '?').join(',') + ')';
    params.push(...employes.map(Number));
  }
  const list = db.prepare(sql).all(...params);
  if (!list.length) return res.status(400).json({ error: 'Aucun employé concerné.' });

  const tx = db.transaction(() => {
    let total = 0;
    for (const e of list) {
      const ids = db.prepare("SELECT id FROM mouvements WHERE employe_id = ? AND solde_type = 'conge'").all(e.id).map((r) => r.id);
      if (!ids.length) continue;
      const ph = ids.map(() => '?').join(',');
      const r = db.prepare(`DELETE FROM mouvements WHERE id IN (${ph})`).run(...ids);
      total += r.changes;
    }
    return total;
  });
  const deleted = tx();

  // Recalcule les soldes courant (désormais 0) pour les employés concernés
  for (const e of list) recomputeSoldeChain(e.id, 'conge');

  res.json({ ok: true, count: list.length, deleted, soldes_reinitialises: list.length });
});

// PUT /api/mouvements/:id — éditer une dotation de solde (Éditer solde de congé)
router.put('/:id', (req, res) => {
  const { date_operation, date_debut, date_fin, jours, motif } = req.body || {};
  if (date_operation && !isIsoDate(date_operation)) {
    return res.status(400).json({ error: 'Date d\'opération invalide (format AAAA-MM-JJ attendu).' });
  }
  if (date_debut && !isIsoDate(date_debut)) {
    return res.status(400).json({ error: 'Date de début invalide (format AAAA-MM-JJ attendu).' });
  }
  if (date_fin && !isIsoDate(date_fin)) {
    return res.status(400).json({ error: 'Date de fin invalide (format AAAA-MM-JJ attendu).' });
  }
  if (jours !== undefined) {
    const existant = db.prepare('SELECT type_operation FROM mouvements WHERE id = ?').get(req.params.id);
    const initialNegatif = existant && existant.type_operation === 'solde_initial' && Number(jours) < 0;
    if (!Number.isFinite(Number(jours)) || Number(jours) === 0 || (!initialNegatif && Number(jours) < 0)) {
      const estInitial = existant && existant.type_operation === 'solde_initial';
      return res.status(400).json({ error: estInitial ? 'Le nombre de jours doit être non nul (négatif autorisé pour un solde initial).' : 'Le nombre de jours doit être positif.' });
    }
  }
  try {
    const mvt = updateMouvement(req.params.id, { date_operation, date_debut, date_fin, jours, motif });
    if (!mvt) return res.status(404).json({ error: 'Mouvement introuvable.' });
    res.json({ mvt, solde: mvt.solde_type === 'conge' ? soldeCongeRestantDate(mvt.employe_id) : soldeEmploye(mvt.employe_id, mvt.solde_type) });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  const mvt = deleteMouvement(req.params.id);
  if (!mvt) return res.status(404).json({ error: 'Mouvement introuvable.' });
  res.json({ ok: true, solde: mvt.solde_type === 'conge' ? soldeCongeRestantDate(mvt.employe_id) : soldeEmploye(mvt.employe_id, mvt.solde_type) });
});

module.exports = router;
