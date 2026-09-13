const { Router } = require('express');
const { db } = require('../db');
const {
  departementsPresenceDefaut,
  setDepartementsPresenceDefaut,
  normaliserDept,
} = require('../utils/presenceDefaut');

const router = Router();

// ---- Paramètre « Présence par défaut » : départements affichés PRÉSENT (P1) par défaut ----
// Les employés des départements cochés sont considérés présents sur leurs jours ouvrables selon le
// calendrier (un jour sans pointage et sans codification RMA = P1) dans le Journal de présence, le
// tableau de bord (calendrier + KPIs : jours présents ↑, absences ↓) et les vues liées. Toute
// codification insérée dans une catégorie liée (MA, CA, CE, A1…) remplace automatiquement cet état.

// Liste des départements existants avec effectif et état du paramètre
router.get('/', (req, res) => {
  const actifs = new Set(departementsPresenceDefaut().map(normaliserDept));
  const depts = db
    .prepare("SELECT departement, COUNT(*) AS nb_employes FROM employes WHERE actif = 1 AND departement <> '' GROUP BY departement ORDER BY departement")
    .all();
  res.json({
    departements: depts.map((d) => ({
      nom: d.departement,
      nb_employes: d.nb_employes,
      actif: actifs.has(normaliserDept(d.departement)),
    })),
    actifs: departementsPresenceDefaut(),
  });
});

// Enregistre les départements cochés (seuls les départements existants sont retenus)
router.put('/', (req, res) => {
  const demandes = Array.isArray((req.body || {}).departements) ? req.body.departements : [];
  const existants = new Set(
    db.prepare("SELECT DISTINCT departement FROM employes WHERE actif = 1 AND departement <> ''").all().map((r) => r.departement)
  );
  const retenus = [];
  const vus = new Set();
  for (const d of demandes) {
    const nom = String(d || '').trim();
    if (!nom || vus.has(nom)) continue;
    vus.add(nom);
    if (existants.has(nom)) retenus.push(nom);
  }
  const sauvegardes = setDepartementsPresenceDefaut(retenus);
  res.json({ ok: true, departements: sauvegardes, actifs: sauvegardes });
});

module.exports = router;