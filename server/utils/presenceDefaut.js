const { db } = require('../db');

// ---- Présence par défaut (départements) ----
// Réglage stocké dans settings (clé/valeur), format : liste de noms de départements séparés par
// des virgules. Les employés appartenant à ces départements sont considérés PRÉSENTS (P1) par
// défaut sur leurs jours ouvrables selon le calendrier ; toute codification insérée dans une
// catégorie liée (MA, CA, CE, A1…) remplace automatiquement cet état.
const CLE = 'default_present_departements';
const DEFAUT = ['Comptoir'];

// Départements actuellement configurés.
// - Aucune ligne en base  → défaut d'installation ['Comptoir'] (feature « Présent par défaut » active).
// - Ligne présente mais vide → explicitement DÉSACTIVÉ (liste vide = aucun département concerné).
function departementsPresenceDefaut() {
  const r = db.prepare('SELECT valeur FROM settings WHERE cle = ?').get(CLE);
  if (!r) return [...DEFAUT];
  const v = String(r.valeur || '').trim();
  if (!v) return [];
  return v.split(',').map((d) => String(d).trim()).filter(Boolean);
}

// Enregistre la liste des départements (normalisés, valeurs uniques).
function setDepartementsPresenceDefaut(liste) {
  const vus = new Set();
  const propre = (Array.isArray(liste) ? liste : [])
    .map((d) => String(d || '').trim())
    .filter(Boolean)
    .filter((d) => !vus.has(d) && vus.add(d));
  db.prepare('INSERT OR REPLACE INTO settings (cle, valeur) VALUES (?, ?)').run(CLE, propre.join(','));
  return propre;
}

// Normalisation d'un nom de département (minuscules, sans accents, espaces fusionnés).
function normaliserDept(v) {
  return String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

// Un département donné est-il configuré en « présent par défaut » ?
function departementConfigure(departement) {
  const cible = normaliserDept(departement);
  if (!cible) return false;
  return departementsPresenceDefaut().some((d) => normaliserDept(d) === cible);
}

// IDs des employés actifs dont le département est configuré en « présent par défaut ».
function employesPresenceDefaut() {
  const depts = new Set(departementsPresenceDefaut().map(normaliserDept));
  if (!depts.size) return [];
  return db
    .prepare('SELECT id, departement FROM employes WHERE actif = 1')
    .all()
    .filter((e) => depts.has(normaliserDept(e.departement)))
    .map((e) => e.id);
}

module.exports = {
  CLE,
  DEFAUT,
  departementsPresenceDefaut,
  setDepartementsPresenceDefaut,
  normaliserDept,
  departementConfigure,
  employesPresenceDefaut,
};