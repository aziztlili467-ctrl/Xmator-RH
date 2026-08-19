const { Router } = require('express');
const { db } = require('../db');

const router = Router();

// Jours fériés nationaux fixes (Tunisie) — amorce lors de la 1re configuration d'une année (modifiables/supprimables)
const FERIES_NATIONAUX = [
  ['Jour de l\'An', '01/01'],
  ['Fête de l\'Indépendance', '20/03'],
  ['Jour des Martyrs', '09/04'],
  ['Fête du Travail', '01/05'],
  ['Fête de la République', '25/07'],
  ['Fête de la Femme', '13/08'],
  ['Fête de l\'Évacuation', '15/10'],
  ['Fête de l\'Arbre', '13/11'],
];

function isoDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.getUTCFullYear() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function ddmmyyyyToIso(annee, ddmm) {
  const m = /^(\d{1,2})\/(\d{1,2})$/.exec(String(ddmm || '').trim());
  if (!m) return null;
  return `${annee}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
}

function validerAnnee(annee) {
  const a = Number(annee);
  return Number.isInteger(a) && a >= 2000 && a <= 2100 ? a : null;
}

function validerHeures(h) {
  if (h === null || h === undefined || h === '') return 0;
  const v = Number(h);
  return Number.isFinite(v) && v >= 0 && v <= 24 ? v : null;
}

// Calcule les heures d'un jour selon les règles : férié > week-end > ramadan > été (juillet/août) > normal
function calculerJour(annee, iso, config, feriesMap) {
  const f = feriesMap[iso];
  if (f) return { heures: Number(f.heures) || 0, source: 'ferie', label: f.nom };
  const d = new Date(iso + 'T00:00:00');
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return { heures: 0, source: 'weekend', label: null };
  const rD = config.ramadan_debut;
  const rF = config.ramadan_fin;
  if (rD && rF && iso >= rD && iso <= rF) return { heures: Number(config.heures_reduites), source: 'ramadan', label: null };
  const m = d.getMonth();
  if (m === 6 || m === 7) return { heures: Number(config.heures_reduites), source: 'ete', label: null };
  return { heures: Number(config.heures_normales), source: 'normal', label: null };
}

// Ajoute automatiquement les fêtes religieuses dérivées de la fin du ramadan (repos payé, 0 h) :
//   - Aïd el-Fitr : les 2 jours qui suivent la fin du ramadan (ramadan_fin + 1, ramadan_fin + 2) ;
//   - Aïd el-Kebir : estimation des 2 jours du grand Aïd (~10 Dhou al-Hijja ≈ 70 jours après la fin du ramadan,
//     ramadan_fin + 70 et + 71) — ajustables manuellement (l'édition rend le jour définitif).
// Les anciens jours auto-gérés (automatique = 1) sont retirés puis recréés. Si la date est déjà un
// jour férié (ex. fête nationale), elle est conservée (déjà repos payé). Les jours modifiés par
// l'utilisateur (automatique = 0) ne sont pas touchés.
function synchroniserAids(annee) {
  db.prepare('DELETE FROM jours_feries WHERE annee = ? AND automatique = 1').run(annee);
  const config = db.prepare('SELECT * FROM config_annees WHERE annee = ?').get(annee);
  if (!config || !config.ramadan_fin) return;
  const fin = new Date(config.ramadan_fin + 'T00:00:00');
  const ins = db.prepare('INSERT INTO jours_feries (annee, nom, date, type, heures, automatique) VALUES (?,?,?,?,?,1)');
  const fêtes = [
    { nom: 'Aïd el-Fitr', offsets: [1, 2] },
    { nom: 'Aïd el-Kebir', offsets: [70, 71] },
  ];
  for (const f of fêtes) {
    for (const off of f.offsets) {
      const d = new Date(fin.getFullYear(), fin.getMonth(), fin.getDate() + off);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (Number(iso.slice(0, 4)) !== annee) continue;
      if (db.prepare('SELECT id FROM jours_feries WHERE annee = ? AND date = ?').get(annee, iso)) continue;
      ins.run(annee, f.nom, iso, 'religieuse', 0);
    }
  }
}

// (Re)génère tous les jours de l'année dans jours_travail depuis la config + jours fériés.
// Les jours modifiés manuellement (source='manuel') sont PRÉSERVÉS.
function genererAnnee(annee) {
  const config = db.prepare('SELECT * FROM config_annees WHERE annee = ?').get(annee);
  if (!config) return [];
  const feries = db.prepare('SELECT * FROM jours_feries WHERE annee = ?').all(annee);
  const feriesMap = {};
  feries.forEach((f) => { feriesMap[f.date] = f; });
  const manuelSet = new Set(
    db.prepare("SELECT date FROM jours_travail WHERE annee = ? AND source = 'manuel'").all(annee).map((r) => r.date)
  );
  const nbJours = (new Date(annee + 1, 0, 1) - new Date(annee, 0, 1)) / 86400000;
  const upsert = db.prepare(`
    INSERT INTO jours_travail (annee, date, heures, source, label) VALUES (?,?,?,?,?)
    ON CONFLICT(annee, date) DO UPDATE SET heures = excluded.heures, source = excluded.source, label = excluded.label
  `);
  const tx = db.transaction(() => {
    for (let j = 1; j <= nbJours; j++) {
      const d = new Date(annee, 0, j);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (manuelSet.has(iso)) continue;
      const c = calculerJour(annee, iso, config, feriesMap);
      upsert.run(annee, iso, c.heures, c.source, c.label);
    }
  });
  tx();
  return db.prepare('SELECT * FROM jours_travail WHERE annee = ? ORDER BY date').all(annee);
}

// GET /:annee — configuration + jours fériés + jours travaillés de l'année (config null si l'année n'est pas encore configurée)
router.get('/:annee', (req, res) => {
  const annee = validerAnnee(req.params.annee);
  if (!annee) return res.status(400).json({ error: 'Année invalide.' });
  const config = db.prepare('SELECT * FROM config_annees WHERE annee = ?').get(annee) || null;
  const joursFeries = db.prepare('SELECT * FROM jours_feries WHERE annee = ? ORDER BY date').all(annee);
  const joursTravail = db.prepare('SELECT * FROM jours_travail WHERE annee = ? ORDER BY date').all(annee);
  res.json({ annee, config, jours_feries: joursFeries, jours_travail: joursTravail });
});

// PUT /:annee — enregistre la configuration de l'année (création ou mise à jour).
// À la 1re création, amorce les jours fériés nationaux fixes de l'année (si la table est vide pour cette année).
router.put('/:annee', (req, res) => {
  const annee = validerAnnee(req.params.annee);
  if (!annee) return res.status(400).json({ error: 'Année invalide.' });

  const hN = validerHeures(req.body && req.body.heures_normales);
  if (hN === null) return res.status(400).json({ error: 'Heures normales invalides (0–24).' });
  const hR = validerHeures(req.body && req.body.heures_reduites);
  if (hR === null) return res.status(400).json({ error: 'Heures réduites invalides (0–24).' });

  let dD = null;
  let dF = null;
  if (req.body && (req.body.ramadan_debut || req.body.ramadan_fin)) {
    dD = isoDate(req.body.ramadan_debut);
    dF = isoDate(req.body.ramadan_fin);
    if (!dD || !dF || String(dD).slice(0, 4) !== String(annee) || String(dF).slice(0, 4) !== String(annee)) {
      return res.status(400).json({ error: 'Dates de ramadan invalides (AAAA-MM-JJ, dans l\'année).' });
    }
    if (dD > dF) return res.status(400).json({ error: 'La fin du ramadan doit être après le début.' });
  }

  const existe = db.prepare('SELECT id FROM config_annees WHERE annee = ?').get(annee);
  let created = false;
  if (existe) {
    db.prepare(`
      UPDATE config_annees SET heures_normales = ?, heures_reduites = ?, ramadan_debut = ?, ramadan_fin = ?,
      updated_at = datetime('now','localtime') WHERE annee = ?
    `).run(hN, hR, dD, dF, annee);
  } else {
    db.prepare(`
      INSERT INTO config_annees (annee, heures_normales, heures_reduites, ramadan_debut, ramadan_fin)
      VALUES (?,?,?,?,?)
    `).run(annee, hN, hR, dD, dF);
    created = true;
  }

  if (created) {
    const n = db.prepare('SELECT COUNT(*) AS n FROM jours_feries WHERE annee = ?').get(annee).n;
    if (n === 0) {
      const ins = db.prepare('INSERT INTO jours_feries (annee, nom, date, type, heures) VALUES (?,?,?,?,0)');
      const tx = db.transaction(() => {
        for (const [nom, ddmm] of FERIES_NATIONAUX) {
          const date = ddmmyyyyToIso(annee, ddmm);
          if (date && isoDate(date)) ins.run(annee, nom, date, 'nationale');
        }
      });
      tx();
    }
  }

  synchroniserAids(annee);

  const config = db.prepare('SELECT * FROM config_annees WHERE annee = ?').get(annee);
  const joursFeries = db.prepare('SELECT * FROM jours_feries WHERE annee = ? ORDER BY date').all(annee);
  const joursTravail = genererAnnee(annee);
  res.json({ ok: true, created, config, jours_feries: joursFeries, jours_travail: joursTravail });
});

// POST /:annee/generer — régénère les jours travaillés de l'année depuis la config + jours fériés
// (les jours modifiés manuellement sont préservés). Idempotent.
router.post('/:annee/generer', (req, res) => {
  const annee = validerAnnee(req.params.annee);
  if (!annee) return res.status(400).json({ error: 'Année invalide.' });
  synchroniserAids(annee);
  const joursTravail = genererAnnee(annee);
  res.json({ ok: true, annee, jours_travail: joursTravail });
});

// PUT /jours/:id — modifie un jour travaillé : {heures, source:'manuel'} pour une saisie manuelle,
// ou {source:'auto'} pour rétablir la valeur calculée automatiquement.
router.put('/jours/:id', (req, res) => {
  const id = Number(req.params.id);
  const jour = db.prepare('SELECT * FROM jours_travail WHERE id = ?').get(id);
  if (!jour) return res.status(404).json({ error: 'Jour introuvable.' });
  const b = req.body || {};

  if (b.source === 'auto') {
    const config = db.prepare('SELECT * FROM config_annees WHERE annee = ?').get(jour.annee);
    if (!config) return res.status(400).json({ error: 'Année non configurée.' });
    const feriesMap = {};
    db.prepare('SELECT * FROM jours_feries WHERE annee = ?').all(jour.annee)
      .forEach((f) => { feriesMap[f.date] = f; });
    const c = calculerJour(jour.annee, jour.date, config, feriesMap);
    db.prepare('UPDATE jours_travail SET heures = ?, source = ?, label = ? WHERE id = ?')
      .run(c.heures, c.source, c.label, id);
  } else {
    const h = validerHeures(b.heures);
    if (h === null) return res.status(400).json({ error: 'Heures invalides (0–24).' });
    const label = (b.label !== undefined && b.label !== null) ? String(b.label) : jour.label;
    db.prepare('UPDATE jours_travail SET heures = ?, source = ?, label = ? WHERE id = ?')
      .run(h, 'manuel', label, id);
  }

  res.json({ ok: true, jour: db.prepare('SELECT * FROM jours_travail WHERE id = ?').get(id) });
});

// POST /:annee/jours-feries — ajoute un jour férié (repos payé par défaut : heures = 0)
router.post('/:annee/jours-feries', (req, res) => {
  const annee = validerAnnee(req.params.annee);
  if (!annee) return res.status(400).json({ error: 'Année invalide.' });

  const nom = String((req.body || {}).nom || '').trim();
  if (!nom) return res.status(400).json({ error: 'Le nom du jour férié est obligatoire.' });

  const date = isoDate((req.body || {}).date);
  if (!date || Number(date.slice(0, 4)) !== annee) return res.status(400).json({ error: 'Date invalide ou hors de l\'année.' });

  const heures = validerHeures((req.body || {}).heures);
  if (heures === null) return res.status(400).json({ error: 'Heures invalides (0–24).' });

  const type = (req.body || {}).type === 'religieuse' ? 'religieuse' : 'nationale';

  if (db.prepare('SELECT id FROM jours_feries WHERE annee = ? AND date = ?').get(annee, date)) {
    return res.status(409).json({ error: 'Un jour férié existe déjà à cette date.' });
  }

  const r = db.prepare('INSERT INTO jours_feries (annee, nom, date, type, heures) VALUES (?,?,?,?,?)')
    .run(annee, nom, date, type, heures);
  const jourFerie = db.prepare('SELECT * FROM jours_feries WHERE id = ?').get(r.lastInsertRowid);
  genererAnnee(annee);
  res.json({ ok: true, jour_ferie: jourFerie });
});

// PUT /jours-feries/:id — modifie un jour férié
router.put('/jours-feries/:id', (req, res) => {
  const id = Number(req.params.id);
  const existant = db.prepare('SELECT * FROM jours_feries WHERE id = ?').get(id);
  if (!existant) return res.status(404).json({ error: 'Jour férié introuvable.' });

  const b = req.body || {};
  let date = existant.date;
  if (b.date !== undefined && b.date !== null && String(b.date).trim() !== '') {
    date = isoDate(b.date);
    if (!date || Number(date.slice(0, 4)) !== existant.annee) return res.status(400).json({ error: 'Date invalide ou hors de l\'année.' });
  }

  let heures = existant.heures;
  if (b.heures !== undefined && b.heures !== null && String(b.heures).trim() !== '') {
    heures = validerHeures(b.heures);
    if (heures === null) return res.status(400).json({ error: 'Heures invalides (0–24).' });
  }

  const nom = (b.nom !== undefined && b.nom !== null && String(b.nom).trim() !== '') ? String(b.nom).trim() : existant.nom;
  const type = b.type === 'religieuse' || b.type === 'nationale' ? b.type : existant.type;

  const conflit = db.prepare('SELECT id FROM jours_feries WHERE annee = ? AND date = ? AND id != ?')
    .get(existant.annee, date, id);
  if (conflit) return res.status(409).json({ error: 'Un jour férié existe déjà à cette date.' });

  db.prepare('UPDATE jours_feries SET nom = ?, date = ?, type = ?, heures = ?, automatique = 0 WHERE id = ?')
    .run(nom, date, type, heures, id);
  const jourFerie = db.prepare('SELECT * FROM jours_feries WHERE id = ?').get(id);
  genererAnnee(existant.annee);
  res.json({ ok: true, jour_ferie: jourFerie });
});

// DELETE /jours-feries/:id — supprime un jour férié
router.delete('/jours-feries/:id', (req, res) => {
  const id = Number(req.params.id);
  const existant = db.prepare('SELECT annee FROM jours_feries WHERE id = ?').get(id);
  if (!existant) return res.status(404).json({ error: 'Jour férié introuvable.' });
  db.prepare('DELETE FROM jours_feries WHERE id = ?').run(id);
  genererAnnee(existant.annee);
  res.json({ ok: true });
});

module.exports = router;