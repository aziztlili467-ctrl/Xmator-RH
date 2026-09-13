// Jours ouvrables PAR CATÉGORIE : jours de repos hebdomadaire configurables par catégorie
// (ex. « FEMME DE MENAGE » travaille le samedi → repos dimanche seul) alors que le calendrier
// administratif (`jours_travail`) reste partagé pour les jours fixes (fériés, ramadan, été).
//
// Règle (conçue pour ne PAS changer le comportement des catégories par défaut) :
//   • si le calendrier a une ligne pour la date : elle fait foi —
//       - heures > 0            → jour ouvrable ;
//       - source 'ferie'/label  → férié, repos payé (jamais ouvrable) ;
//       - source 'weekend'      → ouvrable SEULEMENT si la catégorie travaille ce jour-là
//                                 (son repos hebdomadaire ne le contient pas) ;
//       - autre (ex. 'manuel')  → repos (heures 0) ;
//   • sans ligne calendrier (année non configurée) : jour de semaine hors repos hebdomadaire.
//
// Les heures d'un jour ouvrable : celle du calendrier (heures > 0) si présentes, sinon les
// heures métier de la période (normal / été / ramadan) — un week-end du calendrier partagé qu'une
// catégorie travaille (ex. samedi de Femme de ménage) reprend les heures de la configuration.
const { db } = require('../db');

const DOW_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseRepos(str) {
  const set = new Set();
  if (!str) { set.add(0); set.add(6); return set; }
  for (const p of String(str).split(',')) {
    const n = parseInt(p, 10);
    if (Number.isInteger(n) && n >= 0 && n <= 6) set.add(n);
  }
  if (!set.size) { set.add(0); set.add(6); }
  return set;
}

// 0 = dimanche … 6 = samedi (getUTCDay)
function dow(iso) {
  const m = DOW_RE.exec(iso);
  if (!m) return -1;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
}

function heuresMetier(iso, cfg) {
  const d = dow(iso);
  if (d < 0 || !cfg) return 0;
  const mois = Number(iso.slice(5, 7));
  const reduites = Number(cfg.heures_reduites) || 0;
  if (cfg.ramadan_debut && cfg.ramadan_fin && iso >= cfg.ramadan_debut && iso <= cfg.ramadan_fin) {
    return reduites;
  }
  if (mois === 7 || mois === 8) return reduites;
  return Number(cfg.heures_normales) || 0;
}

// Charge en UNE fois les repos hebdomadaires de toutes les catégories et la config des années
// (évite les requêtes N+1 dans les boucles du tableau de bord / journal de paie).
function loadContext() {
  const reposMap = {};
  for (const c of db.prepare('SELECT id, repos_hebdomadaire FROM categories').all()) {
    reposMap[c.id] = parseRepos(c.repos_hebdomadaire);
  }
  const configByAnnee = {};
  for (const cfg of db.prepare('SELECT * FROM config_annees').all()) configByAnnee[cfg.annee] = cfg;
  return { reposMap, configByAnnee };
}

// Repos hebdomadaires d'une catégorie précise (Set de numéros de jour 0=dimanche … 6=samedi).
function reposFor(categorieId) {
  const c = db.prepare('SELECT repos_hebdomadaire FROM categories WHERE id = ?').get(categorieId);
  return parseRepos(c && c.repos_hebdomadaire);
}

// `legalRow` : ligne jours_travail du jour (ou null). Catégorie introuvable → repli sur le
// comportement historique (jours_travail.heures > 0).
function estOuvrable(ctx, categorieId, iso, legalRow) {
  const repos = ctx.reposMap[categorieId];
  if (!repos) return !!legalRow && Number(legalRow.heures) > 0;
  if (legalRow) {
    if (Number(legalRow.heures) > 0) return true;
    if (legalRow.source === 'ferie' || legalRow.label) return false;
    if (legalRow.source === 'weekend' && !repos.has(dow(iso))) return true;
    return false;
  }
  return !repos.has(dow(iso));
}

// Heures légales d'un jour pour une catégorie (0 si repos hebdomadaire ou férié).
function heuresPour(ctx, categorieId, iso, legalRow) {
  if (!estOuvrable(ctx, categorieId, iso, legalRow)) return 0;
  if (legalRow && Number(legalRow.heures) > 0) return Number(legalRow.heures);
  return heuresMetier(iso, ctx.configByAnnee[Number(iso.slice(0, 4))]);
}

// Détail des jours d'une période [debut, fin] pour une CATÉGORIE (repos hebdomadaires + calendrier) :
//   { total, ouvrables, feries, repos, dates, feriesDates } — source unique partagée (congés, prélèvements).
//   • ouvrables  : jours où la catégorie travaille (hors fériés payés et hors repos hebdomadaires) ;
//   • feries     : jours fériés / repos payés du calendrier (« Calendrier de l'année ») ;
//   • repos      : autres jours non travaillés (repos hebdomadaires, week-ends, jours manuels à 0 h).
// Retourne null si la période est invalide (fin < début ou dates illisibles).
function detailJours(debut, fin, categorieId) {
  const d1 = new Date(debut + 'T00:00:00');
  const d2 = new Date(fin + 'T00:00:00');
  if (Number.isNaN(d1.getTime()) || Number.isNaN(d2.getTime()) || d2 < d1) return null;
  const ctx = loadContext();
  const repos = reposFor(categorieId);
  const rows = db.prepare('SELECT date, heures, source, label FROM jours_travail WHERE date >= ? AND date <= ?').all(debut, fin);
  const legalByDate = {};
  for (const r of rows) legalByDate[r.date] = r;
  const hasCal = rows.length > 0;
  const dates = [];
  const feriesDates = [];
  let ouvrables = 0;
  let feries = 0;
  let reposN = 0;
  const cur = new Date(d1);
  while (cur <= d2) {
    const iso = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
    if (hasCal) {
      const legal = legalByDate[iso];
      if (estOuvrable(ctx, categorieId, iso, legal)) {
        ouvrables += 1;
        dates.push(iso);
      } else if (legal && (legal.source === 'ferie' || legal.label)) {
        feries += 1;
        feriesDates.push(iso);
      } else {
        reposN += 1;
      }
    } else if (!repos.has(cur.getDay())) {
      ouvrables += 1;
      dates.push(iso);
    } else {
      reposN += 1;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return { total: ouvrables + feries + reposN, ouvrables, feries, repos: reposN, dates, feriesDates };
}

// Nombre de jours ouvrables [debut, fin] pour une catégorie (null si période invalide).
function compteJoursOuvrables(debut, fin, categorieId) {
  const d = detailJours(debut, fin, categorieId);
  return d ? d.ouvrables : null;
}

module.exports = { parseRepos, reposFor, loadContext, estOuvrable, heuresPour, dow, detailJours, compteJoursOuvrables };