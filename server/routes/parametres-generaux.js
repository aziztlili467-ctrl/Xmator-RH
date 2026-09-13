const { Router } = require('express');
const { db } = require('../db');
const router = Router();

// Champs de l'identité de l'organisme (Référentiel → Paramètres Généraux).
// Chaque champ est stocké dans la table settings (clé/valeur) sous la clé `employeur_<champ>`.
const FIELDS = [
  // 1. Identifiants légaux et fiscaux
  'raison_sociale',
  'mf_regime',
  'mf_tva',
  'mf_categorie',
  'mf_cle',
  'rne',
  'forme_juridique',
  'code_douane',
  'capital_social',
  // 2. Organismes sociaux et sécurité sociale
  'cnss',
  'taux_at',
  'convention_collective',
  'bureau_cnss',
  'medecine_travail',
  // 3. Coordonnées bancaires
  'rib',
  'banque_agence',
  'swift',
  // 4. Adresse et localisation
  'gouvernorat',
  'ville_cp',
  'adresse',
  'pays',
  // 5. Contacts et communication RH
  'email_rh',
  'telephone',
  'site_web',
  'logo',
  // 6. Représentation légale et signatures
  'representant_nom',
  'representant_titre',
  'representant_cin',
  'signature',
];

router.get('/', (req, res) => {
  try {
    const rows = db.prepare("SELECT cle, valeur FROM settings WHERE cle LIKE 'employeur\\_%' ESCAPE '\\'").all();
    const out = {};
    for (const r of rows) out[r.cle.replace('employeur_', '')] = r.valeur;
    res.json(out);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/', (req, res) => {
  try {
    const body = req.body || {};
    if (typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ error: 'Corps de requête invalide.' });
    }
    const upsert = db.prepare('INSERT OR REPLACE INTO settings (cle, valeur) VALUES (?, ?)');
    const tx = db.transaction(() => {
      let enregistres = 0;
      for (const f of FIELDS) {
        if (!(f in body)) continue;
        const v = body[f] === null || body[f] === undefined ? '' : String(body[f]);
        upsert.run(`employeur_${f}`, v);
        enregistres++;
      }
      return enregistres;
    });
    const enregistres = tx();
    res.json({ ok: true, enregistres });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;