const { Router } = require('express');
const { db } = require('../db');

const router = Router();

// ---- Grille des horaires réglementaires par catégorie ----
// Clef : libellé de catégorie normalisé (minuscules, sans accents).
// `special` s'applique pendant l'été (juillet/août) et pendant le ramadan (dates définies
// dans config_annees via la rubrique « Calendrier de l'année »).
// Femme de ménage : horaire unique toute l'année (pas de période spéciale).
const HORAIRES = {
  'agent de securite': { libelle: 'Agent de sécurité', std: ['07:00', '16:00'], special: ['07:00', '14:00'] },
  'agent manutentionnaire': { libelle: 'Agent manutentionnaire', std: ['08:00', '17:00'], special: ['08:00', '14:30'] },
  'cadre administratif': { libelle: 'Cadre administratif', std: ['08:00', '16:00'], special: ['08:00', '13:00'] },
  'employe de restauration': { libelle: 'Employé de restauration', std: ['07:00', '15:00'], special: ['07:00', '12:00'] },
  'femme de menage': { libelle: 'Femme de ménage', std: ['06:00', '12:00'] },
};

// ---- Fonctions pures (testables) ----

const pad = (n) => String(n).padStart(2, '0');

// "AGENT DE SÉCURITÉ" -> "agent de securite" (minuscules, sans accents, espaces fusionnés)
function normaliser(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

// Normalise un horodatage : 'YYYY-MM-DD HH:mm:ss', 'DD/MM/YYYY HH:mm:ss', 'YYYY-MM-DDTHH:mm:ss', …
// -> { date:'YYYY-MM-DD', heure:'HH:mm:ss', iso:'YYYY-MM-DD HH:mm:ss' } ou null
function normaliserHorodatage(v) {
  const s = String(v || '').trim().replace(/[T]/g, ' ').replace(/\s+/g, ' ');
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2}) (\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/.exec(s);
  let y; let mo; let d; let h; let mi; let se;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; h = +m[4]; mi = +m[5]; se = m[6] ? +m[6] : 0; }
  else {
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/.exec(s);
    if (!m) return null;
    d = +m[1]; mo = +m[2]; y = +m[3]; h = +m[4]; mi = +m[5]; se = m[6] ? +m[6] : 0;
  }
  if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31 || h < 0 || h > 23 || mi < 0 || mi > 59 || se < 0 || se > 59) return null;
  const jour = new Date(Date.UTC(y, mo - 1, d));
  if (jour.getUTCFullYear() !== y || jour.getUTCMonth() !== mo - 1 || jour.getUTCDate() !== d) return null;
  const date = `${y}-${pad(mo)}-${pad(d)}`;
  const heure = `${pad(h)}:${pad(mi)}:${pad(se)}`;
  return { date, heure, iso: `${date} ${heure}` };
}

// "HH:MM" / "HH:MM:SS" -> secondes (null si invalide)
function hmsToSecondes(v) {
  const m = /^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/.exec(String(v || '').trim());
  if (!m) return null;
  const h = +m[1]; const mi = +m[2]; const s = m[3] ? +m[3] : 0;
  if (h > 23 || mi > 59 || s > 59) return null;
  return h * 3600 + mi * 60 + s;
}

function secondesToHHMMSS(sec) {
  sec = Math.max(0, Math.round(Number(sec) || 0));
  const h = Math.floor(sec / 3600);
  const mi = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return [h, mi, s].map(pad).join(':');
}

// Heure ('HH:mm:ss') extraite d'un horodatage ISO complet
function heureDe(iso) {
  return String(iso || '').slice(11, 19);
}

// Différence bornée à 0 : max(0, base - compare) en secondes (null si une valeur est invalide)
function diffSecondes(base, compare) {
  const b = hmsToSecondes(base);
  const c = hmsToSecondes(compare);
  if (b === null || c === null) return null;
  return Math.max(0, b - c);
}

// ---- Seuils de tolérance (toutes catégories confondues) ----
// Un retard n'est comptabilisé que s'il DÉPASSE 30 minutes (1 800 s).
// Une sortie anticipée n'est comptabilisée que si l'employé part 15 minutes
// (ou plus) avant l'heure réglementaire de sortie (900 s).
const SEUIL_RETARD_SEC = 30 * 60;
const SEUIL_SORTIE_ANTICIPEE_SEC = 15 * 60;

// Retard comptabilisé : le retard brut en dessous du seuil est toléré (0).
function retardComptable(brutSec) {
  if (brutSec === null) return null;
  return brutSec > SEUIL_RETARD_SEC ? brutSec : 0;
}

// Sortie anticipée comptabilisée : le départ en dessous du seuil est toléré (0).
function sortieAnticipeeComptable(brutSec) {
  if (brutSec === null) return null;
  return brutSec >= SEUIL_SORTIE_ANTICIPEE_SEC ? brutSec : 0;
}

function estRamadan(dateISO, ramadan) {
  return !!(ramadan && ramadan.debut && ramadan.fin && dateISO >= ramadan.debut && dateISO <= ramadan.fin);
}

// Période spéciale = ramadan OU été (juillet/août)
function estPeriodeSpeciale(dateISO, ramadan) {
  if (estRamadan(dateISO, ramadan)) return true;
  const m = new Date(dateISO + 'T00:00:00').getMonth();
  return m === 6 || m === 7;
}

// Horaire applicable à une catégorie pour une date donnée
// -> { entree:'HH:mm', sortie:'HH:mm', periode:'standard'|'ete'|'ramadan' } ou null si catégorie hors grille
function horairePour(catClef, dateISO, ramadan) {
  const h = HORAIRES[catClef];
  if (!h) return null;
  if (h.special && estPeriodeSpeciale(dateISO, ramadan)) {
    return { entree: h.special[0], sortie: h.special[1], periode: estRamadan(dateISO, ramadan) ? 'ramadan' : 'ete' };
  }
  return { entree: h.std[0], sortie: h.std[1], periode: 'standard' };
}

// Statut / anomalie d'une ligne de présence journalière
function statutPour({ nb, horaire, retardSec, sortieSec }) {
  if (nb === 1) return 'Pointage unique';
  if (!horaire) return 'Horaire non défini';
  if (retardSec > 0 && sortieSec > 0) return 'Retard + départ anticipé';
  if (retardSec > 0) return 'Retard';
  if (sortieSec > 0) return 'Départ anticipé';
  return 'Conforme';
}

// Filtres communs (GET, export, suppression) depuis la requête
function filtres(req) {
  const debut = String(req.query.debut || '').trim();
  const fin = String(req.query.fin || '').trim();
  const matricule = String(req.query.matricule || '').trim();
  const employe_id = req.query.employe_id ? Number(req.query.employe_id) : null;
  const categorie_id = req.query.categorie_id ? Number(req.query.categorie_id) : null;
  const clauses = [];
  const vals = [];
  if (debut) { clauses.push('p.date >= ?'); vals.push(debut); }
  if (fin) { clauses.push('p.date <= ?'); vals.push(fin); }
  if (employe_id) { clauses.push('p.employe_id = ?'); vals.push(employe_id); }
  if (categorie_id) { clauses.push('e.categorie_id = ?'); vals.push(categorie_id); }
  if (matricule) {
    const n = parseInt(String(matricule).trim(), 10);
    if (String(matricule).trim() && !isNaN(n)) {
      clauses.push('(e.matricule = ? OR CAST(e.matricule AS INTEGER) = ?)');
      vals.push(String(matricule).trim(), n);
    } else {
      clauses.push('e.matricule = ?');
      vals.push(String(matricule).trim());
    }
  }
  return { debut, fin, where: clauses.length ? ' WHERE ' + clauses.join(' AND ') : '', vals };
}

// ---- Lecture : présence journalière agrégée (min = entrée, max = sortie) ----
// Filtres : ?debut=&fin=&matricule=&employe_id=&categorie_id=
router.get('/', (req, res) => {
  const { debut, fin, where, vals } = filtres(req);

  const rows = db.prepare(`
    SELECT p.employe_id, p.date,
           e.matricule, e.nom, e.prenom, c.libelle AS categorie,
           COUNT(*) AS nb,
           MIN(p.horodatage) AS entree,
           MAX(p.horodatage) AS sortie
    FROM pointages p
    JOIN employes e ON e.id = p.employe_id
    JOIN categories c ON c.id = e.categorie_id
    ${where}
    GROUP BY p.employe_id, p.date
    ORDER BY CAST(e.matricule AS INTEGER), e.matricule, p.date
  `).all(...vals);

  const configs = db.prepare('SELECT annee, ramadan_debut, ramadan_fin FROM config_annees ORDER BY annee').all();
  const ramadanByAnnee = {};
  for (const c of configs) if (c.ramadan_debut && c.ramadan_fin) ramadanByAnnee[c.annee] = { debut: c.ramadan_debut, fin: c.ramadan_fin };

  // Corrections manuelles (saisie d'un retard / d'une sortie anticipée si erreur de badgeage)
  const corrMap = new Map();
  for (const c of db.prepare('SELECT employe_id, date, retard_secondes, sortie_anticipee_secondes, motif FROM corrections_pointages').all()) {
    corrMap.set(`${c.employe_id}|${c.date}`, c);
  }

  const lignes = rows.map((r) => {
    const annee = Number(r.date.slice(0, 4));
    const horaire = horairePour(normaliser(r.categorie), r.date, ramadanByAnnee[annee] || null);
    const entree_reelle = heureDe(r.entree);
    const sortie_reelle = r.nb >= 2 ? heureDe(r.sortie) : null;
    const corr = corrMap.get(`${r.employe_id}|${r.date}`);
    let retardSec = horaire ? retardComptable(diffSecondes(entree_reelle, horaire.entree)) : null;
    let sortieSec = horaire && sortie_reelle ? sortieAnticipeeComptable(diffSecondes(horaire.sortie, sortie_reelle)) : null;
    const retardManuel = !!(corr && corr.retard_secondes !== null);
    const sortieManuelle = !!(corr && corr.sortie_anticipee_secondes !== null);
    if (retardManuel) retardSec = corr.retard_secondes;
    if (sortieManuelle) sortieSec = corr.sortie_anticipee_secondes;
    return {
      employe_id: r.employe_id,
      matricule: r.matricule,
      nom: r.nom,
      prenom: r.prenom,
      categorie: r.categorie,
      date: r.date,
      nb_pointages: r.nb,
      entree_reelle,
      sortie_reelle,
      entree_regle: horaire ? horaire.entree : null,
      sortie_regle: horaire ? horaire.sortie : null,
      periode: horaire ? horaire.periode : null,
      retard: retardSec === null ? null : secondesToHHMMSS(retardSec),
      retard_secondes: retardSec,
      sortie_anticipee: sortieSec === null ? null : secondesToHHMMSS(sortieSec),
      sortie_anticipee_secondes: sortieSec,
      statut: statutPour({ nb: r.nb, horaire, retardSec: retardSec || 0, sortieSec: sortieSec || 0 }),
      correction: corr ? { retard_secondes: corr.retard_secondes, sortie_anticipee_secondes: corr.sortie_anticipee_secondes, motif: corr.motif } : null,
      retard_manuel: retardManuel,
      sortie_anticipee_manuelle: sortieManuelle,
    };
  });

  const totaux = {
    lignes: lignes.length,
    conformes: lignes.filter((l) => l.statut === 'Conforme').length,
    retards: lignes.filter((l) => (l.retard_secondes || 0) > 0).length,
    depart_anticipe: lignes.filter((l) => (l.sortie_anticipee_secondes || 0) > 0).length,
    pointages_uniques: lignes.filter((l) => l.statut === 'Pointage unique').length,
    somme_retard_secondes: lignes.reduce((s, l) => s + (l.retard_secondes || 0), 0),
    somme_sortie_anticipee_secondes: lignes.reduce((s, l) => s + (l.sortie_anticipee_secondes || 0), 0),
    debut: debut || null,
    fin: fin || null,
  };

  const ramadan = configs.filter((c) => c.ramadan_debut && c.ramadan_fin)
    .map((c) => ({ annee: c.annee, debut: c.ramadan_debut, fin: c.ramadan_fin }));

  res.json({ lignes, totaux, ramadan });
});

// ---- Téléchargement des pointages d'une période en TXT (format d'import compatible) ----
// Re-injectable tel quel via POST /api/presence/import (« restaurer »).
// Filtres : ?debut=&fin=&matricule=&employe_id=&categorie_id=
router.get('/export', (req, res) => {
  const { debut, fin, where, vals } = filtres(req);
  const rows = db.prepare(`
    SELECT e.matricule, p.horodatage
    FROM pointages p
    JOIN employes e ON e.id = p.employe_id
    ${where}
    ORDER BY p.date, p.horodatage
  `).all(...vals);
  const txt = rows.map((r) => `${r.matricule}\t${r.horodatage}`).join('\n');
  const nom = `pointages_${debut || 'tout'}_${fin || 'tout'}.txt`;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${nom}"`);
  res.send(txt);
});

// ---- Suppression des pointages (et de leurs corrections) d'une période ----
// Filtres identiques au GET (période + matricule + employe_id + categorie_id).
router.delete('/', (req, res) => {
  const { where, vals } = filtres(req);
  const jours = db.prepare(`
    SELECT DISTINCT p.employe_id, p.date
    FROM pointages p
    JOIN employes e ON e.id = p.employe_id
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

// ---- Édition manuelle d'un retard / d'une sortie anticipée (erreur de saisie constatée) ----
// Corps : { employe_id, date, retard_secondes, sortie_anticipee_secondes, motif }
// Un champ null/vide = laisser la valeur automatique ; les deux à null = rétablir l'auto.
router.put('/correction', (req, res) => {
  const body = req.body || {};
  const employe_id = Number(body.employe_id);
  const date = String(body.date || '').trim();
  if (!employe_id || !date) return res.status(400).json({ error: 'employe_id et date sont obligatoires.' });
  if (!db.prepare('SELECT id FROM employes WHERE id = ?').get(employe_id)) {
    return res.status(404).json({ error: 'Employé introuvable.' });
  }
  const a = (v) => (v === null || v === undefined || v === '' ? null : Math.max(0, Math.round(Number(v) || 0)));
  const retard_secondes = a(body.retard_secondes);
  const sortie_anticipee_secondes = a(body.sortie_anticipee_secondes);
  const motif = String(body.motif || '').trim() || null;

  if (retard_secondes === null && sortie_anticipee_secondes === null && !motif) {
    db.prepare('DELETE FROM corrections_pointages WHERE employe_id = ? AND date = ?').run(employe_id, date);
    return res.json({ ok: true, correction: null });
  }
  db.prepare(`
    INSERT INTO corrections_pointages (employe_id, date, retard_secondes, sortie_anticipee_secondes, motif, updated_at)
    VALUES (?,?,?,?,?, datetime('now','localtime'))
    ON CONFLICT(employe_id, date) DO UPDATE SET
      retard_secondes = excluded.retard_secondes,
      sortie_anticipee_secondes = excluded.sortie_anticipee_secondes,
      motif = excluded.motif,
      updated_at = datetime('now','localtime')
  `).run(employe_id, date, retard_secondes, sortie_anticipee_secondes, motif);
  const c = db.prepare('SELECT employe_id, date, retard_secondes, sortie_anticipee_secondes, motif FROM corrections_pointages WHERE employe_id = ? AND date = ?').get(employe_id, date);
  res.json({ ok: true, correction: c });
});

// ---- Rétablir la valeur automatique d'une ligne (suppression de la correction) ----
router.delete('/correction', (req, res) => {
  const employe_id = Number(req.query.employe_id);
  const date = String(req.query.date || '').trim();
  if (!employe_id || !date) return res.status(400).json({ error: 'employe_id et date sont obligatoires.' });
  db.prepare('DELETE FROM corrections_pointages WHERE employe_id = ? AND date = ?').run(employe_id, date);
  res.json({ ok: true });
});

// ---- Import de pointages bruts (fichier de badgeuse .csv/.txt) ----
// Colonnes : Matricule + Horodatage ('YYYY-MM-DD HH:mm:ss' ou 'DD/MM/YYYY HH:mm:ss'),
// ou Matricule + Date + Heure. Séparateur détecté (tabulation, point-virgule ou virgule).
// Seuls les matricules présents en base sont importés ; un ré-import du même horodatage est ignoré.
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
  const ins = db.prepare(`
    INSERT INTO pointages (employe_id, matricule, horodatage, date, source) VALUES (?,?,?,?,?)
    ON CONFLICT(employe_id, horodatage) DO NOTHING
  `);

  const tx = db.transaction(() => {
    let importes = 0;
    let doublons = 0;
    let invalides = 0;
    const nonReconnus = [];
    const datesIm = [];
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
      const r = ins.run(emp.id, mat, ts.iso, ts.date, 'import');
      if (r.changes > 0) { importes++; datesIm.push(ts.date); }
      else doublons++;
    }
    return { importes, doublons, invalides, nonReconnus, datesIm };
  });

  const result = tx();
  res.json({
    ok: true,
    importes: result.importes,
    doublons: result.doublons,
    invalides: result.invalides,
    nonReconnus: result.nonReconnus,
    lignes: result.importes + result.doublons,
    debut: result.datesIm.length ? result.datesIm.reduce((a, b) => (a < b ? a : b)) : null,
    fin: result.datesIm.length ? result.datesIm.reduce((a, b) => (a > b ? a : b)) : null,
  });
});

module.exports = router;

// Fonctions pures exposées pour les tests unitaires et la réutilisation
module.exports.HORAIRES = HORAIRES;
module.exports.normaliser = normaliser;
module.exports.normaliserHorodatage = normaliserHorodatage;
module.exports.hmsToSecondes = hmsToSecondes;
module.exports.heureDe = heureDe;
module.exports.secondesToHHMMSS = secondesToHHMMSS;
module.exports.diffSecondes = diffSecondes;
module.exports.SEUIL_RETARD_SEC = SEUIL_RETARD_SEC;
module.exports.SEUIL_SORTIE_ANTICIPEE_SEC = SEUIL_SORTIE_ANTICIPEE_SEC;
module.exports.retardComptable = retardComptable;
module.exports.sortieAnticipeeComptable = sortieAnticipeeComptable;
module.exports.horairePour = horairePour;
module.exports.estPeriodeSpeciale = estPeriodeSpeciale;
module.exports.estRamadan = estRamadan;
module.exports.statutPour = statutPour;