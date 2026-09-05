const { Router } = require('express');
const { db } = require('../db');

// Réutilise les fonctions de calcul du module Présences & pointages
// (heure extraite d'un horodatage, différence bornée à 0, formatage HH:MM:SS).
const presence = require('./presence');
const { heureDe, diffSecondes, secondesToHHMMSS } = presence;

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

// Filtres communs (GET, suppression) sur la table `pointages` jointe aux employés.
function filtres(req) {
  const debut = String(req.query.debut || '').trim();
  const fin = String(req.query.fin || '').trim();
  const matricule = String(req.query.matricule || '').trim();
  const employe_id = req.query.employe_id ? Number(req.query.employe_id) : null;
  const clauses = [];
  const vals = [];
  if (debut) { clauses.push('p.date >= ?'); vals.push(debut); }
  if (fin) { clauses.push('p.date <= ?'); vals.push(fin); }
  if (employe_id) { clauses.push('p.employe_id = ?'); vals.push(employe_id); }
  if (matricule) {
    const c = clauseEmploye(matricule);
    clauses.push(c.sql); vals.push(...c.val);
  }
  return { where: clauses.length ? ' WHERE ' + clauses.join(' AND ') : '', vals };
}

// Liste des horaires de travail : filtres ?debut=&fin=&matricule=&employe_id=
// Source : les badgeages de « Présences & pointages » (table `pointages`). Pour chaque matricule et
// chaque jour, l'entrée réelle = premier badgeage, la sortie réelle = dernier badgeage, et la durée
// travaillée = Sortie réelle − Entrée réelle. Les jours avec un pointage unique n'ont pas de durée.
// Retourne les dates présentes, les employés avec leurs heures par date et les totaux.
router.get('/', (req, res) => {
  const { where, vals } = filtres(req);
  const debut = String(req.query.debut || '').trim();
  const fin = String(req.query.fin || '').trim();

  const datesStockees = db.prepare(
    `SELECT DISTINCT p.date FROM pointages p INNER JOIN employes e ON e.id = p.employe_id ${where} ORDER BY p.date`
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
    `SELECT p.employe_id, e.matricule, e.nom, e.prenom, p.date,
            COUNT(*) AS nb,
            MIN(p.horodatage) AS entree,
            MAX(p.horodatage) AS sortie
     FROM pointages p INNER JOIN employes e ON e.id = p.employe_id ${where}
     GROUP BY p.employe_id, p.date
     ORDER BY CAST(e.matricule AS INTEGER), e.matricule, p.date`
  ).all(...vals);

  const empMap = {};
  let lignes = 0;
  for (const r of rows) {
    if (!empMap[r.employe_id]) {
      empMap[r.employe_id] = { employe_id: r.employe_id, matricule: r.matricule, nom: r.nom, prenom: r.prenom, total_secondes: 0, heures: {}, details: {} };
    }
    const emp = empMap[r.employe_id];
    const entree_reelle = heureDe(r.entree);
    const sortie_reelle = r.nb >= 2 ? heureDe(r.sortie) : null;
    const duree = sortie_reelle ? diffSecondes(sortie_reelle, entree_reelle) : null;
    if (duree !== null) {
      emp.heures[r.date] = secondesToHHMMSS(duree);
      emp.details[r.date] = { debut: entree_reelle, fin: sortie_reelle, heures: secondesToHHMMSS(duree), nb_pointages: r.nb };
      emp.total_secondes += duree;
      lignes++;
    } else {
      emp.details[r.date] = { debut: entree_reelle, fin: null, heures: null, nb_pointages: r.nb };
    }
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
      lignes,
      heures_total_secondes: heuresTotal,
      heures_total: secondesToHHMMSS(heuresTotal),
      debut: debut || dates[0] || null,
      fin: fin || dates[dates.length - 1] || null,
    },
  });
});

// Vider les horaires d'une période : les heures affichées proviennent des badgeages de
// « Présences & pointages » (table `pointages`). Supprimer la période supprime donc ces badgeages
// (et leurs corrections de retard / sortie anticipée) entre ?debut= et ?fin= (bornes incluses),
// éventuellement restreints à un employé (?matricule= ou ?employe_id=).
router.delete('/', (req, res) => {
  const { where, vals } = filtres(req);
  const jours = db.prepare(`
    SELECT DISTINCT p.employe_id, p.date
    FROM pointages p INNER JOIN employes e ON e.id = p.employe_id
    ${where}
  `).all(...vals);
  const delP = db.prepare('DELETE FROM pointages WHERE employe_id = ? AND date = ?');
  const delC = db.prepare('DELETE FROM corrections_pointages WHERE employe_id = ? AND date = ?');
  const tx = db.transaction(() => {
    let supprimes = 0;
    for (const j of jours) {
      supprimes += delP.run(j.employe_id, j.date).changes;
      delC.run(j.employe_id, j.date);
    }
    return supprimes;
  });
  res.json({ ok: true, supprimes: tx(), jours: jours.length });
});

module.exports = router;