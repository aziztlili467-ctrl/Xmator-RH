const { Router } = require('express');
const { db } = require('../db');
const { logActivite } = require('../middleware/audit');
const router = Router();

// Nomenclature du bulletin de paie — Règles de calcul de la paie (Référentiel → Paramètre de Salaire).
const SEED = [
  ['5011', 'Salaire de base'],
  ['10011', 'Indemnité de présence'],
  ['10021', 'Indemnité de transport'],
  ['10031', 'Indemnité de logement / Résidence'],
  ['10041', 'Indemnité de représentation'],
  ['10051', 'Indemnité de caisse / Responsabilité'],
  ['25011', 'Indemnité de fonction'],
  ['25021', 'Prime de technicité / Qualification'],
  ['25031', "Prime d'ancienneté"],
  ['25041', 'Prime de rendement / Performance'],
  ['25051', 'Heures supplémentaires (25% / 50% / 100%)'],
  ["25061", "Gratification de fin d'année (13ème mois)"],
  ['25071', 'Prime de bilan / Intéressement'],
  ['25081', 'Prime de panier / Panier de nuit'],
  ['25091', 'Indemnité de salissure / Outillage'],
  ['30011', 'Rappel sur salaire'],
  ['30021', 'Indemnité de congé payé'],
  ['40011', 'Retenue pour absence / Congé sans solde'],
  ['50000', 'SALAIRE BRUT COTISABLE (Total/Sous-total)'],
  ['50011', 'CNSS (Cotisation Salariale - 9.18%)'],
  ['53011', 'Retenue assurance groupe / Mutuelle'],
  ['53021', 'Retenue Caisse Sociale / Amicale'],
  ['53031', 'Retenue Cantine / Restauration'],
  ['55000', 'SALAIRE IMPOSABLE (Total/Sous-total)'],
  ['55011', 'Impôts sur le Revenu (IRPP)'],
  ['55023', 'Contribution Sociale de Solidarité (CSS - 1%)'],
  ['70011', 'SALAIRE NET (Total/Sous-total)'],
  ['80011', 'Avance Aid / Acompte sur salaire'],
  ['80021', 'Prêt interne / Prêt amicale'],
  ['85041', 'Frais postal / Timbre fiscal / Divers'],
  ['85051', 'Saisie-arrêt / Opposition sur salaire'],
  ['10000', 'NET À PAYER (Montant final versé)'],
];

function seedSiVide() {
  const n = db.prepare('SELECT COUNT(*) AS c FROM regles_calcul_paie').get().c;
  if (n > 0) return;
  const ins = db.prepare('INSERT INTO regles_calcul_paie (code, libelle, ordre) VALUES (?, ?, ?)');
  const tx = db.transaction(() => SEED.forEach(([code, libelle], i) => ins.run(code, libelle, (i + 1) * 10)));
  tx();
}

function toutes() {
  return db.prepare('SELECT id, code, libelle, ordre, taux FROM regles_calcul_paie ORDER BY ordre, id').all();
}

// Code automatique pour une nouvelle ligne : code numérique de la ligne précédente + 1,
// incrémenté jusqu'à trouver un code libre.
function prochainCode(apres) {
  const existants = new Set(db.prepare('SELECT code FROM regles_calcul_paie').all().map((r) => r.code));
  let base = 90000;
  if (apres) {
    const n = Number(apres.code);
    if (Number.isFinite(n)) base = n;
  }
  let candidat = base + 1;
  while (existants.has(String(candidat))) candidat++;
  return String(candidat);
}

router.get('/', (req, res) => {
  try {
    seedSiVide();
    res.json(toutes());
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/', (req, res) => {
  try {
    seedSiVide();
    const body = req.body || {};
    const libelle = body.libelle === undefined ? '' : String(body.libelle).trim();
    const apresId = body.apresId === undefined || body.apresId === null ? null : Number(body.apresId);
    const rows = toutes();
    let apres = null;
    let ordre;
    if (apresId !== null && !Number.isNaN(apresId)) {
      apres = rows.find((r) => r.id === apresId) || null;
    }
    if (apres) {
      const idx = rows.indexOf(apres);
      const suivant = rows[idx + 1];
      ordre = suivant ? Math.floor((apres.ordre + suivant.ordre) / 2) : apres.ordre + 10;
    } else {
      ordre = rows.length > 0 ? rows[0].ordre - 10 : 10;
    }
    const code = prochainCode(apres);
    const r = db.prepare('INSERT INTO regles_calcul_paie (code, libelle, ordre) VALUES (?, ?, ?)').run(code, libelle, ordre);
    res.status(201).json({ id: Number(r.lastInsertRowid), code, libelle, ordre });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Sauvegarde des taux de la fiche de paie (onglet « Bulletin de Paie ») :
// corps attendu { taux: { '<code>': nombre|null, … } }. Un taux absent ou nul efface la valeur.
router.put('/taux', (req, res) => {
  try {
    seedSiVide();
    const corps = req.body || {};
    if (!corps || typeof corps !== 'object' || Array.isArray(corps)) {
      return res.status(400).json({ error: 'Corps de requête invalide.' });
    }
    const tauxSaisis = corps.taux;
    if (!tauxSaisis || typeof tauxSaisis !== 'object' || Array.isArray(tauxSaisis)) {
      return res.status(400).json({ error: 'Le corps doit contenir un objet taux par code de rubrique.' });
    }
    const maj = db.prepare('UPDATE regles_calcul_paie SET taux = ? WHERE code = ?');
    const tx = db.transaction(() => {
      let enregistres = 0;
      for (const [code, valeur] of Object.entries(tauxSaisis)) {
        let taux = null;
        if (valeur !== null && valeur !== undefined && valeur !== '') {
          taux = Number(valeur);
          if (!Number.isFinite(taux) || taux < 0 || taux > 100) {
            throw new Error(`Taux invalide pour la rubrique ${code}.`);
          }
          taux = Number(taux.toFixed(4));
        }
        const r = maj.run(taux, String(code));
        if (r.changes > 0) enregistres++;
      }
      return enregistres;
    });
    const enregistres = tx();
    logActivite({ utilisateur_id: req.user?.id, login: req.user?.login, role: req.user?.role, action: 'modifier', module: 'parametre-salaire', detail: `Mise à jour des taux du bulletin de paie (${enregistres} rubrique(s))`, statut: 200, ip: req.ip });
    res.json({ ok: true, enregistres });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    seedSiVide();
    const id = Number(req.params.id);
    const body = req.body || {};
    const code = body.code === undefined ? null : String(body.code).trim();
    const libelle = body.libelle === undefined ? null : String(body.libelle).trim();
    if (code !== null && !code) return res.status(400).json({ error: 'Le code ne peut pas être vide.' });
    if (libelle !== null && !libelle) return res.status(400).json({ error: 'Le libellé est obligatoire.' });

    if (code !== null) {
      const doublon = db.prepare('SELECT id FROM regles_calcul_paie WHERE code = ? AND id <> ?').get(code, id);
      if (doublon) return res.status(400).json({ error: `Le code ${code} est déjà utilisé.` });
    }

    const q = db.prepare('UPDATE regles_calcul_paie SET code = COALESCE(?, code), libelle = COALESCE(?, libelle) WHERE id = ?');
    const r = q.run(code, libelle, id);
    if (r.changes === 0) return res.status(404).json({ error: 'Règle introuvable.' });
    res.json(toutes().find((x) => x.id === id));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    seedSiVide();
    const id = Number(req.params.id);
    const r = db.prepare('DELETE FROM regles_calcul_paie WHERE id = ?').run(id);
    if (r.changes === 0) return res.status(404).json({ error: 'Règle introuvable.' });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;