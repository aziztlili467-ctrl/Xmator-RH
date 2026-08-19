const { Router } = require('express');
const { db } = require('../db');
const router = Router();

// Journal des mouvements liés à la maladie :
// - crédits maladie (solde initial / ajout annuel)
// - arrêts maladie validés (type 'maladie')
// - absences issues d'un arrêt rejeté (type 'absence')
router.get('/', (req, res) => {
  const { type, employe, annee, search } = req.query;

  const where = [];
  const params = [];

  where.push("(m.solde_type = 'maladie' OR m.type_operation = 'absence')");

  if (type && type !== 'tous') {
    where.push('m.type_operation = ?');
    params.push(type);
  }
  if (employe) {
    where.push('m.employe_id = ?');
    params.push(Number(employe));
  }
  if (annee) {
    where.push("strftime('%Y', m.date_operation) = ?");
    params.push(String(annee));
  }
  if (search) {
    where.push(`(e.nom LIKE ? OR e.prenom LIKE ? OR e.matricule LIKE ? OR a.numero_sequentiel LIKE ? OR a.numero_bulletin LIKE ?)`);
    const like = `%${String(search).trim()}%`;
    params.push(like, like, like, like, like);
  }

  const rows = db.prepare(`
    SELECT
      m.id, m.employe_id, m.type_operation, m.solde_type, m.date_operation, m.jours, m.motif,
      m.solde_apres, m.created_at,
      e.matricule, e.nom, e.prenom, c.libelle AS categorie,
      a.numero_sequentiel AS arret_numero, a.numero_bulletin, a.certificat,
      a.date_debut AS arret_debut, a.date_fin AS arret_fin, a.statut AS arret_statut
    FROM mouvements m
    JOIN employes e ON e.id = m.employe_id
    JOIN categories c ON c.id = e.categorie_id
    LEFT JOIN arrets_maladie a ON a.id = m.arret_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY m.date_operation DESC, m.id DESC
  `).all(...params);

  const total = rows.reduce((s, r) => s + (r.type_operation === 'solde_initial' || r.type_operation === 'ajout_annuel' ? 0 : r.jours), 0);

  res.json({ total: Math.round(total * 1000) / 1000, operations: rows });
});

module.exports = router;
