const { Router } = require('express');
const { db, soldeEmploye } = require('../db');
const presence = require('./presence');
const { normaliser, horairePour, diffSecondes, statutPour, retardComptable, sortieAnticipeeComptable } = presence;
const router = Router();

const SEUIL_ALERTE = 5;

// Cache court (10 s) pour les agrégats lourds du tableau de bord (mêmes données pour tous les
// lecteurs, mais ~26 000 pointages + N+1 solde récalculés à chaque navigation). Légère fraîcheur
// maximale : 10 s après une écriture — acceptable pour un tableau de bord.
const DASH_CACHE_TTL = 10000;
const dashCache = new Map();
function dashMemo(key, build) {
  const hit = dashCache.get(key);
  if (hit && Date.now() - hit.t < DASH_CACHE_TTL) return hit.v;
  const v = build();
  dashCache.set(key, { v, t: Date.now() });
  return v;
}

function iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function joursEntre(debut, fin) {
  const out = [];
  const d = new Date(debut + 'T00:00:00');
  const f = new Date(fin + 'T00:00:00');
  while (d <= f) {
    out.push(iso(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function placeholders(n) {
  return Array.from({ length: n }, () => '?').join(',');
}

router.get('/', (req, res) => {
  const annee = String(new Date().getFullYear());

  res.json(dashMemo('accueil:' + annee, () => {
  const nbEmployes = db.prepare('SELECT COUNT(*) AS n FROM employes WHERE actif = 1').get().n;

  const anneeStats = db.prepare(`
    SELECT type_operation, solde_type, COALESCE(SUM(jours),0) AS total, COUNT(*) AS nb
    FROM mouvements
    WHERE strftime('%Y', date_operation) = ?
    GROUP BY type_operation, solde_type
  `).all(annee);
  const anneeTotal = (t) => { const r = anneeStats.find((x) => x.type_operation === t && x.solde_type === 'conge'); return r ? r.total : 0; };
  const anneeTotalMaladie = (t) => { const r = anneeStats.find((x) => x.type_operation === t && x.solde_type === 'maladie'); return r ? r.total : 0; };

  const employes = db.prepare(`
    SELECT e.id, e.matricule, e.nom, e.prenom, e.categorie_id, e.photo_url, c.libelle AS categorie
    FROM employes e
    JOIN categories c ON c.id = e.categorie_id
    WHERE e.actif = 1
    ORDER BY CAST(e.matricule AS INTEGER), e.matricule
  `).all().map((e) => {
    const solde = soldeEmploye(e.id);
    const solde_maladie = soldeEmploye(e.id, 'maladie');
    const consomme = db.prepare(`
      SELECT COALESCE(SUM(jours),0) AS c FROM mouvements
      WHERE employe_id = ? AND type_operation = 'prelevement' AND solde_type = 'conge' AND strftime('%Y', date_operation) = ?
    `).get(e.id, annee).c;
    const consomme_maladie = db.prepare(`
      SELECT COALESCE(SUM(jours),0) AS c FROM mouvements
      WHERE employe_id = ? AND type_operation = 'maladie' AND solde_type = 'maladie' AND strftime('%Y', date_operation) = ?
    `).get(e.id, annee).c;
    return { ...e, solde, solde_maladie, consomme, consomme_maladie };
  });

  const parCategorie = db.prepare(`
    SELECT c.id, c.libelle,
      COUNT(DISTINCT e.id) AS nb_employes,
      COALESCE(SUM(CASE
        WHEN m.type_operation IN ('solde_initial','ajout_annuel') THEN m.jours
        WHEN m.type_operation = 'prelevement' THEN -m.jours
        ELSE 0 END), 0) AS solde_total
    FROM categories c
    LEFT JOIN employes e ON e.categorie_id = c.id AND e.actif = 1
    LEFT JOIN mouvements m ON m.employe_id = e.id
    GROUP BY c.id
    ORDER BY c.libelle
  `).all();

  const mensuel = db.prepare(`
    SELECT CAST(strftime('%m', date_operation) AS INTEGER) AS mois, COALESCE(SUM(jours),0) AS jours
    FROM mouvements
    WHERE type_operation = 'prelevement' AND strftime('%Y', date_operation) = ?
    GROUP BY mois
    ORDER BY mois
  `).all(annee);

  const mensuelMaladie = db.prepare(`
    SELECT CAST(strftime('%m', date_operation) AS INTEGER) AS mois, COALESCE(SUM(jours),0) AS jours
    FROM mouvements
    WHERE type_operation = 'maladie' AND solde_type = 'maladie' AND strftime('%Y', date_operation) = ?
    GROUP BY mois
    ORDER BY mois
  `).all(annee);

  const alertes = {
    faible: employes.filter((e) => e.solde >= 0 && e.solde < SEUIL_ALERTE),
    negatif: employes.filter((e) => e.solde < 0),
  };

  return {
    annee,
    seuilAlerte: SEUIL_ALERTE,
    nbEmployes,
    accordeAnnee: anneeTotal('solde_initial') + anneeTotal('ajout_annuel'),
    consommeAnnee: anneeTotal('prelevement'),
    soldeGlobal: employes.reduce((s, e) => s + e.solde, 0),
    accordeMaladieAnnee: anneeTotalMaladie('solde_initial') + anneeTotalMaladie('ajout_annuel'),
    consommeMaladieAnnee: anneeTotalMaladie('maladie'),
    soldeMaladieGlobal: employes.reduce((s, e) => s + e.solde_maladie, 0),
    nbAlertes: alertes.faible.length + alertes.negatif.length,
    parCategorie,
    mensuel,
    mensuelMaladie,
    employes,
    alertes,
  };
  }));
});

const MOIS_ABBR = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

function estOuvrable(d) {
  const wd = new Date(d + 'T00:00:00').getDay();
  return wd !== 0 && wd !== 6;
}

// Échelle d'évaluation (0 à 5 étoiles) selon le % de journées conformes (sans retard / sortie régulière)
function noteEtoiles(conformes, total) {
  if (!total) return null;
  const pct = (conformes / total) * 100;
  if (pct >= 97.5) return 5;
  if (pct >= 92) return 4;
  if (pct >= 82) return 3;
  if (pct >= 65) return 2;
  if (pct >= 40) return 1;
  return 0;
}

// ---- Audit dashboard : filtre unique (granularité + période + employé) appliqué à tous les graphiques ----
// ?granularite=jour|mois|annee (défaut mois) &debut=&fin= (défaut année en cours) &employe_id=|matricule=
router.get('/audit', (req, res) => {
  const granularite = ['jour', 'mois', 'annee'].includes(req.query.granularite) ? req.query.granularite : 'mois';
  const anneeCourante = String(new Date().getFullYear());
  const debut = String(req.query.debut || `${anneeCourante}-01-01`);
  const fin = String(req.query.fin || `${anneeCourante}-12-31`);
  const employe_id = req.query.employe_id ? Number(req.query.employe_id) : null;
  const matricule = String(req.query.matricule || '').trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(debut) || !/^\d{4}-\d{2}-\d{2}$/.test(fin) || fin < debut) {
    return res.status(400).json({ error: 'Période invalide (AAAA-MM-JJ, fin ≥ début).' });
  }

  // Employés concernés par le filtre (tous par défaut)
  let employes;
  if (employe_id) {
    employes = db.prepare(`
      SELECT e.id, e.matricule, e.nom, e.prenom, e.photo_url, c.libelle AS categorie
      FROM employes e JOIN categories c ON c.id = e.categorie_id
      WHERE e.id = ? AND e.actif = 1
    `).all(employe_id);
  } else if (matricule) {
    const n = parseInt(matricule, 10);
    employes = db.prepare(`
      SELECT e.id, e.matricule, e.nom, e.prenom, e.photo_url, c.libelle AS categorie
      FROM employes e JOIN categories c ON c.id = e.categorie_id
      WHERE (e.matricule = ? OR CAST(e.matricule AS INTEGER) = ?) AND e.actif = 1
    `).all(matricule, isNaN(n) ? -1 : n);
  } else {
    employes = db.prepare(`
      SELECT e.id, e.matricule, e.nom, e.prenom, e.photo_url, c.libelle AS categorie
      FROM employes e JOIN categories c ON c.id = e.categorie_id
      WHERE e.actif = 1
      ORDER BY CAST(e.matricule AS INTEGER), e.matricule
    `).all();
  }
  if (!employes.length) return res.status(404).json({ error: 'Aucun employé ne correspond au filtre.' });

  res.json(dashMemo('audit:' + req.originalUrl, () => {
  const ids = employes.map((e) => e.id);

  const jours = joursEntre(debut, fin);
  if (jours.length > 400) return res.status(400).json({ error: 'Période trop longue (400 jours max).' });
  const joursSet = new Set(jours);
  const idsSet = new Set(ids);

  // Heures légales par jour (calendrier annuel partagé)
  const legalMap = {};
  for (let a = Number(debut.slice(0, 4)); a <= Number(fin.slice(0, 4)); a++) {
    for (const r of db.prepare('SELECT date, heures FROM jours_travail WHERE annee = ?').all(a)) {
      legalMap[r.date] = Number(r.heures) || 0;
    }
  }

  // Heures travaillées par jour et par employé
  const travailMap = {};
  const travailEmp = {};
  const hRows = db.prepare(`
    SELECT employe_id, date, duree_secondes FROM horaires_travail
    WHERE employe_id IN (${placeholders(ids.length)}) AND date >= ? AND date <= ?
  `).all(...ids, debut, fin);
  for (const r of hRows) {
    const h = Number(r.duree_secondes) / 3600;
    travailMap[r.date] = (travailMap[r.date] || 0) + h;
    if (!travailEmp[r.employe_id]) travailEmp[r.employe_id] = {};
    travailEmp[r.employe_id][r.date] = (travailEmp[r.employe_id][r.date] || 0) + h;
  }

  // Congés acceptés / arrêts validés chevauchant la période
  // (l'absence est DÉDUITE : jour ouvrable sans badge ET sans congé validé ET sans maladie acceptée)
  const conges = db.prepare(`
    SELECT employe_id, date_debut, date_fin FROM demandes_conge
    WHERE statut = 'acceptee' AND date_debut <= ? AND date_fin >= ?
  `).all(fin, debut);
  const arrets = db.prepare(`
    SELECT employe_id, date_debut, date_fin FROM arrets_maladie
    WHERE statut = 'valide' AND date_debut <= ? AND date_fin >= ?
  `).all(fin, debut);

  const jourConge = {};
  const jourMaladie = {};
  const empConge = {};
  const empMaladie = {};
  const marquer = (jourMap, empMap, empId, dD, dF) => {
    const s = dD > debut ? dD : debut;
    const e = dF < fin ? dF : fin;
    if (e < s) return;
    const cur = new Date(s + 'T00:00:00');
    const end = new Date(e + 'T00:00:00');
    while (cur <= end) {
      const d = iso(cur);
      if (joursSet.has(d) && estOuvrable(d)) {
        jourMap[d] = (jourMap[d] || 0) + 1;
        empMap[empId] = (empMap[empId] || 0) + 1;
      }
      cur.setDate(cur.getDate() + 1);
    }
  };
  for (const c of conges) if (idsSet.has(c.employe_id)) marquer(jourConge, empConge, c.employe_id, c.date_debut, c.date_fin);
  for (const a of arrets) if (idsSet.has(a.employe_id)) marquer(jourMaladie, empMaladie, a.employe_id, a.date_debut, a.date_fin);

  // --- Présence & ponctualité (depuis les pointages bruts) ---
  const ramadanByAnnee = {};
  for (const c of db.prepare('SELECT annee, ramadan_debut, ramadan_fin FROM config_annees').all()) {
    if (c.ramadan_debut && c.ramadan_fin) ramadanByAnnee[c.annee] = { debut: c.ramadan_debut, fin: c.ramadan_fin };
  }
  const pRows = db.prepare(`
    SELECT p.employe_id, p.date, p.horodatage, c.libelle AS categorie
    FROM pointages p
    JOIN employes e ON e.id = p.employe_id
    JOIN categories c ON c.id = e.categorie_id
    WHERE p.employe_id IN (${placeholders(ids.length)}) AND p.date >= ? AND p.date <= ?
    ORDER BY p.employe_id, p.date, p.horodatage
  `).all(...ids, debut, fin);
  const pointagesJour = {};
  const pointagesEmp = {};
  const pointagesCat = {};
  const pointagesKey = (g) => `${g.employe_id}|${g.date}`;
  const agregPointage = (map, key, delta) => {
    if (!map[key]) map[key] = { journees: 0, presents: 0, retards: 0, departs: 0, retardsSec: 0, departsSec: 0, uniques: 0, conformes: 0 };
    const o = map[key];
    o.journees += delta.journees;
    o.presents += delta.presents;
    o.retards += delta.retards;
    o.departs += delta.departs;
    o.retardsSec += delta.retardsSec;
    o.departsSec += delta.departsSec;
    o.uniques += delta.uniques;
    o.conformes += delta.conformes;
  };
  const parJour = new Map();
  for (const r of pRows) {
    const key = pointagesKey(r);
    if (!parJour.has(key)) parJour.set(key, { employe_id: r.employe_id, date: r.date, categorie: r.categorie, nb: 0, min: null, max: null });
    const g = parJour.get(key);
    g.nb += 1;
    if (g.min === null || r.horodatage < g.min) g.min = r.horodatage;
    if (g.max === null || r.horodatage > g.max) g.max = r.horodatage;
  }
  // Corrections manuelles des retards / sorties anticipées (rubrique Présences & pointages)
  const corrMap = new Map();
  for (const c of db.prepare('SELECT employe_id, date, retard_secondes, sortie_anticipee_secondes FROM corrections_pointages').all()) {
    corrMap.set(`${c.employe_id}|${c.date}`, c);
  }
  for (const g of parJour.values()) {
    const annee = Number(g.date.slice(0, 4));
    const horaire = horairePour(normaliser(g.categorie), g.date, ramadanByAnnee[annee] || null);
    const entree = String(g.min || '').slice(11, 19);
    const sortie = g.nb >= 2 ? String(g.max || '').slice(11, 19) : null;
    let retardSec = horaire ? retardComptable(diffSecondes(entree, horaire.entree) || 0) : 0;
    let depSec = horaire && sortie ? sortieAnticipeeComptable(diffSecondes(horaire.sortie, sortie) || 0) : 0;
    const corr = corrMap.get(`${g.employe_id}|${g.date}`);
    if (corr && corr.retard_secondes !== null) retardSec = corr.retard_secondes;
    if (corr && corr.sortie_anticipee_secondes !== null) depSec = corr.sortie_anticipee_secondes;
    const statut = statutPour({ nb: g.nb, horaire, retardSec, sortieSec: depSec });
    const delta = {
      journees: 1,
      presents: estOuvrable(g.date) ? 1 : 0,
      retards: retardSec > 0 ? 1 : 0,
      departs: depSec > 0 ? 1 : 0,
      retardsSec: retardSec,
      departsSec: depSec,
      uniques: statut === 'Pointage unique' ? 1 : 0,
      conformes: statut === 'Conforme' ? 1 : 0,
    };
    agregPointage(pointagesJour, g.date, delta);
    agregPointage(pointagesEmp, g.employe_id, delta);
    agregPointage(pointagesCat, g.categorie, delta);
  }

  // Agrégation par bucket (jour / mois / année)
  const bucketKey = (d) => {
    if (granularite === 'jour') return d;
    if (granularite === 'annee') return d.slice(0, 4);
    return d.slice(0, 7);
  };
  const bucketLabel = (k) => {
    if (granularite === 'jour') return k;
    if (granularite === 'annee') return k;
    const [y, m] = k.split('-');
    return `${MOIS_ABBR[Number(m) - 1]} ${y}`;
  };
  const buckets = {};
  for (const d of jours) {
    const k = bucketKey(d);
    if (!buckets[k]) buckets[k] = {
      key: k, label: bucketLabel(k),
      legal_heures: 0, travaille_heures: 0, jours_ouvrables: 0,
      jours_conge: 0, jours_maladie: 0, jours_absence: 0,
      journees_presence: 0, jours_presents: 0, retards: 0, retard_secondes: 0,
      departs_anticipe: 0, sortie_anticipee_secondes: 0,
      pointages_uniques: 0, conformes: 0,
    };
    const b = buckets[k];
    b.legal_heures += legalMap[d] || 0;
    b.travaille_heures += travailMap[d] || 0;
    if (estOuvrable(d)) b.jours_ouvrables += 1;
    b.jours_conge += jourConge[d] || 0;
    b.jours_maladie += jourMaladie[d] || 0;
    const pp = pointagesJour[d];
    if (pp) {
      b.journees_presence += pp.journees;
      b.jours_presents += pp.presents;
      b.retards += pp.retards;
      b.retard_secondes += pp.retardsSec;
      b.departs_anticipe += pp.departs;
      b.sortie_anticipee_secondes += pp.departsSec;
      b.pointages_uniques += pp.uniques;
      b.conformes += pp.conformes;
    }
  }

  const effectif = employes.length;
  const series = Object.values(buckets).map((b) => {
    // Absence = jour ouvrable sans badge ET sans congé validé ET sans maladie acceptée
    const absence_calc = Math.max(0, b.jours_ouvrables * effectif - b.jours_presents - b.jours_conge - b.jours_maladie);
    // Le calendrier des heures légales s'applique à chaque employé : total = heures du jour × effectif
    const legal_total = b.legal_heures * effectif;
    const presence_pct = legal_total ? Math.round((b.travaille_heures / legal_total) * 1000) / 10 : null;
    const jours_presence = b.jours_presents;
    return {
      ...b,
      jours_absence: absence_calc,
      legal_heures: Math.round(legal_total * 100) / 100,
      travaille_heures: Math.round(b.travaille_heures * 100) / 100,
      presence_pct,
      jours_presence,
    };
  });

  const totLegal = series.reduce((s, b) => s + b.legal_heures, 0);
  const totTrav = series.reduce((s, b) => s + b.travaille_heures, 0);
  const totConge = series.reduce((s, b) => s + b.jours_conge, 0);
  const totMaladie = series.reduce((s, b) => s + b.jours_maladie, 0);
  const totAbsence = series.reduce((s, b) => s + b.jours_absence, 0);
  const totOuvrables = series.reduce((s, b) => s + b.jours_ouvrables, 0);
  const presence_pct = totLegal ? Math.round((totTrav / totLegal) * 1000) / 10 : null;
  const totJournees = series.reduce((s, b) => s + b.journees_presence, 0);
  const totPresents = series.reduce((s, b) => s + b.jours_presents, 0);
  const totRetards = series.reduce((s, b) => s + b.retards, 0);
  const totRetardSec = series.reduce((s, b) => s + b.retard_secondes, 0);
  const totDeparts = series.reduce((s, b) => s + b.departs_anticipe, 0);
  const totDepartsSec = series.reduce((s, b) => s + b.sortie_anticipee_secondes, 0);
  const totUniques = series.reduce((s, b) => s + b.pointages_uniques, 0);
  const ponctualite = totJournees ? Math.round(((totJournees - totRetards) / totJournees) * 1000) / 10 : null;
  const sortiesConformes = totJournees ? Math.round(((totJournees - totDeparts) / totJournees) * 1000) / 10 : null;
  // Jours présents / absences en % des jours légaux de travail (jours ouvrables × effectif)
  const joursLegauxTotaux = totOuvrables * effectif;
  const jours_presents_pct = joursLegauxTotaux ? Math.round((totPresents / joursLegauxTotaux) * 1000) / 10 : null;
  const jours_absence_pct = joursLegauxTotaux ? Math.round((totAbsence / joursLegauxTotaux) * 1000) / 10 : null;

  // Soldes congé / maladie (cumul) pour le baromètre de consommation
  const soldeAgg = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN solde_type='conge' AND type_operation IN ('solde_initial','ajout_annuel') THEN jours ELSE 0 END),0) AS accorde_conge,
      COALESCE(SUM(CASE WHEN solde_type='conge' AND type_operation='prelevement' THEN jours ELSE 0 END),0) AS consomme_conge,
      COALESCE(SUM(CASE WHEN solde_type='maladie' AND type_operation IN ('solde_initial','ajout_annuel') THEN jours ELSE 0 END),0) AS accorde_maladie,
      COALESCE(SUM(CASE WHEN solde_type='maladie' AND type_operation='maladie' THEN jours ELSE 0 END),0) AS consomme_maladie
    FROM mouvements WHERE employe_id IN (${placeholders(ids.length)})
  `).get(...ids);
  const soldeConge = employes.reduce((s, e) => s + soldeEmploye(e.id), 0);
  const soldeMaladie = employes.reduce((s, e) => s + soldeEmploye(e.id, 'maladie'), 0);

  // Alertes de solde congé
  const alertes = employes.filter((e) => soldeEmploye(e.id) < SEUIL_ALERTE);

  // Demandes en instance
  const enInstance = {
    demandes: db.prepare("SELECT COUNT(*) AS n FROM demandes_conge WHERE statut = 'en_instance'").get().n,
    arrets: db.prepare("SELECT COUNT(*) AS n FROM arrets_maladie WHERE statut = 'en_instance'").get().n,
  };

  // Détail par employé
  const legalParJour = jours.reduce((s, d) => s + (legalMap[d] || 0), 0);
  const joursOuvrablesPeriode = jours.reduce((s, d) => s + (estOuvrable(d) ? 1 : 0), 0);
  const employesDetail = employes.map((e) => {
    const trav = travailEmp[e.id] || {};
    let travaille = 0;
    for (const d of jours) travaille += trav[d] || 0;
    travaille = Math.round(travaille * 100) / 100;
    const pp = pointagesEmp[e.id] || {};
    const journees = pp.journees || 0;
    const retards = pp.retards || 0;
    const departs = pp.departs || 0;
    const jours_presents = pp.presents || 0;
    const jours_conge = empConge[e.id] || 0;
    const jours_maladie = empMaladie[e.id] || 0;
    // Absence = jour ouvrable sans badge (0 h au badgeage) ET sans congé validé ET sans maladie acceptée
    const jours_absence = Math.max(0, joursOuvrablesPeriode - jours_presents - jours_conge - jours_maladie);
    const jours_presents_pct = joursOuvrablesPeriode ? Math.round((jours_presents / joursOuvrablesPeriode) * 1000) / 10 : null;
    const jours_absence_pct = joursOuvrablesPeriode ? Math.round((jours_absence / joursOuvrablesPeriode) * 1000) / 10 : null;
    return {
      ...e,
      travaille_heures: travaille,
      legal_heures: Math.round(legalParJour * 100) / 100,
      presence_pct: legalParJour ? Math.round((travaille / legalParJour) * 1000) / 10 : null,
      jours_ouvrables: joursOuvrablesPeriode,
      jours_presents,
      jours_presents_pct,
      jours_absence,
      jours_absence_pct,
      jours_conge,
      jours_maladie,
      solde_conge: soldeEmploye(e.id),
      solde_maladie: soldeEmploye(e.id, 'maladie'),
      journees_presence: journees,
      retards,
      retard_secondes: pp.retardsSec || 0,
      departs_anticipe: departs,
      sortie_anticipee_secondes: pp.departsSec || 0,
      etoiles_retard: noteEtoiles(journees - retards, journees),
      etoiles_sortie: noteEtoiles(journees - departs, journees),
    };
  });

  // Répartition par catégorie
  const parCategorieAudit = Object.values(employesDetail.reduce((acc, e) => {
    if (!acc[e.categorie]) acc[e.categorie] = { categorie: e.categorie, nb_employes: 0, travaille_heures: 0, legal_heures: 0, jours_conge: 0, jours_maladie: 0, jours_absence: 0, jours_presents: 0, jours_ouvrables: 0, journees_presence: 0, retards: 0, retard_secondes: 0, departs_anticipe: 0, sortie_anticipee_secondes: 0 };
    const c = acc[e.categorie];
    c.nb_employes += 1;
    c.travaille_heures += e.travaille_heures;
    c.legal_heures += e.legal_heures;
    c.jours_conge += e.jours_conge;
    c.jours_maladie += e.jours_maladie;
    c.jours_absence += e.jours_absence;
    c.jours_presents += e.jours_presents;
    c.jours_ouvrables += e.jours_ouvrables;
    c.journees_presence += e.journees_presence;
    c.retards += e.retards;
    c.retard_secondes += e.retard_secondes;
    c.departs_anticipe += e.departs_anticipe;
    c.sortie_anticipee_secondes += e.sortie_anticipee_secondes;
    return acc;
  }, {})).map((c) => ({
    ...c,
    travaille_heures: Math.round(c.travaille_heures * 100) / 100,
    legal_heures: Math.round(c.legal_heures * 100) / 100,
    presence_pct: c.legal_heures ? Math.round((c.travaille_heures / c.legal_heures) * 1000) / 10 : null,
    jours_presents_pct: c.jours_ouvrables ? Math.round((c.jours_presents / c.jours_ouvrables) * 1000) / 10 : null,
    jours_absence_pct: c.jours_ouvrables ? Math.round((c.jours_absence / c.jours_ouvrables) * 1000) / 10 : null,
    etoiles_retard: noteEtoiles(c.journees_presence - c.retards, c.journees_presence),
    etoiles_sortie: noteEtoiles(c.journees_presence - c.departs_anticipe, c.journees_presence),
  }));

  // Calendrier jour par jour (pour l'employé filtré uniquement) : présence / congé / maladie / absence / repos
  const calendrier = (employe_id || matricule) ? jours.map((d) => {
    const pj = pointagesJour[d];
    const ouvrable = estOuvrable(d) ? 1 : 0;
    const badge = pj ? pj.journees : 0;
    const present = pj ? pj.presents : 0;
    const conge = jourConge[d] || 0;
    const maladie = jourMaladie[d] || 0;
    const absence = Math.max(0, ouvrable * ids.length - present - conge - maladie);
    return { date: d, ouvrable, heures: legalMap[d] || 0, badge, present, conge, maladie, absence };
  }) : [];

  return {
    filtre: { granularite, debut, fin, employe_id, matricule },
    periode: { debut, fin },
    effectif,
    kpis: {
      effectif,
      heures_legales: Math.round(totLegal * 100) / 100,
      heures_travaillees: Math.round(totTrav * 100) / 100,
      presence_pct,
      jours_presents: totPresents,
      jours_presents_pct,
      jours_presence: totPresents,
      jours_absence: totAbsence,
      jours_absence_pct,
      jours_conge: totConge,
      jours_maladie: totMaladie,
      jours_ouvrables: totOuvrables,
      solde_conge: soldeConge,
      solde_maladie: soldeMaladie,
      accorde_conge: soldeAgg.accorde_conge,
      consomme_conge: soldeAgg.consomme_conge,
      accorde_maladie: soldeAgg.accorde_maladie,
      consomme_maladie: soldeAgg.consomme_maladie,
      alertes: alertes.length,
      en_instance: enInstance,
      journees_presence: totJournees,
      retards: totRetards,
      retard_secondes: totRetardSec,
      departs_anticipe: totDeparts,
      sortie_anticipee_secondes: totDepartsSec,
      pointages_uniques: totUniques,
      note_retards: noteEtoiles(totJournees - totRetards, totJournees),
      note_sorties: noteEtoiles(totJournees - totDeparts, totJournees),
    },
    barometres: {
      presence: presence_pct,
      conge: soldeAgg.accorde_conge ? Math.round((soldeAgg.consomme_conge / soldeAgg.accorde_conge) * 1000) / 10 : null,
      maladie: soldeAgg.accorde_maladie ? Math.round((soldeAgg.consomme_maladie / soldeAgg.accorde_maladie) * 1000) / 10 : null,
      absence: jours_absence_pct,
      jours_presence: jours_presents_pct,
      absence_jours: jours_absence_pct,
      ponctualite,
      sorties_conformes: sortiesConformes,
    },
    series,
    calendrier,
    parCategorie: parCategorieAudit,
    employes: employesDetail,
    alertes,
  };
  }));
});

module.exports = router;
