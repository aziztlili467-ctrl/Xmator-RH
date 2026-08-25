const { Router } = require('express');
const { db, soldeEmploye, soldeEmployeAt, insertMouvement } = require('../db');
const router = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function nextNumero() {
  return db.transaction(() => {
    const row = db.prepare('SELECT COALESCE(MAX(numero_sequentiel), 0) AS m FROM arrets_maladie').get();
    return row.m + 1;
  })();
}

function nbJours(debut, fin) {
  const d1 = new Date(debut + 'T00:00:00');
  const d2 = new Date(fin + 'T00:00:00');
  if (isNaN(d1) || isNaN(d2) || d2 < d1) return null;
  const hasCal = db.prepare('SELECT 1 FROM jours_travail WHERE date >= ? AND date <= ? LIMIT 1').get(debut, fin);
  if (hasCal) {
    const r = db.prepare("SELECT COUNT(*) AS c FROM jours_travail WHERE date >= ? AND date <= ? AND heures > 0").get(debut, fin);
    return r.c || 1; // au moins 1 si période couverte mais tous fériés → 1 pour garder cohérence solde
  }
  let count = 0;
  const cur = new Date(d1);
  while (cur <= d2) {
    count += 1;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

const NOM_PRETEMPS = (e) => `${e.nom} ${e.prenom}`;

const BASE = `
  SELECT a.*, e.categorie_id
  FROM arrets_maladie a
  JOIN employes e ON e.id = a.employe_id
`;

router.get('/', (req, res) => {
  const { statut, employe, categorie, search } = req.query;
  let sql = BASE + ' WHERE 1=1';
  const params = [];
  if (statut) { sql += ' AND a.statut = ?'; params.push(statut); }
  if (employe) { sql += ' AND a.employe_id = ?'; params.push(Number(employe)); }
  if (categorie) { sql += ' AND e.categorie_id = ?'; params.push(Number(categorie)); }
  if (search) {
    sql += ' AND (a.matricule LIKE ? OR a.nom_prenom LIKE ? OR a.numero_bulletin LIKE ?)';
    const p = `%${search}%`;
    params.push(p, p, p);
  }
  sql += ' ORDER BY a.numero_sequentiel DESC';
  res.json(db.prepare(sql).all(...params));
});

router.get('/:id', (req, res) => {
  const a = db.prepare(BASE + ' WHERE a.id = ?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Arrêt maladie introuvable.' });
  res.json(a);
});

router.post('/', (req, res) => {
  const { employe_id, numero_bulletin, certificat, date_debut, date_fin, nombre_jours } = req.body || {};

  const emp = db.prepare('SELECT id, matricule, nom, prenom, categorie_id FROM employes WHERE id = ?').get(Number(employe_id));
  if (!emp) return res.status(400).json({ error: 'Employé introuvable.' });
  if (!numero_bulletin || !String(numero_bulletin).trim()) {
    return res.status(400).json({ error: 'Le numéro de bulletin d\'assurance est obligatoire.' });
  }
  for (const [k, v] of [['date_debut', date_debut], ['date_fin', date_fin]]) {
    if (!v || !DATE_RE.test(v)) return res.status(400).json({ error: `Date invalide pour ${k} (format AAAA-MM-JJ).` });
  }

  const doublon = db.prepare(`
    SELECT id, numero_sequentiel, date_debut, statut
    FROM arrets_maladie
    WHERE employe_id = ? AND date_debut = ? AND statut IN ('en_instance', 'valide')
  `).get(Number(employe_id), date_debut);
  if (doublon) {
    return res.status(409).json({
      error: `Un arrêt maladie existe déjà pour le matricule ${emp.matricule} avec la même date de début (${date_debut}) — N°${String(doublon.numero_sequentiel).padStart(3, '0')} (statut : ${doublon.statut}). Vérifiez pour éviter un doublon.`,
    });
  }

  let jours;
  if (nombre_jours !== undefined && nombre_jours !== null && nombre_jours !== '') {
    const v = Number(nombre_jours);
    if (!Number.isInteger(v) || v <= 0) {
      return res.status(400).json({ error: 'Le nombre de jours saisi manuellement doit être un entier positif.' });
    }
    jours = v;
  } else {
    jours = nbJours(date_debut, date_fin);
    if (!jours) return res.status(400).json({ error: 'La date de fin doit être postérieure ou égale à la date de début.' });
  }

  const numero = nextNumero();
  const soldeMaladie = soldeEmployeAt(Number(employe_id), todayISO(), 'maladie');
  const categorie = db.prepare('SELECT libelle FROM categories WHERE id = ?').get(emp.categorie_id).libelle;

  const r = db.prepare(`
    INSERT INTO arrets_maladie
      (numero_sequentiel, employe_id, matricule, nom_prenom, categorie, numero_bulletin, certificat,
       date_debut, date_fin, nombre_jours, solde_maladie_a_la_demande, statut)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,'en_instance')
  `).run(
    numero, Number(employe_id), emp.matricule, NOM_PRETEMPS(emp), categorie,
    String(numero_bulletin).trim(), certificat ? String(certificat).trim() : null,
    date_debut, date_fin, jours, soldeMaladie
  );
  const created = db.prepare(BASE + ' WHERE a.id = ?').get(r.lastInsertRowid);
  res.status(201).json(created);
});

function datesEntre(debut, fin) {
  const out = [];
  const cur = new Date(debut + 'T00:00:00');
  const end = new Date(fin + 'T00:00:00');
  while (cur <= end) {
    out.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}
function syncRmaCodes(arret, code) {
  const jours = datesEntre(arret.date_debut, arret.date_fin);
  const legalSet = new Set(db.prepare("SELECT date FROM jours_travail WHERE date >= ? AND date <= ? AND heures > 0").all(arret.date_debut, arret.date_fin).map(r=>r.date));
  const hasCal = legalSet.size > 0 || db.prepare('SELECT 1 FROM jours_travail WHERE date >= ? AND date <= ? LIMIT 1').get(arret.date_debut, arret.date_fin);
  const ins = db.prepare('INSERT INTO codes_importes (employe_id, matricule, date, code) VALUES (?,?,?,?) ON CONFLICT(employe_id, date, code) DO NOTHING');
  for (const j of jours) {
    const ouvrable = hasCal ? legalSet.has(j) : true;
    if (!ouvrable) continue;
    ins.run(arret.employe_id, arret.matricule, j, code);
  }
}
function clearRmaCodes(arret, code) {
  db.prepare('DELETE FROM codes_importes WHERE employe_id = ? AND date >= ? AND date <= ? AND code = ?').run(arret.employe_id, arret.date_debut, arret.date_fin, code);
}
function restituerSoldeMaladie(arret) {
  const mouvs = db.prepare("SELECT id FROM mouvements WHERE arret_id = ? AND type_operation = 'maladie' AND solde_type = 'maladie'").all(arret.id);
  if (mouvs.length) {
    for (const m of mouvs) db.prepare('DELETE FROM mouvements WHERE id = ?').run(m.id);
  }
}

router.post('/:id/valider', (req, res) => {
  const a = db.prepare('SELECT * FROM arrets_maladie WHERE id = ?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Arrêt maladie introuvable.' });
  if (a.statut === 'valide') {
    return res.status(400).json({ error: `Cet arrêt est déjà validé (N°${String(a.numero_sequentiel).padStart(3, '0')}).` });
  }
  if (!['en_instance', 'rejete'].includes(a.statut)) {
    return res.status(400).json({ error: `Statut incompatible pour validation (actuel : ${a.statut}).` });
  }

  const soldeMaladieActuel = soldeEmploye(a.employe_id, 'maladie');
  if (a.nombre_jours > soldeMaladieActuel + 0.0001) {
    return res.status(400).json({
      error: `Solde maladie insuffisant pour valider cet arrêt. Disponible : ${soldeMaladieActuel} j, demandé : ${a.nombre_jours} j.`,
    });
  }

  try {
    const tx = db.transaction(() => {
      // Si l'arrêt était rejeté, on nettoie l'absence et le code A1 avant de valider
      if (a.statut === 'rejete') {
        db.prepare("DELETE FROM mouvements WHERE arret_id = ? AND type_operation = 'absence'").run(a.id);
        clearRmaCodes(a, 'A1');
        db.prepare(`UPDATE arrets_maladie SET motif_rejet = NULL WHERE id = ?`).run(a.id);
      }
      insertMouvement({
        employe_id: a.employe_id,
        type_operation: 'maladie',
        date_operation: a.date_fin,
        jours: a.nombre_jours,
        motif: `Arrêt maladie validé — Bulletin ${a.numero_bulletin}`,
        solde_type: 'maladie',
        arret_id: a.id,
      });
      syncRmaCodes(a, 'MA');
      db.prepare(`UPDATE arrets_maladie SET statut = 'valide', date_decision = datetime('now','localtime') WHERE id = ?`).run(a.id);
    });
    tx();
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  res.json(db.prepare(BASE + ' WHERE a.id = ?').get(a.id));
});

router.post('/:id/rejeter', (req, res) => {
  const { motif_rejet } = req.body || {};
  const a = db.prepare('SELECT * FROM arrets_maladie WHERE id = ?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Arrêt maladie introuvable.' });
  // Accepté puis refusé : on restitue le solde et on bascule MA → A1
  if (a.statut !== 'en_instance' && a.statut !== 'valide') {
    return res.status(400).json({ error: `Seuls les arrêts en instance ou validés peuvent être rejetés (statut actuel : ${a.statut}).` });
  }

  try {
    const tx = db.transaction(() => {
      if (a.statut === 'valide') {
        restituerSoldeMaladie(a);
        clearRmaCodes(a, 'MA');
      }
      // Absence neutralisée (journal) + A1 dans le Journal RMA
      insertMouvement({
        employe_id: a.employe_id,
        type_operation: 'absence',
        date_operation: a.date_fin,
        jours: a.nombre_jours,
        motif: `Absence (arrêt maladie rejeté) — Bulletin ${a.numero_bulletin}`,
        arret_id: a.id,
      });
      syncRmaCodes(a, 'A1');
      db.prepare(`UPDATE arrets_maladie SET statut = 'rejete', date_decision = datetime('now','localtime'), motif_rejet = ? WHERE id = ?`)
        .run(motif_rejet ? String(motif_rejet).trim() : null, a.id);
    });
    tx();
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  res.json(db.prepare(BASE + ' WHERE a.id = ?').get(a.id));
});

router.delete('/:id', (req, res) => {
  const a = db.prepare('SELECT * FROM arrets_maladie WHERE id = ?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Arrêt maladie introuvable.' });
  try {
    const tx = db.transaction(() => {
      if (a.statut === 'valide') {
        restituerSoldeMaladie(a);
        clearRmaCodes(a, 'MA');
      } else if (a.statut === 'rejete') {
        db.prepare("DELETE FROM mouvements WHERE arret_id = ? AND type_operation = 'absence'").run(a.id);
        clearRmaCodes(a, 'A1');
      }
      // En instance : rien à restituer, juste supprimer
      db.prepare('DELETE FROM codes_importes WHERE employe_id = ? AND date >= ? AND date <= ? AND code IN (?,?)')
        .run(a.employe_id, a.date_debut, a.date_fin, 'MA', 'A1');
      db.prepare('DELETE FROM arrets_maladie WHERE id = ?').run(a.id);
    });
    tx();
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
  res.json({ ok: true });
});

module.exports = router;
