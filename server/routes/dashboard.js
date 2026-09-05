const { Router } = require('express');
const { db, soldeEmploye, soldeCongeRestantDate } = require('../db');
const { onDataChanged } = require('./dataSync');
const presence = require('./presence');
const { normaliser, horairePour, diffSecondes, statutPour, retardComptable, sortieAnticipeeComptable } = presence;
const router = Router();

const SEUIL_ALERTE = 5;

// Solde de congé restant « selon calendrier », restreint à la période [debut, fin] du filtre :
//   solde restant = (solde_initial + ajout_annuel dont la période chevauche [debut, fin])
//                   − (prélèvements de congé du journal RMA dont le jour est dans [debut, fin])
// Les crédits sont pris sur leur période (date_debut→date_fin, chevauchement) ; le prélèvement
// CA/DJ est compté depuis la source de vérité codes_importes (CA = 1 jour, DJ demi-journée = 0,5) —
// chaque cellule CA/DJ de la grille RMA compte dans la période.
function soldeCongePeriode(employeId, debut, fin) {
  const credits = db.prepare(`
    SELECT COALESCE(SUM(jours),0) AS c FROM mouvements
    WHERE employe_id = ? AND solde_type = 'conge'
      AND type_operation IN ('solde_initial','ajout_annuel')
      AND date_debut <= ? AND date_fin >= ?
  `).get(employeId, fin, debut).c;
  // Prélèvement CA/DJ du journal RMA (source de vérité : codes_importes) : chaque cellule de la
  // grille est un jour de congé consommé dans la période, sans exclusion calendaire (férié/week-end)
  // ni couverture par demande acceptée — miroir exact de la grille RMA et du « Journal du solde ».
  const prlv = db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN ci.code = 'DJ' THEN 0.5 WHEN ci.demi_journee = 1 THEN 0.5 ELSE 1 END),0) AS c
    FROM codes_importes ci
    WHERE ci.employe_id = ? AND ci.code IN ('CA','DJ') AND ci.date >= ? AND ci.date <= ?
  `).get(employeId, debut, fin).c;
  return Math.round((credits - prlv) * 1000) / 1000;
}

// Cache court (10 s) pour les agrégats lourds du tableau de bord (mêmes données pour tous les
// lecteurs, mais ~26 000 pointages + N+1 solde récalculés à chaque navigation). Légère fraîcheur
// maximale : 10 s après une écriture — acceptable pour un tableau de bord.
const DASH_CACHE_TTL = 30000;
const DASH_CACHE_MAX = 80;
const dashCache = new Map();
function dashMemo(key, build) {
  const hit = dashCache.get(key);
  if (hit && Date.now() - hit.t < DASH_CACHE_TTL) return hit.v;
  const v = build();
  // LRU : éviction si trop d'entrées
  if (dashCache.size >= DASH_CACHE_MAX) {
    const firstKey = dashCache.keys().next().value;
    dashCache.delete(firstKey);
  }
  dashCache.set(key, { v, t: Date.now() });
  return v;
}
// Auto-vidage toutes les 60s pour éviter mémoire résiduelle + données obsolètes
setInterval(() => {
  const now = Date.now();
  for (const [k, { t }] of dashCache) if (now - t > DASH_CACHE_TTL) dashCache.delete(k);
  if (dashCache.size > DASH_CACHE_MAX) {
    const toDelete = dashCache.size - DASH_CACHE_MAX;
    let i = 0; for (const k of dashCache.keys()) { if (i++ >= toDelete) break; dashCache.delete(k); }
  }
}, 60000).unref();
// Expose pour invalidation manuelle après écriture (demandes/mouvements)
function clearDashCache() { dashCache.clear(); }
// Invalidation « temps réel » : appelée par le bus dataSync après toute écriture API réussie.
onDataChanged(clearDashCache);

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
      AND NOT (solde_type = 'conge' AND COALESCE(motif,'') LIKE 'RMA%restauration%')
    GROUP BY type_operation, solde_type
  `).all(annee);
  const anneeTotal = (t) => { const r = anneeStats.find((x) => x.type_operation === t && x.solde_type === 'conge'); return r ? r.total : 0; };
  const anneeTotalMaladie = (t) => { const r = anneeStats.find((x) => x.type_operation === t && x.solde_type === 'maladie'); return r ? r.total : 0; };

  // Solde maladie : grand livre (source maladie inchangée — pas de journal RMA maladie).
  const soldeMalRows = db.prepare(`
    SELECT employe_id,
      COALESCE(SUM(CASE WHEN type_operation IN ('solde_initial','ajout_annuel') THEN jours WHEN type_operation='maladie' THEN -jours ELSE 0 END),0) AS s
    FROM mouvements WHERE solde_type = 'maladie' GROUP BY employe_id
  `).all();
  const soldeMalMap = new Map(soldeMalRows.map(r=>[r.employe_id, Math.round(r.s*1000)/1000]));
  const consMalRows = db.prepare(`SELECT employe_id, COALESCE(SUM(jours),0) AS c FROM mouvements WHERE type_operation='maladie' AND solde_type='maladie' AND strftime('%Y',date_operation)=? GROUP BY employe_id`).all(annee);
  const consMalMap = new Map(consMalRows.map(r=>[r.employe_id, r.c]));
  // Prélèvements de congé depuis la source de vérité « Journal du solde de congé » (codes_importes
  // CA/DJ) — même règle que soldeCongeRestantDate : chaque cellule de la grille RMA est consommée,
  // sans exclusion calendaire (férié/week-end) ni couverture par demande acceptée. Ces valeurs
  // alimentent solde, parCategorie, la courbe mensuelle et la consommation annuelle, donc
  // synchronisées avec la fiche, Mon Espace et le journal RMA.
  const rmaRows = db.prepare(`
    SELECT employe_id, substr(date,1,7) AS mois,
      COALESCE(SUM(CASE WHEN code = 'DJ' OR demi_journee = 1 THEN 0.5 ELSE 1 END),0) AS jours
    FROM codes_importes
    WHERE code IN ('CA','DJ') AND strftime('%Y',date) = ?
    GROUP BY employe_id, substr(date,1,7)
  `).all(annee);
  const rmaParEmp = new Map();   // employe_id → jours consommés dans l'année
  const rmaParMois = {};         // 'AAAA-MM' → jours consommés
  for (const r of rmaRows) {
    rmaParEmp.set(r.employe_id, (rmaParEmp.get(r.employe_id) || 0) + r.jours);
    rmaParMois[r.mois] = (rmaParMois[r.mois] || 0) + r.jours;
  }
  const employes = db.prepare(`
    SELECT e.id, e.matricule, e.nom, e.prenom, e.categorie_id, e.photo_url, c.libelle AS categorie
    FROM employes e
    JOIN categories c ON c.id = e.categorie_id
    WHERE e.actif = 1
    ORDER BY CAST(e.matricule AS INTEGER), e.matricule
  `).all().map((e) => {
    // Solde de congé restant cohérent avec la fiche et le journal RMA (accorde − consomme RMA)
    const solde = soldeCongeRestantDate(e.id);
    const solde_maladie = soldeMalMap.get(e.id) || 0;
    const consomme = rmaParEmp.get(e.id) || 0;
    const consomme_maladie = consMalMap.get(e.id) || 0;
    return { ...e, solde, solde_maladie, consomme, consomme_maladie };
  });

  const catByEmp = {};
  for (const e of employes) {
    const a = catByEmp[e.categorie_id] || (catByEmp[e.categorie_id] = { nb: 0, solde: 0 });
    a.nb += 1; a.solde += e.solde;
  }
  const parCategorie = db.prepare('SELECT id, libelle FROM categories ORDER BY libelle').all().map((c) => {
    const a = catByEmp[c.id] || { nb: 0, solde: 0 };
    return { id: c.id, libelle: c.libelle, nb_employes: a.nb, solde_total: Math.round(a.solde * 1000) / 1000 };
  });

  const mensuel = Object.entries(rmaParMois)
    .map(([mois, jours]) => ({ mois: parseInt(mois.slice(5), 10), jours: Math.round(jours * 1000) / 1000 }))
    .sort((a, b) => a.mois - b.mois);

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
    consommeAnnee: Math.round(employes.reduce((s, e) => s + e.consomme, 0) * 1000) / 1000,
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

// ---- Audit dashboard : filtre unique (granularité + période + catégorie + employé) appliqué à tous les graphiques ----
// ?granularite=jour|mois|annee (défaut mois) &debut=&fin= &categorie_id= &employe_id=|matricule=
router.get('/audit', (req, res) => {
  const granularite = ['jour', 'mois', 'annee'].includes(req.query.granularite) ? req.query.granularite : 'mois';
  const anneeCourante = String(new Date().getFullYear());
  const debut = String(req.query.debut || `${anneeCourante}-01-01`);
  const fin = String(req.query.fin || `${anneeCourante}-12-31`);
  const employe_id = req.query.employe_id ? Number(req.query.employe_id) : null;
  const matricule = String(req.query.matricule || '').trim();
  const categorie_id = req.query.categorie_id ? Number(req.query.categorie_id) : null;
  const departement = String(req.query.departement || '').trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(debut) || !/^\d{4}-\d{2}-\d{2}$/.test(fin) || fin < debut) {
    return res.status(400).json({ error: 'Période invalide (AAAA-MM-JJ, fin ≥ début).' });
  }

  // Employés concernés par le filtre (tous par défaut) — catégorie et employé se combinent
  let where = 'e.actif = 1';
  const wparams = [];
  if (categorie_id) { where += ' AND e.categorie_id = ?'; wparams.push(categorie_id); }
  if (departement) { where += ' AND e.departement = ?'; wparams.push(departement); }
  if (employe_id) { where += ' AND e.id = ?'; wparams.push(employe_id); }
  else if (matricule) {
    const n = parseInt(matricule, 10);
    where += ' AND (e.matricule = ? OR CAST(e.matricule AS INTEGER) = ?)';
    wparams.push(matricule, isNaN(n) ? -1 : n);
  }
  const employes = db.prepare(`
    SELECT e.id, e.matricule, e.nom, e.prenom, e.photo_url, c.libelle AS categorie
    FROM employes e JOIN categories c ON c.id = e.categorie_id
    WHERE ${where}
    ORDER BY CAST(e.matricule AS INTEGER), e.matricule
  `).all(...wparams);
  if (!employes.length) return res.status(404).json({ error: 'Aucun employé ne correspond au filtre.' });

  const payload = dashMemo('audit:' + req.originalUrl, () => {
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
    SELECT employe_id, date_debut, date_fin, demi_journee, nombre_jours, nature_conge FROM demandes_conge
    WHERE statut = 'acceptee' AND date_debut <= ? AND date_fin >= ?
  `).all(fin, debut);
  const arrets = db.prepare(`
    SELECT employe_id, date_debut, date_fin FROM arrets_maladie
    WHERE statut = 'valide' AND date_debut <= ? AND date_fin >= ?
  `).all(fin, debut);

  const jourConge = {};
  const jourCE = {};
  const jourMaladie = {};
  const jourDemi = {};
  const jourCongeDemi = {};
  const empConge = {};
  const empCE = {};
  const empMaladie = {};
  // Jours de maladie par employé (pour déduire les heures d'arrêts validés des heures à travailler)
  const empMaladieJours = {};
  const marquer = (jourMap, empMap, empId, dD, dF, demiFin, empJours) => {
    const s = dD > debut ? dD : debut;
    const e = dF < fin ? dF : fin;
    if (e < s) return;
    const cur = new Date(s + 'T00:00:00');
    const end = new Date(e + 'T00:00:00');
    while (cur <= end) {
      const d = iso(cur);
      // Jour ouvrable = jour PRÉVU au calendrier administratif (heures > 0) :
      // les jours de repos hebdomadaire et les jours fériés payés (nationaux, religieux,
      // manuels à 0 h) sont exclus des congés/maladies comme des taux.
      if (joursSet.has(d) && (legalMap[d] || 0) > 0) {
        // Demi-journée : la date de fin de la demande compte pour 0,5
        const inc = demiFin && d === dF ? 0.5 : 1;
        jourMap[d] = (jourMap[d] || 0) + inc;
        empMap[empId] = (empMap[empId] || 0) + inc;
        if (empJours) {
          if (!empJours[empId]) empJours[empId] = {};
          empJours[empId][d] = (empJours[empId][d] || 0) + inc;
        }
        if (inc === 0.5) {
          jourDemi[d] = 1;
          jourCongeDemi[d] = (jourCongeDemi[d] || 0) + 0.5;
        }
      }
      cur.setDate(cur.getDate() + 1);
    }
  };
  // Demi-journée : flag explicite OU valeur fractionnaire héritée d'une saisie manuelle
  // (répare les demandes créées avant la normalisation : 1,5 j sur 2 jours => dernier jour à 0,5)
  for (const c of conges) if (idsSet.has(c.employe_id)) {
    const isCE = c.nature_conge === 'exceptionnel';
    marquer(isCE ? jourCE : jourConge, isCE ? empCE : empConge, c.employe_id, c.date_debut, c.date_fin, !!c.demi_journee || !Number.isInteger(Number(c.nombre_jours)));
  }
  for (const a of arrets) if (idsSet.has(a.employe_id)) marquer(jourMaladie, empMaladie, a.employe_id, a.date_debut, a.date_fin, false, empMaladieJours);

  // ---- Complément RMA manuel : CA/MA importés manuellement (sans demande/arrêt) ----
  // Évite le double comptage : ne compte que les dates ouvrables non déjà couvertes par une demande/arrêt
  const couvreConge = new Set();
  const couvreCE = new Set();
  const couvreMaladie = new Set();
  for (const c of conges) if (idsSet.has(c.employe_id)) {
    const s = c.date_debut > debut ? c.date_debut : debut;
    const e = c.date_fin < fin ? c.date_fin : fin;
    const cur = new Date(s+'T00:00:00'); const end = new Date(e+'T00:00:00');
    while (cur<=end) { const d=iso(cur); if (joursSet.has(d) && (legalMap[d]||0)>0) {
      if (c.nature_conge === 'exceptionnel') couvreCE.add(c.employe_id+'|'+d); else couvreConge.add(c.employe_id+'|'+d);
      cur.setDate(cur.getDate()+1);
    } else cur.setDate(cur.getDate()+1); }
  }
  for (const a of arrets) if (idsSet.has(a.employe_id)) {
    const s = a.date_debut > debut ? a.date_debut : debut;
    const e = a.date_fin < fin ? a.date_fin : fin;
    const cur = new Date(s+'T00:00:00'); const end = new Date(e+'T00:00:00');
    while (cur<=end) { const d=iso(cur); if (joursSet.has(d) && (legalMap[d]||0)>0) couvreMaladie.add(a.employe_id+'|'+d); cur.setDate(cur.getDate()+1); }
  }
  const rmaRows = db.prepare(`SELECT employe_id, date, code, demi_journee FROM codes_importes WHERE date >= ? AND date <= ? AND code IN ('CA','CE','MA','DJ')`).all(debut, fin);
  for (const r of rmaRows) {
    if (!idsSet.has(r.employe_id) || !joursSet.has(r.date) || (legalMap[r.date]||0)<=0) continue;
    const key = r.employe_id+'|'+r.date;
    // DJ = demi-journée de congé (0,5) ; CA/CE en demi = 0,5 ; sinon 1
    const inc = r.code==='DJ' ? 0.5 : ((r.code==='CA' || r.code==='CE') && r.demi_journee) ? 0.5 : 1;
    if ((r.code==='CA' || r.code==='DJ') && !couvreConge.has(key)) {
      jourConge[r.date]=(jourConge[r.date]||0)+inc;
      empConge[r.employe_id]=(empConge[r.employe_id]||0)+inc;
      if (inc===0.5) { jourDemi[r.date]=1; jourCongeDemi[r.date]=(jourCongeDemi[r.date]||0)+0.5; }
      couvreConge.add(key);
    } else if (r.code==='CE' && !couvreCE.has(key)) {
      jourCE[r.date]=(jourCE[r.date]||0)+inc;
      empCE[r.employe_id]=(empCE[r.employe_id]||0)+inc;
      if (inc===0.5) { jourDemi[r.date]=1; }
      couvreCE.add(key);
    } else if (r.code==='MA' && !couvreMaladie.has(key)) {
      jourMaladie[r.date]=(jourMaladie[r.date]||0)+inc;
      empMaladie[r.employe_id]=(empMaladie[r.employe_id]||0)+inc;
      if (!empMaladieJours[r.employe_id]) empMaladieJours[r.employe_id]={};
      empMaladieJours[r.employe_id][r.date]=(empMaladieJours[r.employe_id][r.date]||0)+inc;
      couvreMaladie.add(key);
    }
  }

  // --- Journée justifiée : badge OR code de présence autorisé (CA/CE/MA/RP/R3/R1/…) ---
  // Seul `A1` (ABSENT) et l'absence de toute codification = absence injustifiée.
  // Ces jours couvrent l'absence mais n'augmentent pas congé/maladie (déjà suivis dans jourConge…).
  const justifieAbs = new Set([...couvreConge, ...couvreCE, ...couvreMaladie]);
  for (const r of db.prepare(`SELECT employe_id, date, code FROM codes_importes WHERE date >= ? AND date <= ? AND code <> 'A1'`).all(debut, fin)) {
    if (idsSet.has(r.employe_id) && joursSet.has(r.date) && (legalMap[r.date] || 0) > 0) {
      justifieAbs.add(r.employe_id + '|' + r.date);
    }
  }

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
  // Durée quotidienne dérivée des badges bruts (repli quand la journée
  // est absente de horaires_travail) : durée = dernier badgeage − premier badgeage
  const badgesEmp = {};
  for (const g of parJour.values()) {
    if (g.nb < 2 || !g.min || !g.max) continue;
    const sec = Math.max(0, Math.round((new Date(String(g.max).replace(' ', 'T')).getTime() - new Date(String(g.min).replace(' ', 'T')).getTime()) / 1000));
    if (!sec) continue;
    if (!badgesEmp[g.employe_id]) badgesEmp[g.employe_id] = {};
    badgesEmp[g.employe_id][g.date] = sec;
  }
  // Le repli badges bruts alimente AUSSI les heures travaillées des KPIs, séries,
  // détail par employé et catégories : sans lui, toute période postérieure au dernier
  // import « horaires de travail » afficherait 0 h travaillée (heures légales > 0 → taux 0 %).
  // horaires_travail reste prioritaire quand la journée y existe (journal de référence).
  for (const [empId, joursBadges] of Object.entries(badgesEmp)) {
    const t = travailEmp[empId] || (travailEmp[empId] = {});
    for (const [d, sec] of Object.entries(joursBadges)) {
      if (t[d]) continue;
      const h = sec / 3600;
      t[d] = h;
      travailMap[d] = (travailMap[d] || 0) + h;
    }
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
      // « Présent » uniquement les jours PRÉVUS au calendrier (heures > 0) : un badge
      // un dimanche ou un jour férié ne gonfle pas les jours présents (ses heures comptent
      // quand même dans heures travaillées) ; l'équation absence = ouvrables − présents
      // − congés − maladies reste équilibrée.
      presents: (legalMap[g.date] || 0) > 0 ? 1 : 0,
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

  // --- Absences : modèle journalier booléen (synchronisé avec « Présences & pointages ») ---
  // Un jour d'absence = jour ouvrable sans badge ET sans couverture (congé validé, CE, maladie).
  // Calculé par employé et par jour (présence ⇒ non-absence, même si ce jour est aussi marqué
  // congé/maladie), puis agrégé : les totaux/journal/employé utilisent TOUJOURS la même base,
  // sans clamp par mois (le clamp mensuel créait de faux jours d'absence).
  const presentDay = new Set();
  for (const g of parJour.values()) if ((legalMap[g.date] || 0) > 0) presentDay.add(`${g.employe_id}|${g.date}`);
  const absJours = {};
  const empAbsJours = {};
  for (const d of jours) {
    if ((legalMap[d] || 0) <= 0) continue;
    let n = 0;
    for (const e of employes) {
      const key = `${e.id}|${d}`;
      if (presentDay.has(key) || justifieAbs.has(key)) continue;
      n += 1;
      empAbsJours[e.id] = (empAbsJours[e.id] || 0) + 1;
    }
    if (n) absJours[d] = n;
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
  const effectif = employes.length;
  const buckets = {};
  for (const d of jours) {
    const k = bucketKey(d);
    if (!buckets[k]) buckets[k] = {
      key: k, label: bucketLabel(k),
      legal_heures: 0, maladie_heures: 0, travaille_heures: 0, jours_ouvrables: 0,
      jours_conge: 0, jours_ce: 0, jours_maladie: 0, jours_absence: 0,
      journees_presence: 0, jours_presents: 0, retards: 0, retard_secondes: 0,
      departs_anticipe: 0, sortie_anticipee_secondes: 0,
      pointages_uniques: 0, conformes: 0,
    };
    const b = buckets[k];
    b.legal_heures += legalMap[d] || 0;
    // Heures de maladie du jour (arrêts validés) : déduites des heures à travailler
    b.maladie_heures += (legalMap[d] || 0) * Math.min(jourMaladie[d] || 0, effectif);
    b.travaille_heures += travailMap[d] || 0;
    // Jour ouvrable = jour PRÉVU au calendrier administratif (heures > 0) :
    // repos hebdomadaires et fériés payés (nationaux/religieux/manuels à 0 h) exclus.
    if ((legalMap[d] || 0) > 0) b.jours_ouvrables += 1;
    b.jours_conge += jourConge[d] || 0;
    b.jours_ce += jourCE[d] || 0;
    b.jours_maladie += jourMaladie[d] || 0;
    b.jours_absence += absJours[d] || 0;
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

  const series = Object.values(buckets).map((b) => {
    // Absence = jour ouvrable sans badge ET sans congé validé (CA/CE) ET sans maladie acceptée,
    // calculé par jour dans absJours : sommes des jours = total, pas de clamp mensuel.
    const absence_calc = b.jours_absence;
    // Heures à travailler NETTES = calendrier × effectif − heures des arrêts maladie validés
    // (les repos hebdomadaires et fériés payés sont déjà à 0 h dans jours_travail).
    const legal_avant_maladie = b.legal_heures * effectif;
    const legal_total = Math.max(0, legal_avant_maladie - b.maladie_heures);
    const presence_pct = legal_total ? Math.round((b.travaille_heures / legal_total) * 1000) / 10 : null;
    const jours_presence = b.jours_presents;
    return {
      ...b,
      jours_absence: absence_calc,
      legal_heures: Math.round(legal_total * 100) / 100,
      legal_avant_maladie: Math.round(legal_avant_maladie * 100) / 100,
      heures_maladie: Math.round(b.maladie_heures * 100) / 100,
      travaille_heures: Math.round(b.travaille_heures * 100) / 100,
      presence_pct,
      jours_presence,
    };
  });

  const totLegal = series.reduce((s, b) => s + b.legal_heures, 0);
  const totTrav = series.reduce((s, b) => s + b.travaille_heures, 0);
  const totConge = series.reduce((s, b) => s + b.jours_conge, 0);
  const totCE = series.reduce((s, b) => s + b.jours_ce, 0);
  // Portion « demi-journées » du total congé (0,5 par date de fin marquée demi-journée)
  const totCongeDemi = Object.values(jourCongeDemi).reduce((s, v) => s + v, 0);
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
  const soldeConge = employes.reduce((s, e) => s + soldeCongeRestantDate(e.id), 0);
  const soldeMaladie = employes.reduce((s, e) => s + soldeEmploye(e.id, 'maladie'), 0);

  // Alertes de solde congé (solde restant RMA, cohérent avec le Journal du solde de congé)
  const alertes = employes.filter((e) => soldeCongeRestantDate(e.id) < SEUIL_ALERTE);

  // Demandes en instance
  const enInstance = {
    demandes: db.prepare("SELECT COUNT(*) AS n FROM demandes_conge WHERE statut = 'en_instance'").get().n,
    arrets: db.prepare("SELECT COUNT(*) AS n FROM arrets_maladie WHERE statut = 'en_instance'").get().n,
  };

  // Détail par employé
  const legalParJour = jours.reduce((s, d) => s + (legalMap[d] || 0), 0);
  const joursOuvrablesPeriode = jours.reduce((s, d) => s + ((legalMap[d] || 0) > 0 ? 1 : 0), 0);
  const employesDetail = employes.map((e) => {
    const trav = travailEmp[e.id] || {};
    let travaille = 0;
    for (const d of jours) travaille += trav[d] || 0;
    travaille = Math.round(travaille * 100) / 100;
    // Heures de maladie de l'employé (arrêts validés sur des jours prévus au calendrier),
    // déduites des heures à travailler avant le calcul du taux de présence
    const malJours = empMaladieJours[e.id] || {};
    let maladieHeuresEmp = 0;
    for (const d of jours) if (malJours[d]) maladieHeuresEmp += legalMap[d] || 0;
    maladieHeuresEmp = Math.round(maladieHeuresEmp * 100) / 100;
    const legalNetteEmp = Math.max(0, Math.round((legalParJour - maladieHeuresEmp) * 100) / 100);
    const pp = pointagesEmp[e.id] || {};
    const journees = pp.journees || 0;
    const retards = pp.retards || 0;
    const departs = pp.departs || 0;
    const jours_presents = pp.presents || 0;
    const jours_conge = empConge[e.id] || 0;
    const jours_ce = empCE[e.id] || 0;
    const jours_maladie = empMaladie[e.id] || 0;
    // Absence = jour ouvrable sans badge ET sans congé validé (CA/CE) ET sans maladie
    // — même modèle journalier booléen que les séries/KPIs (empAbsJours)
    const jours_absence = empAbsJours[e.id] || 0;
    const jours_presents_pct = joursOuvrablesPeriode ? Math.round((jours_presents / joursOuvrablesPeriode) * 1000) / 10 : null;
    const jours_absence_pct = joursOuvrablesPeriode ? Math.round((jours_absence / joursOuvrablesPeriode) * 1000) / 10 : null;
    return {
      ...e,
      travaille_heures: travaille,
      legal_heures: legalNetteEmp,
      legal_avant_maladie: Math.round(legalParJour * 100) / 100,
      heures_maladie: maladieHeuresEmp,
      presence_pct: legalNetteEmp ? Math.round((travaille / legalNetteEmp) * 1000) / 10 : null,
      jours_ouvrables: joursOuvrablesPeriode,
      jours_presents,
      jours_presents_pct,
      jours_absence,
      jours_absence_pct,
      jours_conge,
      jours_ce,
      jours_maladie,
      solde_conge: soldeCongeRestantDate(e.id),
      solde_conge_periode: soldeCongePeriode(e.id, debut, fin),
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
    if (!acc[e.categorie]) acc[e.categorie] = { categorie: e.categorie, nb_employes: 0, travaille_heures: 0, legal_heures: 0, jours_conge: 0, jours_ce: 0, jours_maladie: 0, jours_absence: 0, jours_presents: 0, jours_ouvrables: 0, journees_presence: 0, retards: 0, retard_secondes: 0, departs_anticipe: 0, sortie_anticipee_secondes: 0 };
    const c = acc[e.categorie];
    c.nb_employes += 1;
    c.travaille_heures += e.travaille_heures;
    c.legal_heures += e.legal_heures;
    c.jours_conge += e.jours_conge;
    c.jours_ce += e.jours_ce || 0;
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
  // + heures travaillées du jour : durée horaires_travail, sinon repli sur les badges bruts (dernier − premier badgeage)
  // → chaque journée badgée (verte) affiche ses heures travaillées
  // + codifications complémentaires du Journal RMA (A1, CA, MA, R3, RP…) fusionnées avec P1 — affichées par couleur
  const travailFiltre = ids.length === 1 ? (travailEmp[ids[0]] || {}) : null;
  const badgesFiltre = ids.length === 1 ? (badgesEmp[ids[0]] || {}) : null;
  // Codes RMA importés pour l'employé filtré (une ligne par code, groupés par date comme dans le Journal de paie)
  let rmaMap = {};
  let rmaDemiMap = {};
  let couleurRma = {};
  if (employe_id || matricule) {
    const empIdFiltre = ids[0];
    const rmaRows = db.prepare(
      'SELECT date, code, demi_journee FROM codes_importes WHERE employe_id = ? AND date >= ? AND date <= ? ORDER BY date, code'
    ).all(empIdFiltre, debut, fin);
    const tmp = {};
    const tmpDemi = {};
    for (const r of rmaRows) {
      if (!tmp[r.date]) tmp[r.date] = [];
      tmp[r.date].push(r.code);
      if ((r.demi_journee && r.code === 'CA') || r.code === 'DJ') tmpDemi[r.date] = true;
    }
    for (const [d, arr] of Object.entries(tmp)) rmaMap[d] = arr.join('/');
    for (const [d] of Object.entries(tmpDemi)) rmaDemiMap[d] = true;
    for (const c of db.prepare('SELECT code, couleur FROM codes_paie').all()) couleurRma[c.code] = c.couleur || '#64748b';
  }
  const calendrier = (employe_id || matricule) ? jours.map((d) => {
    const pj = pointagesJour[d];
    // Ouvrable = jour PRÉVU au calendrier (heures > 0) : week-ends et fériés payés exclus
    const ouvrable = (legalMap[d] || 0) > 0 ? 1 : 0;
    const badge = pj ? pj.journees : 0;
    const present = pj ? pj.presents : 0;
    const conge = jourConge[d] || 0;
    const ce = jourCE[d] || 0;
    const maladie = jourMaladie[d] || 0;
    const absence = Math.min(absJours[d] || 0, ids.length);
    const rma = rmaMap[d] || null;
    const isRmaDemi = rma && rmaDemiMap[d] && (rma.split('/').includes('CA') || rma.split('/').includes('DJ'));
    const rma_couleur = rma ? (isRmaDemi ? '#000000' : (couleurRma[rma.split('/')[0]] || '#64748b')) : null;
    return {
      date: d, ouvrable, heures: legalMap[d] || 0, badge, present, conge, ce, maladie, absence, demi: jourDemi[d] || 0,
      travaille_secondes: (travailFiltre && travailFiltre[d] ? Math.round(travailFiltre[d] * 3600) : 0) || (badgesFiltre ? badgesFiltre[d] || 0 : 0),
      rma_code: rma, rma_couleur, rma_demi: isRmaDemi ? 1 : 0,
    };
  }) : [];

  // 9 employés au hasard parmi le périmètre filtré (grille 3×3 du tableau de bord)
  const photos_aleatoires = db.prepare(`
    SELECT e.matricule, e.nom, e.prenom, e.photo_url, c.libelle AS categorie
    FROM employes e JOIN categories c ON c.id = e.categorie_id
    WHERE ${where}
    ORDER BY RANDOM() LIMIT 9
  `).all(...wparams);

  return {
    filtre: { granularite, debut, fin, employe_id, matricule, categorie_id, departement },
    periode: { debut, fin },
    effectif,
    photos_aleatoires,
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
      jours_ce: totCE,
      jours_conge_demi: totCongeDemi,
      jours_maladie: totMaladie,
      jours_ouvrables: totOuvrables,
      solde_conge: soldeConge,
      solde_conge_periode: Object.values(employesDetail).reduce((s, e) => s + (e.solde_conge_periode || 0), 0),
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
      // Synchronisés avec le Journal de paie : % sur la période filtrée (jours ouvrables)
      conge: joursLegauxTotaux ? Math.round((totConge / joursLegauxTotaux) * 1000) / 10 : null,
      maladie: joursLegauxTotaux ? Math.round((totMaladie / joursLegauxTotaux) * 1000) / 10 : null,
      conge_annuel: soldeAgg.accorde_conge ? Math.round((soldeAgg.consomme_conge / soldeAgg.accorde_conge) * 1000) / 10 : null,
      maladie_annuel: soldeAgg.accorde_maladie ? Math.round((soldeAgg.consomme_maladie / soldeAgg.accorde_maladie) * 1000) / 10 : null,
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
  });
  // Codes & couleurs lus à chaque requête (source « Paramètres & Codification ») — hors cache,
  // pour que toute mise à jour / rectification des codes soit reflétée en temps réel.
  if (payload && typeof payload === 'object' && 'calendrier' in payload) {
    payload.codes = db.prepare('SELECT code, libelle, couleur FROM codes_paie ORDER BY code').all();
  }
  return res.json(payload);
});

module.exports = router;
