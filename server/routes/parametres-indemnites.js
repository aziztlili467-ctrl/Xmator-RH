const { Router } = require('express');
const { db, montantCategorieIndemnite, montantCategorieIndemniteAvant } = require('../db');
const { requireRole } = require('../middleware/auth');
const router = Router();

const lecture = requireRole('super_admin', 'consultation', 'moderateur');

const ANNEES = [2025, 2026, 2027, 2028, 2029, 2030];

// Normalise une valeur d'indemnité : vide/absent → null ; sinon numérique avec la
// virgule française acceptée (convertie en point). Rejeté → { ok:false }.
function normaliserMontant(valeur) {
  if (valeur === undefined || valeur === null || String(valeur).trim() === '') return { ok: true, valeur: null };
  const s = String(valeur).trim().replace(/\s/g, '').replace(',', '.');
  if (!/^-?(\d+(\.\d+)?)$/.test(s)) return { ok: false, message: `Valeur invalide : ${valeur}` };
  const v = Number(s);
  if (v < 0) return { ok: false, message: `Montant négatif : ${valeur}` };
  return { ok: true, valeur: v };
}

function validerPeriode(annee, mois) {
  const a = annee === undefined || annee === null || annee === '' ? null : Number(annee);
  const m = mois === undefined || mois === null || mois === '' ? null : Number(mois);
  if (a === null || !Number.isInteger(a) || !ANNEES.includes(a)) {
    throw new Error(`Année invalide (utilisez ${ANNEES.join(', ')}).`);
  }
  if (m === null || !Number.isInteger(m) || m < 1 || m > 12) {
    throw new Error('Mois invalide (1 à 12).');
  }
  return { annee: a, mois: m, periode: a * 100 + m };
}

const TYPE_LABELS = { transport: 'transport', presence: 'présence' };

// Liste des catégories avec les montants fixes (transport / présence) EN VIGUEUR pour la
// période (année, mois) sélectionnée — dernier changement dont la date d'effet <= période.
// Renvoie aussi l'historique complet des changements enregistrés (année, mois, montant).
router.get('/', lecture, (req, res) => {
  try {
    const { annee, mois, periode } = validerPeriode(req.query.annee, req.query.mois);
    const categories = db.prepare('SELECT id, libelle FROM categories ORDER BY libelle ASC').all();
    const rows = categories.map((c) => ({
      id: c.id,
      libelle: c.libelle,
      transport: montantCategorieIndemnite(c.id, 'transport', periode),
      presence: montantCategorieIndemnite(c.id, 'presence', periode),
    }));
    const changements = db.prepare(`
      SELECT i.id, i.categorie_id, c.libelle AS categorie, i.type, i.annee, i.mois, i.montant,
             i.created_at, i.updated_at
      FROM indemnites_categorie i
      JOIN categories c ON c.id = i.categorie_id
      ORDER BY i.annee DESC, i.mois DESC, c.libelle ASC, i.type ASC
    `).all();
    res.json({ annee, mois, categories: rows, changements });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Enregistrement en masse des montants fixes par catégorie pour (annee, mois) :
//   { annee, mois, lignes: [{ categorie_id, transport, presence }] }
// Règle : un montant saisi pour (annee, mois) devient la valeur en vigueur À PARTIR de ce mois
// (il s'applique aux mois suivants). Un champ laissé vide n'efface PAS l'historique, mais retire
// un changement éventuel déjà saisi pour exactement (annee, mois) → recul sur la valeur antérieure.
router.put('/', requireRole('super_admin'), (req, res) => {
  try {
    const { annee, mois, periode } = validerPeriode(req.body.annee, req.body.mois);
    const { lignes } = req.body || {};
    if (!Array.isArray(lignes) || lignes.length === 0) {
      return res.status(400).json({ error: 'Aucune ligne à enregistrer.' });
    }
    const upsert = db.prepare(`
      INSERT INTO indemnites_categorie (categorie_id, type, annee, mois, montant)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (categorie_id, type, annee, mois)
      DO UPDATE SET montant = excluded.montant, updated_at = datetime('now','localtime')
    `);
    const supprimer = db.prepare(
      'DELETE FROM indemnites_categorie WHERE categorie_id = ? AND type = ? AND annee = ? AND mois = ?'
    );
    let enregistres = 0;
    let retires = 0;
    const tx = db.transaction(() => {
      for (const ligne of lignes) {
        const categorieId = Number(ligne.categorie_id);
        if (!Number.isInteger(categorieId) || categorieId <= 0) continue;
        const cat = db.prepare('SELECT id, libelle FROM categories WHERE id = ?').get(categorieId);
        if (!cat) continue;
        for (const type of ['transport', 'presence']) {
          const n = normaliserMontant(ligne[type]);
          if (!n.ok) throw new Error(`${cat.libelle} — ${TYPE_LABELS[type]} : ${n.message}`);
          if (n.valeur === null) {
            // « vider la case » → retire un changement déjà saisi pour exactement ce mois
            const info = supprimer.run(categorieId, type, annee, mois);
            if (info.changes > 0) retires++;
            continue;
          }
          // Un montant n'est enregistré que s'il MODIFIE réellement la valeur en vigueur :
          // • un changement existe déjà pour (année, mois) → mis à jour (ou ignoré si inchangé) ;
          // • sinon → création uniquement si le montant diffère de la valeur précédente en vigueur.
          const existant = db.prepare(
            'SELECT montant FROM indemnites_categorie WHERE categorie_id = ? AND type = ? AND annee = ? AND mois = ?'
          ).get(categorieId, type, annee, mois);
          if (existant) {
            if (existant.montant === n.valeur) continue;
            upsert.run(categorieId, type, annee, mois, n.valeur);
          } else {
            const avant = montantCategorieIndemniteAvant(categorieId, type, periode);
            if (avant === n.valeur) continue;
            upsert.run(categorieId, type, annee, mois, n.valeur);
          }
          enregistres++;
        }
      }
    });
    tx();
    res.json({ ok: true, annee, mois, enregistres, retires });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Suppression d'un changement d'historique (annulation) — retire la ligne (categorie, type, année, mois).
router.delete('/changements/:id', requireRole('super_admin'), (req, res) => {
  const id = Number(req.params.id);
  const ligne = db.prepare('SELECT * FROM indemnites_categorie WHERE id = ?').get(id);
  if (!ligne) return res.status(404).json({ error: 'Changement introuvable.' });
  db.prepare('DELETE FROM indemnites_categorie WHERE id = ?').run(id);
  res.json({ ok: true, supprime: { id, categorie_id: ligne.categorie_id, type: ligne.type, annee: ligne.annee, mois: ligne.mois } });
});

module.exports = router;
module.exports.ANNEES = ANNEES;