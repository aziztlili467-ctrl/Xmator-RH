const { Router } = require('express');
const { db } = require('../db');

// Réutilise le parseur de fichiers de badgeuse du module Présences & pointages
// (normalisation des horodatages, séparateurs auto, formats Matricule+Horodatage ou Matricule+Date+Heure)
// → norme d'import IDENTIQUE pour les deux journaux.
const presence = require('./presence');
const { normaliser, normaliserHorodatage, heureDe, diffSecondes, secondesToHHMMSS } = presence;

const router = Router();

// Liste continue des jours calendaires (bornes incluses) — format ISO local
function joursEntre(debut, fin) {
  const out = [];
  const d = new Date(debut + 'T00:00:00');
  const f = new Date(fin + 'T00:00:00');
  while (d <= f) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function clauseEmploye(matricule) {
  const n = parseInt(String(matricule || '').trim(), 10);
  if (String(matricule).trim() && !isNaN(n)) {
    return { sql: '(e.matricule = ? OR CAST(e.matricule AS INTEGER) = ?)', val: [String(matricule).trim(), n] };
  }
  return { sql: 'e.matricule = ?', val: [String(matricule).trim()] };
}

// Liste des horaires : filtres ?debut=&fin=&matricule=&employe_id=
// Retourne les dates présentes, les employés avec leurs heures par date et les totaux.
router.get('/', (req, res) => {
  const debut = String(req.query.debut || '').trim();
  const fin = String(req.query.fin || '').trim();
  const matricule = String(req.query.matricule || '').trim();
  const employe_id = req.query.employe_id ? Number(req.query.employe_id) : null;

  const clauses = [];
  const vals = [];
  if (debut) { clauses.push('h.date >= ?'); vals.push(debut); }
  if (fin) { clauses.push('h.date <= ?'); vals.push(fin); }
  if (employe_id) { clauses.push('h.employe_id = ?'); vals.push(employe_id); }
  if (matricule) {
    const c = clauseEmploye(matricule);
    clauses.push(c.sql); vals.push(...c.val);
  }
  const where = clauses.length ? ' WHERE ' + clauses.join(' AND ') : '';

  const datesStockees = db.prepare(
    `SELECT DISTINCT h.date FROM horaires_travail h INNER JOIN employes e ON e.id = h.employe_id ${where} ORDER BY h.date`
  ).all(...vals).map((r) => r.date);

  // Plage calendaire complète entre les bornes demandées (bornes incluses), sinon les dates présentes.
  // Au-delà de 370 jours on renvoie uniquement les dates ayant des données (évite une matrice démesurée).
  let dates = datesStockees;
  const deb = debut || datesStockees[0] || null;
  const finDate = fin || datesStockees[datesStockees.length - 1] || null;
  if (deb && finDate) {
    const calendrier = joursEntre(deb, finDate);
    if (calendrier.length <= 370) dates = calendrier;
  }

  const rows = db.prepare(
    `SELECT h.employe_id, e.matricule, e.nom, e.prenom, h.date, h.duree_secondes, h.heures, h.debut, h.fin
     FROM horaires_travail h INNER JOIN employes e ON e.id = h.employe_id ${where}
     ORDER BY CAST(e.matricule AS INTEGER), e.matricule, h.date`
  ).all(...vals);

  const empMap = {};
  for (const r of rows) {
    if (!empMap[r.employe_id]) {
      empMap[r.employe_id] = { employe_id: r.employe_id, matricule: r.matricule, nom: r.nom, prenom: r.prenom, total_secondes: 0, heures: {}, details: {} };
    }
    empMap[r.employe_id].heures[r.date] = r.heures;
    empMap[r.employe_id].details[r.date] = { debut: r.debut, fin: r.fin, heures: r.heures };
    empMap[r.employe_id].total_secondes += r.duree_secondes;
  }
  const employes = Object.values(empMap).sort((a, b) =>
    String(a.matricule).localeCompare(String(b.matricule), 'fr', { numeric: true })
  );
  let heuresTotal = 0;
  for (const e of employes) heuresTotal += e.total_secondes;

  res.json({
    dates,
    employes,
    totaux: {
      jours: dates.length,
      employes: employes.length,
      lignes: rows.length,
      heures_total_secondes: heuresTotal,
      heures_total: secondesToHHMMSS(heuresTotal),
      debut: debut || dates[0] || null,
      fin: fin || dates[dates.length - 1] || null,
    },
  });
});

// Import d'un fichier de badgeuse .csv/.txt — norme IDENTIQUE au journal des pointages :
// colonnes Matricule + Horodatage ('YYYY-MM-DD HH:mm:ss' ou 'DD/MM/YYYY HH:mm:ss'),
// ou Matricule + Date + Heure. Séparateur détecté automatiquement (tabulation, point-virgule ou virgule).
// Seuls les matricules présents en base sont importés ; un ré-import du même horodatage est ignoré
// (badges accumulés dans `horaires_pointages`). Pour chaque jour et chaque matricule, la durée
// travaillée est ensuite recalculée = dernier badgeage − premier badgeage de la journée (min/max).
router.post('/import', (req, res) => {
  const texte = String(req.body.texte || '').replace(/\r/g, '');
  const lignes = texte.split('\n').map((l) => l.trimEnd())
    .filter((l) => l.trim().length && !/^[#\/]/.test(l.trim()));

  if (!lignes.length) return res.status(400).json({ error: 'Fichier vide.' });

  const sep = lignes[0].includes('\t') ? '\t' : (lignes[0].includes(';') ? ';' : ',');
  const cells = (l) => l.split(sep).map((c) => c.trim());

  let idxMat = 0;
  let idxDate = 1;
  let idxHeure = -1;
  let header = false;
  const prem = cells(lignes[0]).map(normaliser);
  if (prem.some((c) => c.includes('matricule'))) {
    header = true;
    idxMat = prem.findIndex((c) => c.includes('matricule'));
    if (idxMat === -1) return res.status(400).json({ error: 'En-tête contenant « Matricule » introuvable.' });
    const horCol = prem.findIndex((c) => c.includes('horodatage'));
    if (horCol !== -1) {
      idxDate = horCol;
    } else {
      const dCol = prem.findIndex((c) => c.includes('date'));
      idxHeure = prem.findIndex((c) => c.includes('heure'));
      if (dCol !== -1) idxDate = dCol;
    }
  }

  const findEmp = db.prepare('SELECT id FROM employes WHERE matricule = ? OR CAST(matricule AS INTEGER) = ?');
  const insBadge = db.prepare(`
    INSERT INTO horaires_pointages (employe_id, matricule, horodatage, date, source) VALUES (?,?,?,?,?)
    ON CONFLICT(employe_id, horodatage) DO NOTHING
  `);
  const aggJour = db.prepare('SELECT MIN(horodatage) AS min, MAX(horodatage) AS max FROM horaires_pointages WHERE employe_id = ? AND date = ?');
  const upsert = db.prepare(`
    INSERT INTO horaires_travail (employe_id, date, debut, fin, duree_secondes, heures)
    VALUES (?,?,?,?,?,?)
    ON CONFLICT(employe_id, date) DO UPDATE SET
      debut = excluded.debut, fin = excluded.fin,
      duree_secondes = excluded.duree_secondes, heures = excluded.heures
  `);

  const tx = db.transaction(() => {
    let importes = 0;
    let doublons = 0;
    let invalides = 0;
    const nonReconnus = [];
    const joursTouches = new Set(); // "employe_id|date" ayant reçu au moins un nouveau badge
    const debutLigne = header ? 1 : 0;
    for (let i = debutLigne; i < lignes.length; i++) {
      const cell = cells(lignes[i]);
      const mat = cell[idxMat] || '';
      if (!mat) continue;
      let raw;
      if (idxHeure !== -1 && cell[idxHeure]) raw = `${cell[idxDate] || ''} ${cell[idxHeure]}`;
      else {
        raw = cell[idxDate] || '';
        if (!normaliserHorodatage(raw) && cell[idxDate + 1]) raw = `${raw} ${cell[idxDate + 1]}`;
      }
      const ts = normaliserHorodatage(raw);
      if (!ts) { invalides++; continue; }
      const n = parseInt(mat, 10);
      const emp = findEmp.get(mat, isNaN(n) ? -1 : n);
      if (!emp) {
        if (nonReconnus.length < 20 && !nonReconnus.includes(mat)) nonReconnus.push(mat);
        continue;
      }
      const r = insBadge.run(emp.id, mat, ts.iso, ts.date, 'import');
      if (r.changes > 0) { importes++; joursTouches.add(`${emp.id}|${ts.date}`); }
      else doublons++;
    }
    const datesIm = [];
    for (const j of joursTouches) {
      const [eid, date] = j.split('|');
      const { min, max } = aggJour.get(eid, date);
      const debut = heureDe(min);
      const fin = heureDe(max);
      const duree = diffSecondes(fin, debut);
      upsert.run(eid, date, debut, fin, duree, secondesToHHMMSS(duree));
      datesIm.push(date);
    }
    return { importes, doublons, invalides, nonReconnus, jours: joursTouches.size, datesIm };
  });

  const result = tx();
  res.json({
    ok: true,
    importes: result.importes,
    doublons: result.doublons,
    invalides: result.invalides,
    nonReconnus: result.nonReconnus,
    jours: result.jours,
    lignes: result.importes,
    debut: result.datesIm.length ? result.datesIm.reduce((a, b) => (a < b ? a : b)) : null,
    fin: result.datesIm.length ? result.datesIm.reduce((a, b) => (a > b ? a : b)) : null,
  });
});

module.exports = router;