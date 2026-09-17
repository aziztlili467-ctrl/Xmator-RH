const { Router } = require('express');
const path = require('path');
const { db } = require('../db');
const PDFDocument = require('pdfkit');
const { drawPDFBrandFooter } = require('../utils/pdfBranding');

const router = Router();

const fmtDateFR = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

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

// Tolérances « entrée / sortie réglementaire » configurées par catégorie (Table « Tolérance de
// retard et de sortie » dans Référentiel → Paramètres de Pointage). Si une catégorie a ses deux
// valeurs renseignées ('HH:mm'), elles remplacent la grille par défaut (HORAIRES) pour tous les
// calculs de retard / sortie anticipée. Sinon : horaire par défaut (std + période spéciale).
function tolerancePour(tolerances, categorieId, catClef, dateISO, ramadan) {
  const t = tolerances.get(categorieId);
  if (t && t.entree_reglementaire && t.sortie_reglementaire) {
    return {
      entree: t.entree_reglementaire,
      sortie: t.sortie_reglementaire,
      periode: 'configure',
      toleree: true,
    };
  }
  return horairePour(catClef, dateISO, ramadan);
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
  return filtresDir(req, {});
}

// Variante acceptant un `source` imposé (ex : 'biometrique') indépendamment de la requête.
function filtresDir(req, contraintes = {}) {
  const debut = String(req.query.debut || '').trim();
  const fin = String(req.query.fin || '').trim();
  const matricule = String(req.query.matricule || '').trim();
  const employe_id = req.query.employe_id ? Number(req.query.employe_id) : null;
  const categorie_id = req.query.categorie_id ? Number(req.query.categorie_id) : null;
  const source = String(req.query.source || '').trim() || String(contraintes.source || '');
  const clauses = [];
  const vals = [];
  if (debut) { clauses.push('p.date >= ?'); vals.push(debut); }
  if (fin) { clauses.push('p.date <= ?'); vals.push(fin); }
  if (employe_id) { clauses.push('p.employe_id = ?'); vals.push(employe_id); }
  if (categorie_id) { clauses.push('e.categorie_id = ?'); vals.push(categorie_id); }
  if (source) { clauses.push('p.source = ?'); vals.push(source); }
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

// ---- Construction partagée : présence journalière agrégée (min = entrée, max = sortie) ----
// `contraintes` = { source:'biometrique' } par ex. pour le module biométrique (Xmator-Eye).
// Renvoie { lignes, totaux, ramadan }. Utilisée par le GET, le JSON biométrique, XLS et PDF.
function construire(req, contraintes = {}) {
  const { debut, fin, where, vals } = filtresDir(req, contraintes);

  const rows = db.prepare(`
    SELECT p.employe_id, p.date,
           e.matricule, e.nom, e.prenom, e.categorie_id, c.libelle AS categorie,
           COUNT(*) AS nb,
           MIN(p.horodatage) AS entree,
           MAX(p.horodatage) AS sortie,
           MAX(CASE WHEN p.source = 'biometrique' THEN 1 ELSE 0 END) AS bio
    FROM pointages p
    JOIN employes e ON e.id = p.employe_id
    JOIN categories c ON c.id = e.categorie_id
    ${where}
    GROUP BY p.employe_id, p.date
    ORDER BY CAST(e.matricule AS INTEGER), e.matricule, p.date
  `).all(...vals);

  const tolerances = new Map(
    db.prepare('SELECT categorie_id, entree_reglementaire, sortie_reglementaire FROM tolerances_categorie')
      .all()
      .map((t) => [t.categorie_id, t])
  );

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
    const horaire = tolerancePour(tolerances, r.categorie_id, normaliser(r.categorie), r.date, ramadanByAnnee[annee] || null);
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
      source_biometrique: r.bio === 1,
      entree_reelle,
      sortie_reelle,
      entree_regle: horaire ? horaire.entree : null,
      sortie_regle: horaire ? horaire.sortie : null,
      periode: horaire ? horaire.periode : null,
      tolerance_config: !!(horaire && horaire.toleree),
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
    biometriques: lignes.filter((l) => l.source_biometrique).length,
    somme_retard_secondes: lignes.reduce((s, l) => s + (l.retard_secondes || 0), 0),
    somme_sortie_anticipee_secondes: lignes.reduce((s, l) => s + (l.sortie_anticipee_secondes || 0), 0),
    categorie_tolerees: [...tolerances.values()].filter((t) => t.entree_reglementaire && t.sortie_reglementaire).length,
    debut: debut || null,
    fin: fin || null,
  };

  const ramadan = configs.filter((c) => c.ramadan_debut && c.ramadan_fin)
    .map((c) => ({ annee: c.annee, debut: c.ramadan_debut, fin: c.ramadan_fin }));

  return { lignes, totaux, ramadan };
}

// GET /api/presence — vue globale (toutes sources)
router.get('/', (req, res) => {
  res.json(construire(req));
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

// ---- Pointage biométrique (borne Xmator-Eye) ----
// Corps : { employe_id, horodatage? } — horodatage au format 'YYYY-MM-DD HH:mm:ss'
// (facultatif : un pointage hors-ligne garde son heure locale, synchronisé plus tard).
// Source 'biometrique' pour distinguer les badgeages dans le dashboard / l'export CSV.
// Dédoublonné par (employe_id, horodatage) ; renvoie doublon:true si déjà présent.
router.post('/pointage', (req, res) => {
  const body = req.body || {};
  const employe_id = Number(body.employe_id);
  if (!employe_id) return res.status(400).json({ error: 'employe_id est obligatoire.' });
  const emp = db.prepare('SELECT id, matricule FROM employes WHERE id = ?').get(employe_id);
  if (!emp) return res.status(404).json({ error: 'Employé introuvable.' });

  const MAX_FUTUR_SEC = 5 * 60;      // tolérance d'avance (dérive d'horloge borne/serveur)
  const MAX_PASSE_SEC = 7 * 24 * 3600; // file hors-ligne de la borne (rejeu différé)
  const isoLocalEpoch = (s) => {
    const [d, t] = s.split(' ');
    const [y, m, dd] = d.split('-').map(Number);
    const [h, mi, se] = t.split(':').map(Number);
    return Date.UTC(y, m - 1, dd, h, mi, se);
  };

  let iso = null;
  if (body.horodatage != null && String(body.horodatage).trim() !== '') {
    const ts = normaliserHorodatage(body.horodatage);
    if (!ts) return res.status(400).json({ error: "Horodatage invalide (format attendu : 'AAAA-MM-JJ HH:mm:ss')." });
    // Borne à une plage autour de l'heure du serveur : un pointage anormalement futur ou trop ancien
    // (hors file hors-ligne raisonnable) est refusé — il ne doit pas injecter de fausse présence.
    const now = db.prepare("SELECT strftime('%Y-%m-%d %H:%M:%S','now','localtime') AS v").get().v;
    const deltaS = (isoLocalEpoch(ts.iso) - isoLocalEpoch(now)) / 1000;
    if (deltaS > MAX_FUTUR_SEC) {
      return res.status(400).json({ error: 'Horodatage dans le futur : refuse (5 min de tolérance).' });
    }
    if (-deltaS > MAX_PASSE_SEC) {
      return res.status(400).json({ error: 'Horodatage trop ancien : refuse (7 jours de tolérance pour la file hors-ligne).' });
    }
    iso = ts.iso;
  } else {
    iso = db.prepare("SELECT strftime('%Y-%m-%d %H:%M:%S','now','localtime') AS v").get().v;
  }
  const date = iso.slice(0, 10);
  const ins = db.prepare(`
    INSERT INTO pointages (employe_id, matricule, horodatage, date, source)
    VALUES (?,?,?,?, 'biometrique')
    ON CONFLICT(employe_id, horodatage) DO NOTHING
  `);
  const r = ins.run(emp.id, emp.matricule, iso, date);
  const doublon = r.changes === 0;
  res.json({
    ok: true,
    doublon,
    pointage: { employe_id: emp.id, matricule: emp.matricule, horodatage: iso, date, source: 'biometrique' },
  });
});

// ---- Import de pointages bruts (fichier de badgeuse .csv/.txt) ----
// Colonnes : Matricule + Horodatage ('YYYY-MM-DD HH:mm:ss' ou 'DD/MM/YYYY HH:mm:ss'),
// ou Matricule + Date + Heure. Séparateur détecté (tabulation, point-virgule ou virgule).
// Seuls les matricules présents en base sont importés.
// ÉCRASEMENT : pour chaque (employé, date) présent dans le fichier, les anciens badgeages du
// même jour sont supprimés avant l'insertion (ré-import d'une date = remplacement, pas accumulation).
// Les violations de contrainte (même horodatage présent deux fois dans le FICHIER) sont ignorées.
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
  // Écrasement par (employé, date) : suppression des anciens badgeages + de leurs corrections
  const delJour = db.prepare('DELETE FROM pointages WHERE employe_id = ? AND date = ?');
  const delCorr = db.prepare('DELETE FROM corrections_pointages WHERE employe_id = ? AND date = ?');

  const tx = db.transaction(() => {
    let importes = 0;
    let doublons = 0;
    let invalides = 0;
    const nonReconnus = [];
    const datesIm = new Set();
    const joursTouches = new Set(); // "employe_id|date"
    const aInserer = []; // badgeages du fichier
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
      aInserer.push({ employe_id: emp.id, matricule: mat, iso: ts.iso, date: ts.date });
      joursTouches.add(`${emp.id}|${ts.date}`);
      datesIm.add(ts.date);
    }
    // Remplacement : on supprime les anciennes données de CHAQUE (employé, jour) du fichier…
    for (const cle of joursTouches) {
      const [eid, date] = cle.split('|');
      delJour.run(eid, date);
      delCorr.run(eid, date);
    }
    // …puis on insère le contenu du fichier.
    for (const b of aInserer) {
      const r = ins.run(b.employe_id, b.matricule, b.iso, b.date, 'import');
      if (r.changes > 0) importes++;
      else doublons++;
    }
    return { importes, doublons, invalides, nonReconnus, jours: joursTouches.size, datesIm: [...datesIm].sort() };
  });

  const result = tx();
  res.json({
    ok: true,
    importes: result.importes,
    doublons: result.doublons,
    invalides: result.invalides,
    nonReconnus: result.nonReconnus,
    jours: result.jours,
    lignes: result.importes + result.doublons,
    debut: result.datesIm.length ? result.datesIm[0] : null,
    fin: result.datesIm.length ? result.datesIm[result.datesIm.length - 1] : null,
  });
});

// ---- Module biométrique (Xmator-Eye) : mêmes constructions, source = 'biometrique' ----

// GET /api/presence/biometrique — JSON identique au GET « / » mais limité aux badges biométriques
router.get('/biometrique', (req, res) => {
  res.json(construire(req, { source: 'biometrique' }));
});

// DELETE /api/presence/biometrique — supprime l'historique des badgeages biométriques
// filtré par période (debut/fin), matricule, employe_id ou categorie_id (aucun filtre = tout).
router.delete('/biometrique', (req, res) => {
  const { debut, fin, where, vals } = filtresDir(req, { source: 'biometrique' });
  const r = db.prepare(`
    DELETE FROM pointages
    WHERE source = 'biometrique'
      AND employe_id IN (
        SELECT p.employe_id
        FROM pointages p
        JOIN employes e ON e.id = p.employe_id
        ${where}
      )
  `).run(...vals);
  res.json({
    ok: true,
    supprimes: r.changes,
    periode: { debut, fin },
  });
});

// GET /api/presence/biometrique/xls — export Excel (SpreadsheetML), retards & sorties anticipées en rouge
const xmlEscape = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

router.get('/biometrique/xls', (req, res) => {
  const { lignes, totaux } = construire(req, { source: 'biometrique' });
  const debut = totaux.debut || '';
  const fin = totaux.fin || '';
  const periode = [debut && fmtDateFR(debut), fin && fmtDateFR(fin)].filter(Boolean).join(' → ') || 'toutes les dates';

  const headers = ['Matricule', 'Employé', 'Catégorie', 'Date', 'Entrée régl.', 'Entrée réelle', 'Retard', 'Sortie régl.', 'Sortie réelle', 'Sortie anticipée'];
  const cells = (style, valeur) => `<Cell ss:StyleID="${style}"><Data ss:Type="String">${xmlEscape(valeur)}</Data></Cell>`;
  const rows = lignes.map((l) => {
    const retard = (l.retard_secondes || 0) > 0 ? 'alerte' : 'normal';
    const anticipee = (l.sortie_anticipee_secondes || 0) > 0 ? 'alerte' : 'normal';
    return `<Row>${cells('normal', l.matricule)}${cells('normal', `${l.nom} ${l.prenom}`.trim())}${cells('normal', l.categorie || '')}${cells('normal', fmtDateFR(l.date))}${cells('normal', l.entree_regle || '')}${cells('normal', l.entree_reelle || '')}${cells(retard, l.retard || '')}${cells('normal', l.sortie_regle || '')}${cells('normal', l.sortie_reelle || '')}${cells(anticipee, l.sortie_anticipee || '')}</Row>`;
  }).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" xmlns:x="urn:schemas-microsoft-com:office:excel">
<Styles>
  <Style ss:ID="titre"><Font ss:Bold="1" ss:Size="14"/></Style>
  <Style ss:ID="entete"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#1E3A8A" ss:Pattern="Solid"/></Style>
  <Style ss:ID="normal"><Alignment ss:Vertical="Center"/></Style>
  <Style ss:ID="alerte"><Font ss:Bold="1" ss:Color="#B91C1C"/><Alignment ss:Vertical="Center"/></Style>
</Styles>
<Worksheet ss:Name="Biométrique">
  <Table>
    <Row><Cell ss:StyleID="titre"><Data ss:Type="String">Pointages biométriques (Xmator-Eye) — ${xmlEscape(periode)}</Data></Cell></Row>
    <Row>${headers.map((h) => cells('entete', h)).join('')}</Row>
    ${rows}
    <Row><Cell ss:StyleID="normal"><Data ss:Type="String">Total : ${lignes.length} ligne(s) — ${totaux.retards} retard(s) — ${totaux.depart_anticipe} sortie(s) anticipée(s)</Data></Cell></Row>
  </Table>
</Worksheet>
</Workbook>`;

  res.setHeader('Content-Type', 'application/vnd.ms-excel');
  res.setHeader('Content-Disposition', `attachment; filename="pointages-biometriques_${fin || debut || 'tout'}.xls"`);
  res.send(xml);
});

// GET /api/presence/biometrique/pdf — export PDF paysage, retards & sorties anticipées en rouge
router.get('/biometrique/pdf', (req, res) => {
  const { lignes, totaux } = construire(req, { source: 'biometrique' });
  const debut = totaux.debut || '';
  const fin = totaux.fin || '';
  const periode = debut && fin ? `du ${fmtDateFR(debut)} au ${fmtDateFR(fin)}` : 'toutes les dates';

  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margins: { top: 40, bottom: 40, left: 30, right: 30 } });
  doc.registerFont('Garamond', path.join(__dirname, '..', 'fonts', 'EBGaramond.ttf'));
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="pointages-biometriques_${fin || debut || 'tout'}.pdf"`);
  doc.pipe(res);

  const L = doc.page.margins.left;
  const R = doc.page.width - doc.page.margins.right;
  const W = R - L;
  const pageH = doc.page.height;

  const COLS = [
    { label: 'Matricule', w: 60 },
    { label: 'Employé', w: 120 },
    { label: 'Catégorie', w: 100 },
    { label: 'Date', w: 62 },
    { label: 'Entrée régl.', w: 66 },
    { label: 'Entrée réelle', w: 66 },
    { label: 'Retard', w: 60 },
    { label: 'Sortie régl.', w: 66 },
    { label: 'Sortie réelle', w: 66 },
    { label: 'Sortie anticipée', w: 72 },
  ];
  const rowH = 16;

  const drawHeader = (y) => {
    doc.font('Garamond').fontSize(15).fillColor('#1f2937').text('Amicale du Personnel de la Banque Centrale de Tunisie', L, y, { align: 'center', width: W, lineBreak: false });
    doc.font('Garamond').fontSize(19).fillColor('#111827').text('Pointages biométriques (Xmator-Eye)', L, y + 18, { align: 'center', width: W, lineBreak: false });
    doc.font('Helvetica').fontSize(9).fillColor('#6b7280').text(`Période : ${periode} — ${lignes.length} ligne(s)`, L, y + 39, { align: 'center', width: W, lineBreak: false });
    return y + 58;
  };

  const drawCols = (y) => {
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#111827');
    let x = L;
    for (const c of COLS) {
      doc.text(c.label, x + 3, y + 4, { width: c.w - 6, lineBreak: false });
      x += c.w;
    }
    doc.moveTo(L, y).lineTo(R, y).strokeColor('#111827').lineWidth(0.8).stroke();
    doc.moveTo(L, y + rowH).lineTo(R, y + rowH).strokeColor('#111827').lineWidth(0.8).stroke();
    return y + rowH;
  };

  const drawRow = (l, idx, y) => {
    const vals = [
      l.matricule,
      `${l.nom} ${l.prenom}`.trim(),
      l.categorie || '',
      fmtDateFR(l.date),
      l.entree_regle || '',
      l.entree_reelle || '',
      l.retard || '',
      l.sortie_regle || '',
      l.sortie_reelle || '',
      l.sortie_anticipee || '',
    ];
    let x = L;
    for (let i = 0; i < COLS.length; i++) {
      const anomalie = (i === 6 && (l.retard_secondes || 0) > 0) || (i === 9 && (l.sortie_anticipee_secondes || 0) > 0);
      doc.font('Helvetica').fontSize(8).fillColor(anomalie ? '#B91C1C' : '#111827');
      doc.text(vals[i], x + 3, y + 4, { width: COLS[i].w - 6, lineBreak: false, ellipsis: true });
      x += COLS[i].w;
    }
    doc.moveTo(L, y + rowH).lineTo(R, y + rowH).strokeColor('#d1d5db').lineWidth(0.5).stroke();
    let vx = L;
    for (const c of COLS) {
      vx += c.w;
      doc.moveTo(vx, y).lineTo(vx, y + rowH).strokeColor('#e5e7eb').lineWidth(0.4).stroke();
    }
    return y + rowH;
  };

  let y = drawHeader(32);
  y = drawCols(y);
  if (lignes.length === 0) {
    doc.font('Helvetica').fontSize(10).fillColor('#6b7280').text('Aucun pointage biométrique sur la période demandée.', L, y + 16, { align: 'center', width: W });
  }
  lignes.forEach((l, idx) => {
    if (y + rowH > pageH - 40) {
      doc.addPage();
      y = drawHeader(32);
      y = drawCols(y);
    }
    y = drawRow(l, idx, y);
  });

  drawPDFBrandFooter(doc, { footerText: 'Pointages biométriques (Xmator-Eye)' });
  doc.end();
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
module.exports.tolerancePour = tolerancePour;
module.exports.estPeriodeSpeciale = estPeriodeSpeciale;
module.exports.estRamadan = estRamadan;
module.exports.statutPour = statutPour;