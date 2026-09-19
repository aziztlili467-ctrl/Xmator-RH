const { Router } = require('express');
const { db } = require('../db');
const router = Router();

// Journal des mouvements liés à la maladie :
// - crédits maladie (solde initial / ajout annuel)
// - arrêts maladie validés (type 'maladie')
// - absences issues d'un arrêt rejeté (type 'absence')
function queryJournal(query) {
  const { type, employe, annee, search, matricule } = query;

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
  if (matricule) {
    where.push('(e.matricule = ? OR CAST(e.matricule AS INTEGER) = ?)');
    const n = parseInt(matricule, 10);
    params.push(String(matricule).trim(), isNaN(n) ? -1 : n);
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

  return db.prepare(`
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
}

router.get('/', (req, res) => {
  const rows = queryJournal(req.query);
  const total = rows.reduce((s, r) => s + (r.type_operation === 'solde_initial' || r.type_operation === 'ajout_annuel' ? 0 : r.jours), 0);
  res.json({ total: Math.round(total * 1000) / 1000, operations: rows });
});

// GET /api/journal-maladie/pdf — impression du Journal des Arrêts Maladie
// (portrait par défaut, paysage au choix).
router.get('/pdf', (req, res) => {
  const rows = queryJournal(req.query);
  const { orientation, annee, matricule, type } = req.query;
  const { buildListePdf, fmtFR } = require('../utils/pdfTable');

  const TYPE_LABELS = {
    solde_initial: 'Solde initial',
    ajout_annuel: 'Ajout annuel',
    maladie: 'Arrêt maladie validé',
    absence: 'Absence (rejet)',
  };
  const valides = rows.filter((r) => r.type_operation === 'maladie');
  const absences = rows.filter((r) => r.type_operation === 'absence');
  const credits = rows.filter((r) => r.type_operation === 'solde_initial' || r.type_operation === 'ajout_annuel');
  const sum = (arr) => Math.round(arr.reduce((s, r) => s + Number(r.jours || 0), 0) * 100) / 100;
  const fmtN = (n) => String(n).replace('.', ',');
  const numArret = (r) => (r.arret_numero ? `N°${String(r.arret_numero).padStart(3, '0')}` : '—');

  const filtres = [
    annee ? `Année : ${annee}` : 'Année : toutes',
    matricule ? `Matricule : ${matricule}` : null,
    type ? `Type : ${TYPE_LABELS[type] || type}` : null,
  ].filter(Boolean).join(' · ');

  return buildListePdf({
    res,
    orientation: orientation === 'landscape' ? 'landscape' : 'portrait',
    titre: 'Journal des Arrêts Maladie',
    sousTitre: `${filtres} — ${rows.length} opération(s)`,
    refLigne: `Édité le ${fmtFR(new Date().toISOString().slice(0, 10))} · ${new Date().toTimeString().slice(0, 5)}`,
    filename: `journal-arrets-maladie_${annee || 'tout'}.pdf`,
    kpis: [
      { label: 'Arrêts traités', value: valides.length + absences.length, unit: 'validés + rejetés', color: '#1e3a5f' },
      { label: 'Jours maladie', value: fmtN(sum(valides)), unit: 'jours', color: '#e11d48' },
      { label: "Jours d'absence", value: fmtN(sum(absences)), unit: 'jours', color: '#64748b' },
      { label: 'Crédits maladie', value: `+${fmtN(sum(credits))}`, unit: 'jours', color: '#059669' },
    ],
    columns: [
      { label: 'N° arrêt', weight: 0.85, align: 'center', bold: true, format: numArret },
      { label: 'Date', weight: 1.05, format: (r) => fmtFR(r.date_operation) },
      { label: 'Matricule', key: 'matricule', weight: 0.8, align: 'center', bold: true, color: '#1d4ed8' },
      { label: 'Agent', weight: 2.1, format: (r) => `${r.nom} ${r.prenom}` },
      { label: 'Catégorie', key: 'categorie', weight: 1.6 },
      { label: 'Type', weight: 1.5, format: (r) => TYPE_LABELS[r.type_operation] || r.type_operation },
      { label: 'Bulletin', weight: 1.1, align: 'center', color: '#64748b', format: (r) => r.numero_bulletin || '—' },
      { label: 'Jours', weight: 0.7, align: 'right', bold: true, format: (r) => `${r.type_operation === 'solde_initial' || r.type_operation === 'ajout_annuel' ? '+' : '−'}${fmtN(r.jours)}` },
      { label: 'Solde après', weight: 0.85, align: 'right', format: (r) => `${fmtN(r.solde_apres)} j` },
    ],
    rows,
  });
});

module.exports = router;
