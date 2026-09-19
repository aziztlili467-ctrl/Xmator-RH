const { Router } = require('express');
const { db } = require('../db');
const { logActivite } = require('../middleware/audit');

const router = Router();

function validerAnnee(annee) {
  const a = Number(annee);
  return Number.isInteger(a) && a >= 2000 && a <= 2100 ? a : null;
}

function isoDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.getUTCFullYear() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

// ---------------------------------------------------------------------------
// Cycle de calcul — règles générales
// ---------------------------------------------------------------------------
// Le calcul de la paie mensuelle se fait par cycle d'environ 30 jours : du « jour de début »
// du mois précédent → le « jour de fin » du mois courant. Trois modes de calcul au choix :
//   1) forfaitaire : base comptable fixe (30 jours) − déductions (A1 + MALD + carence MA) ;
//   2) prorata     : base réelle du cycle (jours ouvrés ou jours calendaires réels) − déductions ;
//   3) horaire     : régime horaire mensuel (ex. 173,33 h) − heures d'absences, ou cumul des
//                    heures de présence réelle + heures assimilées ; montant = heures × prix/heure.
// Déductions communes :
//   • A1   (Absence)           → a1_jours jour(s) déduit(s) par jour (0,5 si demi-journée) ;
//   • MALD (Maladie longue durée) → mald_jours jour(s) déduit(s) par jour (0,5 si demi-journée) ;
//   • MA   (Maladie)           → règle de prélèvement par épisodes (1er épisode : ma_jours_payes
//                                jours payés, excédent déduit ; 2e maladie non successive et suivantes :
//                                déduites en entier) — paramétrée dans Congé & Maladie → Règles de
//                                prélèvement ;
//   • CA / CE / DJ / FT / P1 / R / R1 / R3 / RP / MAT → aucun impact à la baisse.
const SETTINGS_CLE = 'regles_cycle_calcul';

const MODES = ['forfaitaire', 'prorata', 'horaire'];

function reglesDefaut() {
  return {
    jour_debut: 21,
    jour_fin: 20,
    mode: 'forfaitaire',
    base_jours: 30,
    carence_ma: 2,
    base_reference: 'ouvres',      // prorata : 'ouvres' | 'calendaires'
    regime_horaire: 173.33,        // horaire : heures mensuelles de référence
    taux_horaire: 'auto',          // horaire : 'auto' (salaire/regime) | 'grille' (référentiel)
    decompte_horaire: 'deduction', // horaire : 'deduction' | 'cumul'
    // Règles de prélèvement (maladie MA) — paramétrées dans Référentiel → Congé & Maladie →
    // « Règles de prélèvement ». Défaut entreprise : 1er épisode payé jusqu'au seuil (au-delà,
    // excédent déduit) ; la 2e maladie non successive (et suivantes) du même cycle est déduite
    // en entier.
    ma_jours_payes: 5,             // seuil de jours payés du 1er épisode maladie (0 = rien payé)
    ma_deduire_excedent: true,     // déduire l'excédent du 1er épisode au-delà du seuil
    ma_deduire_episodes_suivants: true, // déduire entièrement les épisodes suivants (2e, 3e…)
    a1_jours: 1,                   // jours déduits par jour d'absence A1
    mald_jours: 1,                 // jours déduits par jour de maladie longue durée MALD
  };
}

function lireRegles() {
  const row = db.prepare('SELECT valeur FROM settings WHERE cle = ?').get(SETTINGS_CLE);
  const defaut = reglesDefaut();
  if (!row || !row.valeur) return defaut;
  try {
    const p = JSON.parse(row.valeur) || {};
    const out = { ...defaut };
    if (Number.isInteger(p.jour_debut) && p.jour_debut >= 15 && p.jour_debut <= 30) out.jour_debut = p.jour_debut;
    if (Number.isInteger(p.jour_fin) && p.jour_fin >= 1 && p.jour_fin <= 31) out.jour_fin = p.jour_fin;
    if (Number.isInteger(p.base_jours) && p.base_jours >= 1 && p.base_jours <= 60) out.base_jours = p.base_jours;
    if (Number.isInteger(p.carence_ma) && p.carence_ma >= 0 && p.carence_ma <= 30) out.carence_ma = p.carence_ma;
    if (MODES.includes(p.mode)) out.mode = p.mode;
    if (['ouvres', 'calendaires'].includes(p.base_reference)) out.base_reference = p.base_reference;
    const rh = Number(p.regime_horaire);
    if (Number.isFinite(rh) && rh > 0 && rh <= 500) out.regime_horaire = rh;
    if (['auto', 'grille'].includes(p.taux_horaire)) out.taux_horaire = p.taux_horaire;
    if (['deduction', 'cumul'].includes(p.decompte_horaire)) out.decompte_horaire = p.decompte_horaire;
    // Règles de prélèvement (maladie MA)
    const mp = Number(p.ma_jours_payes);
    if (Number.isFinite(mp) && mp >= 0 && mp <= 30) out.ma_jours_payes = mp;
    if (typeof p.ma_deduire_excedent === 'boolean') out.ma_deduire_excedent = p.ma_deduire_excedent;
    if (typeof p.ma_deduire_episodes_suivants === 'boolean') out.ma_deduire_episodes_suivants = p.ma_deduire_episodes_suivants;
    const a1 = Number(p.a1_jours);
    if (Number.isFinite(a1) && a1 >= 0 && a1 <= 10) out.a1_jours = a1;
    const mald = Number(p.mald_jours);
    if (Number.isFinite(mald) && mald >= 0 && mald <= 10) out.mald_jours = mald;
    return out;
  } catch {
    return defaut;
  }
}

const pad = (n) => String(n).padStart(2, '0');

// Dates du cycle par défaut d'un mois (1-12) : jour_debut du mois précédent → jour_fin du mois courant.
function finCycleDefaut(annee, mois, regles) {
  const prevY = mois === 1 ? annee - 1 : annee;
  const prevM0 = mois === 1 ? 11 : mois - 2;
  const curM0 = mois - 1;
  return {
    debut: `${prevY}-${pad(prevM0 + 1)}-${pad(regles.jour_debut)}`,
    fin: `${annee}-${pad(curM0 + 1)}-${pad(regles.jour_fin)}`,
  };
}

// Résout les dates du cycle d'un mois : la ligne cycles_calcul (annee, mois) personnalisée
// prime ; sinon application de la règle générale (jour_debut → jour_fin).
function cycleDuMois(annee, mois) {
  const row = db.prepare('SELECT debut, fin FROM cycles_calcul WHERE annee = ? AND mois = ?').get(annee, mois);
  if (row && isoDate(row.debut) && isoDate(row.fin)) {
    return { debut: row.debut, fin: row.fin, source: 'personnalise' };
  }
  return { ...finCycleDefaut(annee, mois, lireRegles()), source: 'regle' };
}

const JOURS_OUVRABLES_MENSUELS = 21.67; // 260 j / 12 — 173,33 h / 21,67 = 8 h/jour
const round2 = (n) => Math.round(n * 100) / 100;
const round4 = (n) => Math.round(n * 10000) / 10000;

// Compter les jours de la période [debut, fin] depuis le calendrier administratif (jours_travail) :
// jours calendaires, ouvrés (hors weekend & fériés), fériés et repos hebdomadaires.
function compterJoursPeriode(debut, fin) {
  const d = isoDate(debut);
  const f = isoDate(fin);
  if (!d || !f) return { calendaires: 0, ouvres: 0, feries: 0, weekend: 0 };
  const yD = Number(d.slice(0, 4));
  const yF = Number(f.slice(0, 4));
  const rows = db.prepare('SELECT date, source FROM jours_travail WHERE annee IN (?, ?)').all(yD, yF);
  const map = {};
  for (const r of rows) map[r.date] = r.source;
  let calendaires = 0, ouvres = 0, feries = 0, weekend = 0;
  for (let dt = new Date(d + 'T00:00:00'), finDt = new Date(f + 'T00:00:00'); dt <= finDt; dt.setDate(dt.getDate() + 1)) {
    calendaires++;
    const iso = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
    const src = map[iso];
    const dow = dt.getDay();
    if (src === 'ferie') feries++;
    else if (src === 'weekend' || dow === 0 || dow === 6) weekend++;
    else ouvres++;
  }
  return { calendaires, ouvres, feries, weekend };
}

const { heureDe, diffSecondes } = require('./presence');

// Heures réellement pointées (badgeuse) sur la période : durée entre l'entrée et la sortie réelles
// (min/max du jour) — mêmes règles que le module Présences & pointages (horaires.js).
function heuresPointees(employeId, debut, fin) {
  const rows = db.prepare(`
    SELECT date, COUNT(*) AS nb, MIN(horodatage) AS entree, MAX(horodatage) AS sortie
    FROM pointages WHERE employe_id = ? AND date >= ? AND date <= ?
    GROUP BY date
  `).all(employeId, debut, fin);
  let total = 0;
  for (const r of rows) {
    if (r.nb < 2) continue;
    const e = heureDe(r.entree);
    const s = heureDe(r.sortie);
    if (e !== null && s !== null) total += diffSecondes(s, e) / 3600;
  }
  return total;
}

// Salaire de base effectif d'un employé : valeur de la fiche, sinon grille de salaire
// (rubrique / grade / classe / échelon — même règle qu'enrichirGrille d'employes.js).
function salaireBaseDe(ligne) {
  if (ligne && ligne.salaire_base != null && String(ligne.salaire_base).trim() !== '') return Number(ligne.salaire_base) || 0;
  if (!ligne) return 0;
  let g = db.prepare(
    'SELECT valeur FROM grille_salaire WHERE rubrique = ? AND grade = ? AND classe = ? AND echelon = ? LIMIT 1'
  ).get(ligne.rubrique, ligne.grade, ligne.classe, ligne.echelon);
  if (!g) {
    g = db.prepare(
      'SELECT valeur FROM grille_salaire WHERE grade = ? AND classe = ? AND echelon = ? LIMIT 1'
    ).get(ligne.grade, ligne.classe, ligne.echelon);
  }
  return g ? Number(g.valeur) || 0 : 0;
}

// Prix de l'heure : 1) grille des prix par CATÉGORIE (prix_heure_categorie — référentiel dédié
// « prix d'heures par catégorie »), 2) sinon rubrique tarifaire de la grille de salaire
// (« prix heure / horaire / tarif » par grade/classe/échelon), 3) sinon repli automatique =
// salaire de base ÷ régime mensuel.
function prixHeureDe(emp, regles) {
  if ((regles.taux_horaire || 'auto') === 'grille' && emp) {
    if (emp.categorie_id != null) {
      const p = db.prepare('SELECT prix_heure FROM prix_heure_categorie WHERE categorie_id = ?').get(emp.categorie_id);
      if (p && Number(p.prix_heure) > 0) return { prix: Number(p.prix_heure), source: 'grille' };
    }
    if (emp.grade != null) {
      const g = db.prepare(`
        SELECT valeur FROM grille_salaire
        WHERE (rubrique LIKE '%heure%' OR rubrique LIKE '%horaire%' OR rubrique LIKE '%tarif%')
          AND grade = ? AND classe = ? AND echelon = ?
        ORDER BY rubrique LIMIT 1
      `).get(emp.grade, emp.classe, emp.echelon);
      if (g && Number(g.valeur) > 0) return { prix: Number(g.valeur), source: 'grille' };
    }
  }
  const regime = Number(regles.regime_horaire) || 173.33;
  const base = salaireBaseDe(emp);
  return { prix: regime > 0 ? base / regime : 0, source: 'auto' };
}

// Différence en jours entre deux chaînes ISO (YYYY-MM-DD). Absolue.
function diffJours(a, b) {
  const da = new Date(a + 'T00:00:00Z');
  const db = new Date(b + 'T00:00:00Z');
  return Math.round(Math.abs(db - da) / 86400000);
}

// Regroupe les dates MA en épisodes consécutifs (écart ≤ 1 jour calendrier).
function grouperEpisodesMA(rows) {
  const dates = [];
  for (const r of rows) {
    if (r.code !== 'MA') continue;
    dates.push({ date: r.date, poids: r.demi_journee ? 0.5 : 1 });
  }
  dates.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  const episodes = [];
  for (const d of dates) {
    const dernier = episodes.length ? episodes[episodes.length - 1] : null;
    if (dernier && diffJours(dernier[dernier.length - 1].date, d.date) === 1) {
      dernier.push(d);
    } else {
      episodes.push([d]);
    }
  }
  return episodes;
}

// Moteur centralisé : nombre d'unités de paie (jours ou heures) d'un employé sur le cycle.
//   emp  : ligne employé (id, matricule, categorie_id, salaire_base, rubrique, grade, classe, echelon)
//   debut/fin : période du cycle ; regles : règles générales du cycle (y compris règles de prélèvement).
//
// Règle de déduction maladie MA (règle entreprise) :
//   - Les jours MA sont regroupés en épisodes consécutifs (écart ≤ 1 jour calendrier).
//   - 1er épisode : les ma_jours_payes premiers jours sont payés ; l'excédent est déduit
//     (si ma_deduire_excedent = true).
//   - 2e, 3e… épisodes : déduits en entier (si ma_deduire_episodes_suivants = true).
//   - A1 : déduits pleinement (1 jour déduit / jour A1).
//   - MALD : déduits pleinement (1 jour déduit / jour MALD).
function calculatePayrollUnits(emp, debut, fin, regles) {
  const mode = (regles && regles.mode) || 'forfaitaire';
  const rows = db.prepare(`
    SELECT date, code, demi_journee FROM codes_importes
    WHERE employe_id = ? AND date >= ? AND date <= ?
  `).all(emp.id, debut, fin);
  let jA1 = 0, jMald = 0;
  const assimiles = new Set();
  for (const r of rows) {
    const poids = r.demi_journee ? 0.5 : 1;
    if (r.code === 'A1') jA1 += poids;
    else if (r.code === 'MALD') jMald += poids;
    else if (['CA', 'CE', 'DJ', 'MAT'].includes(r.code)) assimiles.add(r.date);
  }
  const a1Jours = Number(regles.a1_jours) || 1;
  const maldJours = Number(regles.mald_jours) || 1;
  jA1 = jA1 * (a1Jours <= 0 ? 0 : a1Jours);
  jMald = jMald * (maldJours <= 0 ? 0 : maldJours);

  // --- Déduction MA par épisodes (règle entreprise) ---
  const episodes = grouperEpisodesMA(rows);
  const joursPayesSeuil = Number(regles.ma_jours_payes) || 5;
  const deduireExcedent = regles.ma_deduire_excedent !== false;
  const deduireEpSuivants = regles.ma_deduire_episodes_suivants !== false;

  let maDeduits = 0;
  let maJoursTotaux = 0;
  for (let i = 0; i < episodes.length; i++) {
    const poidsEp = episodes[i].reduce((s, d) => s + d.poids, 0);
    maJoursTotaux += poidsEp;
    if (i === 0) {
      if (deduireExcedent) maDeduits += Math.max(0, poidsEp - joursPayesSeuil);
    } else {
      if (deduireEpSuivants) maDeduits += poidsEp;
    }
  }

  const carence_appliquee = maDeduits;  // compatibilité UI existante (BulletinDePaie / CalculDePaie)
  const jours_deduits = jA1 + jMald + carence_appliquee;
  const joursCal = compterJoursPeriode(debut, fin);
  const base = { jours_deduits, jours_a1: jA1, jours_mald: jMald, jours_ma: maJoursTotaux,
    ma_episodes: episodes.length, ma_jours_payes: joursPayesSeuil,
    carence_appliquee, carence_ma: Number(regles.carence_ma) || 0, ...joursCal };

  if (mode === 'horaire') {
    const regime = Number(regles.regime_horaire) || 173.33;
    const heuresParJour = regime / JOURS_OUVRABLES_MENSUELS;
    const heures_deduits = (jA1 + jMald + carence_appliquee) * heuresParJour;
    const { prix, source: prixSource } = prixHeureDe(emp, regles);
    let nbr_heures;
    if ((regles.decompte_horaire || 'deduction') === 'cumul') {
      const presence = heuresPointees(emp.id, debut, fin);
      const assimile = assimiles.size + joursCal.feries;
      nbr_heures = presence + assimile * heuresParJour;
      nbr_heures = Math.min(regime, nbr_heures);
      base.heures_presence = round2(presence);
      base.heures_assimilees = round2(assimile * heuresParJour);
    } else {
      nbr_heures = Math.max(0, regime - heures_deduits);
    }
    return {
      ...base,
      mode,
      unite: 'heures',
      nbr_heures: round2(nbr_heures),
      nbr_unites: round2(nbr_heures),
      base_unites: regime,
      nbr_jours_paie: null,
      base_jours: null,
      regime_horaire: regime,
      heures_par_jour: round2(heuresParJour),
      heures_deduits: round2(heures_deduits),
      heures_a1: round2(jA1 * heuresParJour),
      heures_mald: round2(jMald * heuresParJour),
      heures_carence: round2(carence_appliquee * heuresParJour),
      prix_heure: round4(prix),
      prix_heure_source: prixSource,
    };
  }

  const baseNorme = mode === 'prorata'
    ? ((regles.base_reference || 'ouvres') === 'calendaires' ? joursCal.calendaires : joursCal.ouvres)
    : Number(regles.base_jours) || 30;
  const nbr_jours_paie = Math.max(0, baseNorme - jours_deduits);
  return {
    ...base,
    mode,
    unite: 'jours',
    nbr_jours_paie,
    nbr_unites: nbr_jours_paie,
    base_unites: baseNorme,
    base_jours: baseNorme,
    base_reference: mode === 'prorata' ? (regles.base_reference || 'ouvres') : undefined,
  };
}

// Compatibilité : nom historique du moteur (jours).
function calculerJoursPaie(employeId, debut, fin, regles) {
  const emp = db.prepare('SELECT id, matricule, categorie_id, salaire_base, rubrique, grade, classe, echelon FROM employes WHERE id = ?').get(employeId);
  return emp ? calculatePayrollUnits(emp, debut, fin, regles) : null;
}

// ---- Règles générales du cycle (doivent être déclarées avant /:annee) ----
router.get('/regles', (req, res) => {
  res.json({ regles: lireRegles() });
});

router.put('/regles', (req, res) => {
  const b = req.body || {};
  const regles = lireRegles();
  if (b.jour_debut !== undefined) {
    const v = Number(b.jour_debut);
    if (!Number.isInteger(v) || v < 15 || v > 30) return res.status(400).json({ error: 'Jour de début du cycle invalide (15 à 30).' });
    regles.jour_debut = v;
  }
  if (b.jour_fin !== undefined) {
    const v = Number(b.jour_fin);
    if (!Number.isInteger(v) || v < 1 || v > 31) return res.status(400).json({ error: 'Jour de fin du cycle invalide (1 à 31).' });
    regles.jour_fin = v;
  }
  if (b.base_jours !== undefined) {
    const v = Number(b.base_jours);
    if (!Number.isInteger(v) || v < 1 || v > 60) return res.status(400).json({ error: 'Base forfaitaire invalide (1 à 60 jours).' });
    regles.base_jours = v;
  }
  if (b.carence_ma !== undefined) {
    const v = Number(b.carence_ma);
    if (!Number.isInteger(v) || v < 0 || v > 30) return res.status(400).json({ error: 'Carence maladie invalide (0 à 30 jours).' });
    regles.carence_ma = v;
  }
  if (b.mode !== undefined) {
    if (!MODES.includes(b.mode)) return res.status(400).json({ error: 'Mode de calcul invalide (forfaitaire, prorata ou horaire).' });
    regles.mode = b.mode;
  }
  if (b.base_reference !== undefined) {
    if (!['ouvres', 'calendaires'].includes(b.base_reference)) return res.status(400).json({ error: 'Base de référence invalide (ouvres ou calendaires).' });
    regles.base_reference = b.base_reference;
  }
  if (b.regime_horaire !== undefined) {
    const v = Number(b.regime_horaire);
    if (!Number.isFinite(v) || v <= 0 || v > 500) return res.status(400).json({ error: 'Régime horaire mensuel invalide (0 à 500 heures).' });
    regles.regime_horaire = v;
  }
  if (b.taux_horaire !== undefined) {
    if (!['auto', 'grille'].includes(b.taux_horaire)) return res.status(400).json({ error: 'Mode de détermination du taux horaire invalide (auto ou grille).' });
    regles.taux_horaire = b.taux_horaire;
  }
  if (b.decompte_horaire !== undefined) {
    if (!['deduction', 'cumul'].includes(b.decompte_horaire)) return res.status(400).json({ error: 'Mode de décompte horaire invalide (deduction ou cumul).' });
    regles.decompte_horaire = b.decompte_horaire;
  }
  // Règles de prélèvement (maladie MA)
  if (b.ma_jours_payes !== undefined) {
    const v = Number(b.ma_jours_payes);
    if (!Number.isFinite(v) || v < 0 || v > 30) return res.status(400).json({ error: 'Jours payés 1er épisode MA invalide (0 à 30).' });
    regles.ma_jours_payes = v;
  }
  if (b.ma_deduire_excedent !== undefined) {
    regles.ma_deduire_excedent = !!b.ma_deduire_excedent;
  }
  if (b.ma_deduire_episodes_suivants !== undefined) {
    regles.ma_deduire_episodes_suivants = !!b.ma_deduire_episodes_suivants;
  }
  if (b.a1_jours !== undefined) {
    const v = Number(b.a1_jours);
    if (!Number.isFinite(v) || v < 0 || v > 10) return res.status(400).json({ error: 'Jours déduits par jour A1 invalide (0 à 10).' });
    regles.a1_jours = v;
  }
  if (b.mald_jours !== undefined) {
    const v = Number(b.mald_jours);
    if (!Number.isFinite(v) || v < 0 || v > 10) return res.status(400).json({ error: 'Jours déduits par jour MALD invalide (0 à 10).' });
    regles.mald_jours = v;
  }
  db.prepare('INSERT INTO settings (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur')
    .run(SETTINGS_CLE, JSON.stringify(regles));
  logActivite({
    utilisateur_id: req.user?.id,
    login: req.user?.login,
    role: req.user?.role,
    action: 'modifier',
    module: 'parametre-salaire',
    detail: `Règles du cycle de calcul enregistrées (mode ${regles.mode}, cycle ${regles.jour_debut}→${regles.jour_fin}, carence MA ${regles.carence_ma} j, seuil MA ${regles.ma_jours_payes} j)`,
    statut: 200,
    ip: req.ip,
  });
  res.json({ ok: true, regles });
});

// ---- Règles de prélèvement (sous-catégorie Congé & Maladie) ----
router.get('/prelevement', (req, res) => {
  const regles = lireRegles();
  res.json({
    regles: {
      ma_jours_payes: regles.ma_jours_payes ?? 5,
      ma_deduire_excedent: regles.ma_deduire_excedent !== false,
      ma_deduire_episodes_suivants: regles.ma_deduire_episodes_suivants !== false,
      carence_ma: regles.carence_ma ?? 2,
      a1_jours: regles.a1_jours ?? 1,
      mald_jours: regles.mald_jours ?? 1,
    }
  });
});

router.put('/prelevement', (req, res) => {
  const b = req.body || {};
  const regles = lireRegles();
  if (b.ma_jours_payes !== undefined) {
    const v = Number(b.ma_jours_payes);
    if (!Number.isFinite(v) || v < 0 || v > 30) return res.status(400).json({ error: 'Jours payés 1er épisode MA invalide (0 à 30).' });
    regles.ma_jours_payes = v;
  }
  if (b.ma_deduire_excedent !== undefined) {
    regles.ma_deduire_excedent = !!b.ma_deduire_excedent;
  }
  if (b.ma_deduire_episodes_suivants !== undefined) {
    regles.ma_deduire_episodes_suivants = !!b.ma_deduire_episodes_suivants;
  }
  if (b.carence_ma !== undefined) {
    const v = Number(b.carence_ma);
    if (!Number.isInteger(v) || v < 0 || v > 30) return res.status(400).json({ error: 'Carence maladie invalide (0 à 30 jours).' });
    regles.carence_ma = v;
  }
  if (b.a1_jours !== undefined) {
    const v = Number(b.a1_jours);
    if (!Number.isFinite(v) || v < 0 || v > 10) return res.status(400).json({ error: 'Jours déduits par jour A1 invalide (0 à 10).' });
    regles.a1_jours = v;
  }
  if (b.mald_jours !== undefined) {
    const v = Number(b.mald_jours);
    if (!Number.isFinite(v) || v < 0 || v > 10) return res.status(400).json({ error: 'Jours déduits par jour MALD invalide (0 à 10).' });
    regles.mald_jours = v;
  }
  db.prepare('INSERT INTO settings (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur')
    .run(SETTINGS_CLE, JSON.stringify(regles));
  logActivite({
    utilisateur_id: req.user?.id,
    login: req.user?.login,
    role: req.user?.role,
    action: 'modifier',
    module: 'conge-maladie',
    detail: `Règles de prélèvement modifiées (seuil MA ${regles.ma_jours_payes} j, excédent=${regles.ma_deduire_excedent ? 'oui' : 'non'}, épisodes suivants=${regles.ma_deduire_episodes_suivants ? 'oui' : 'non'})`,
    statut: 200,
    ip: req.ip,
  });
  res.json({ ok: true, regles: { ma_jours_payes: regles.ma_jours_payes, ma_deduire_excedent: regles.ma_deduire_excedent, ma_deduire_episodes_suivants: regles.ma_deduire_episodes_suivants, carence_ma: regles.carence_ma, a1_jours: regles.a1_jours, mald_jours: regles.mald_jours } });
});

// ---- Nbr_Jours_Paie d'un employé pour un mois (cycle résolu automatiquement) ----
// Paramètres : matricule (ou employe_id) + annee + mois (1-12).
router.get('/calculer', (req, res) => {
  const annee = validerAnnee(req.query.annee);
  const mois = Number(req.query.mois);
  if (!annee || !Number.isInteger(mois) || mois < 1 || mois > 12) {
    return res.status(400).json({ error: 'Paramètres annee et mois requis (ex : annee=2026&mois=7).' });
  }
  let emp = null;
  if (req.query.employe_id) {
    emp = db.prepare('SELECT id, matricule, nom, prenom, categorie_id, salaire_base, rubrique, grade, classe, echelon FROM employes WHERE id = ?').get(Number(req.query.employe_id)) || null;
  } else {
    const mat = String(req.query.matricule || '').trim();
    if (mat) {
      const n = parseInt(mat, 10);
      emp = db.prepare('SELECT id, matricule, nom, prenom, categorie_id, salaire_base, rubrique, grade, classe, echelon FROM employes WHERE matricule = ? OR CAST(matricule AS INTEGER) = ?').get(mat, isNaN(n) ? -1 : n) || null;
    }
  }
  if (!emp) {
    return res.json({ ok: true, employe: null, periode: null, regles: lireRegles(), result: null });
  }
  const regles = lireRegles();
  const periode = cycleDuMois(annee, mois);
  const result = calculatePayrollUnits(emp, periode.debut, periode.fin, regles);
  res.json({ ok: true, employe: { id: emp.id, matricule: emp.matricule, nom: emp.nom, prenom: emp.prenom }, regles, periode, result });
});

// ---- Prévisions de paie : Nbr_Jours_Paie de TOUS les employés actifs pour un mois ----
// (calendrier de paie mensuel — une seule requête pour la fiche par mois / année)
router.get('/bulletins', (req, res) => {
  const annee = validerAnnee(req.query.annee);
  const mois = Number(req.query.mois);
  if (!annee || !Number.isInteger(mois) || mois < 1 || mois > 12) {
    return res.status(400).json({ error: 'Paramètres annee et mois requis (ex : annee=2026&mois=7).' });
  }
  const regles = lireRegles();
  const periode = cycleDuMois(annee, mois);
  const employes = db.prepare('SELECT id, matricule, nom, prenom, categorie_id, salaire_base, rubrique, grade, classe, echelon FROM employes WHERE actif = 1 ORDER BY cast(matricule as integer), matricule').all();
  const liste = employes.map((e) => ({
    employe: { id: e.id, matricule: e.matricule, nom: e.nom, prenom: e.prenom },
    result: calculatePayrollUnits(e, periode.debut, periode.fin, regles),
  }));
  res.json({ ok: true, annee, mois, periode, regles, employes: liste });
});

// ---- Prix de l'heure par catégorie (régime horaire — référentiel « EPR ») ----
// GET : toutes les catégories avec leur prix horaire (prix_heure = null si non paramétré).
// PUT : enregistre { prix: [{ categorie_id, prix_heure }] } en upsert (une valeur par catégorie).
router.get('/prix-heures', (req, res) => {
  const rows = db.prepare(`
    SELECT c.id AS categorie_id, c.libelle, p.prix_heure
    FROM categories c
    LEFT JOIN prix_heure_categorie p ON p.categorie_id = c.id
    ORDER BY c.libelle
  `).all();
  res.json({ prix: rows.map((r) => ({
    categorie_id: r.categorie_id,
    libelle: r.libelle,
    prix_heure: r.prix_heure == null ? null : Number(r.prix_heure),
  })) });
});

router.put('/prix-heures', (req, res) => {
  const prix = req.body && Array.isArray(req.body.prix) ? req.body.prix : [];
  if (prix.length === 0) {
    return res.status(400).json({ error: 'Aucune catégorie à enregistrer (prix requis).' });
  }
  const upsert = db.prepare(`
    INSERT INTO prix_heure_categorie (categorie_id, prix_heure, updated_at)
    VALUES (?, ?, datetime('now','localtime'))
    ON CONFLICT(categorie_id) DO UPDATE SET prix_heure = excluded.prix_heure, updated_at = excluded.updated_at
  `);
  const tx = db.transaction(() => {
    for (const p of prix) {
      const cid = Number(p.categorie_id);
      const v = Number(p.prix_heure);
      if (!Number.isInteger(cid) || cid <= 0) continue;
      if (!Number.isFinite(v) || v < 0 || v > 10000) continue;
      upsert.run(cid, v);
    }
  });
  tx();
  logActivite({
    utilisateur_id: req.user?.id,
    login: req.user?.login,
    role: req.user?.role,
    action: 'modifier',
    module: 'parametre-salaire',
    detail: `Prix de l'heure par catégorie enregistrés (${prix.length} catégorie(s))`,
    statut: 200,
    ip: req.ip,
  });
  res.json({ ok: true, enregistres: prix.length });
});

// GET /:annee — cycles de calcul mensuels (début / fin) d'une année
router.get('/:annee', (req, res) => {
  const annee = validerAnnee(req.params.annee);
  if (!annee) return res.status(400).json({ error: 'Année invalide.' });
  const rows = db.prepare('SELECT * FROM cycles_calcul WHERE annee = ? ORDER BY mois').all(annee);
  res.json(rows);
});

// PUT /:annee — enregistre (upsert) un tableau de cycles [{mois, debut, fin}]
router.put('/:annee', (req, res) => {
  const annee = validerAnnee(req.params.annee);
  if (!annee) return res.status(400).json({ error: 'Année invalide.' });
  const cycles = req.body && Array.isArray(req.body.cycles) ? req.body.cycles : [];
  const upsert = db.prepare(`
    INSERT INTO cycles_calcul (annee, mois, debut, fin) VALUES (?,?,?,?)
    ON CONFLICT(annee, mois) DO UPDATE SET debut = excluded.debut, fin = excluded.fin, updated_at = datetime('now','localtime')
  `);
  const tx = db.transaction(() => {
    for (const c of cycles) {
      const mois = Number(c.mois);
      if (!Number.isInteger(mois) || mois < 1 || mois > 12) continue;
      const debut = isoDate(c.debut);
      const fin = isoDate(c.fin);
      if (!debut || !fin) continue;
      upsert.run(annee, mois, debut, fin);
    }
  });
  tx();
  const rows = db.prepare('SELECT * FROM cycles_calcul WHERE annee = ? ORDER BY mois').all(annee);
  res.json(rows);
});

module.exports = router;
module.exports.reglesDefaut = reglesDefaut;
module.exports.lireRegles = lireRegles;
module.exports.finCycleDefaut = finCycleDefaut;
module.exports.cycleDuMois = cycleDuMois;
module.exports.calculerJoursPaie = calculerJoursPaie;
module.exports.calculatePayrollUnits = calculatePayrollUnits;
module.exports.isoDate = isoDate;