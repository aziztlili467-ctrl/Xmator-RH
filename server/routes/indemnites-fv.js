const { Router } = require('express');
const { db, montantCategorieIndemnite, montantCategorieIndemniteAvant, montantEmployeIndemnite } = require('../db');
const { requireRole } = require('../middleware/auth');
const router = Router();

const lecture = requireRole('super_admin', 'consultation', 'moderateur');

const ANNEES = [2025, 2026, 2027, 2028, 2029, 2030];

// Normalise une valeur d'indemnité : vide/absent → null ; sinon numérique avec la
// virgule française acceptée (convertie en point). Rejeté → { ok:false }.
function normaliserIndemnite(valeur) {
  if (valeur === undefined || valeur === null || String(valeur).trim() === '') return { ok: true, valeur: null };
  const s = String(valeur).trim().replace(/\s/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return { ok: false, message: `Valeur invalide : ${valeur}` };
  return { ok: true, valeur: s };
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

// Valeur effective transport/présence d'un employé pour la période P :
//   1. surcharge manuelle de l'employé (indemnites_employe) si elle existe ;
//   2. sinon montant fixe de sa catégorie (indemnites_categorie) ;
//   3. sinon AUCUNE valeur (null) — les anciennes valeurs portées par la fiche employé
//      (colonnes employes.indemnite_transport / indemnite_presence) ne sont plus utilisées :
//      le seul référentiel est la sous-rubrique « Montants des indemnités F&V ».
// L'indemnité de Fonction reste une valeur simple par employé (aucun historique).
// `categorie` : montant fixe de la catégorie (indemnites_categorie) pour la période, utilisé
// comme référence d'assignation dans le « Tableau des indemnités ».
function resolver(type, employe, periode) {
  const surcharge = montantEmployeIndemnite(employe.id, type, periode);
  if (surcharge !== null) return { valeur: surcharge, source: 'manuel', categorie: montantCategorieIndemnite(employe.categorie_id, type, periode) };
  const categorie = montantCategorieIndemnite(employe.categorie_id, type, periode);
  if (categorie !== null) return { valeur: categorie, source: 'categorie', categorie };
  return { valeur: null, source: null, categorie: null };
}

// Liste des employés avec les indemnités en vigueur pour la période (année, mois).
// Ordre numérique du matricule, cohérent avec l'écran Employés.
router.get('/', lecture, (req, res) => {
  let periode;
  try {
    periode = validerPeriode(req.query.annee, req.query.mois);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  const rows = db.prepare(`
    SELECT e.id, e.matricule, e.nom, e.prenom, e.actif, e.departement,
           e.categorie_id, c.libelle AS categorie,
           e.indemnite_presence, e.indemnite_transport, e.indemnite_fonction
    FROM employes e
    LEFT JOIN categories c ON c.id = e.categorie_id
    ORDER BY CAST(e.matricule AS INTEGER), e.matricule
  `).all();
  const liste = rows.map((e) => {
    const t = resolver('transport', e, periode.periode);
    const p = resolver('presence', e, periode.periode);
    return {
      id: e.id, matricule: e.matricule, nom: e.nom, prenom: e.prenom,
      actif: e.actif, departement: e.departement, categorie_id: e.categorie_id,
      categorie: e.categorie || '',
      indemnite_transport: t.valeur, transport_source: t.source, categorie_transport: t.categorie,
      indemnite_presence: p.valeur, presence_source: p.source, categorie_presence: p.categorie,
      indemnite_fonction: e.indemnite_fonction,
    };
  });
  res.json({ annee: periode.annee, mois: periode.mois, lignes: liste });
});

// Enregistrement en masse : { annee, mois, lignes: [{ id, transport, presence, fonction }] }.
// Quadrature annuelle :
//   • transport / présence : une surcharge manuelle SAISIE pour (année, mois) est enregistrée
//     dans `indemnites_employe` et prend le relais du montant de la catégorie À PARTIR de ce mois.
//     Vider la case retire la surcharge de (année, mois) → retour au montant de la catégorie.
//     Les mois antérieurs ne sont jamais modifiés.
//   • fonction : valeur simple mise à jour sur la fiche employé (sans historique).
router.put('/', requireRole('super_admin'), (req, res) => {
  let periode;
  try {
    periode = validerPeriode(req.body.annee, req.body.mois);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  const { annee, mois } = periode;
  const { lignes } = req.body || {};
  if (!Array.isArray(lignes) || lignes.length === 0) {
    return res.status(400).json({ error: 'Aucune ligne à enregistrer.' });
  }
  const upsertSurcharge = db.prepare(`
    INSERT INTO indemnites_employe (employe_id, type, annee, mois, montant)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (employe_id, type, annee, mois)
    DO UPDATE SET montant = excluded.montant, updated_at = datetime('now','localtime')
  `);
  const retirerSurcharge = db.prepare(
    'DELETE FROM indemnites_employe WHERE employe_id = ? AND type = ? AND annee = ? AND mois = ?'
  );
  const majFonction = db.prepare('UPDATE employes SET indemnite_fonction = ? WHERE id = ?');
  const resultats = [];
  let enregistres = 0;
  let retires = 0;
  try {
    const tx = db.transaction(() => {
      for (const ligne of lignes) {
        const id = Number(ligne.id);
        const e = db.prepare('SELECT id, matricule, nom, prenom, categorie_id, indemnite_fonction FROM employes WHERE id = ?').get(id);
        if (!e) {
          resultats.push({ id, statut: 'inconnu', message: 'employé introuvable' });
          continue;
        }
        const t = normaliserIndemnite(ligne.transport);
        const p = normaliserIndemnite(ligne.presence);
        const f = normaliserIndemnite(ligne.fonction);
        if (!t.ok || !p.ok || !f.ok) {
          resultats.push({ id, matricule: e.matricule, statut: 'erreur', message: [t.message, p.message, f.message].filter(Boolean).join(' ; ') });
          continue;
        }
        // Transport / présence : surcharge versionnée par mois d'effet
        for (const [type, val] of [['transport', t.valeur], ['presence', p.valeur]]) {
          if (val === null) {
            const info = retirerSurcharge.run(id, type, annee, mois);
            if (info.changes > 0) retires++;
            continue;
          }
          const enForce = resolver(type, e, periode.periode).valeur;
          if (enForce === val) continue;
          upsertSurcharge.run(id, type, annee, mois, Number(val));
          enregistres++;
        }
        // Fonction : valeur simple (aucun historique)
        if (f.valeur !== e.indemnite_fonction) majFonction.run(f.valeur, id);
        enregistres += (f.valeur !== e.indemnite_fonction) ? 1 : 0;
        resultats.push({ id, matricule: e.matricule, statut: 'ok', message: `${e.nom} ${e.prenom}` });
      }
    });
    tx();
    res.json({ ok: true, enregistres, retires, total: lignes.length, resultats });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Réaffectation en masse des indemnités transport / présence depuis les montants fixes des
// catégories (« Montants des indemnités F&V ») : supprime TOUTES les surcharges manuelles
// transport/présence afin que chaque employé reprenne le montant de sa catégorie (ou sa fiche
// si la catégorie n'en a pas). L'indemnité de fonction n'est pas concernée.
router.post('/reaffecter', requireRole('super_admin'), (req, res) => {
  let periode;
  try {
    periode = validerPeriode(req.body.annee, req.body.mois);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  const n = db.prepare("DELETE FROM indemnites_employe WHERE type IN ('transport', 'presence')").run();
  res.json({ ok: true, retires: n.changes, periode: periode.periode, message: `${n.changes} surcharge(s) transport/présence supprimée(s) — chaque employé suit désormais le montant de sa catégorie.` });
});

module.exports = router;
module.exports.ANNEES = ANNEES;