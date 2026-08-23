const { Router } = require('express');
const path = require('path');
const PDFDocument = require('pdfkit');
const { db } = require('../db');
const router = Router();

// Rubrique Horaires › Notification d'Absences : formulaire rempli par le supérieur hiérarchique
// ou le responsable RH. Le nombre de jours d'absence EXCLUT les repos hebdomadaires (samedi/dimanche)
// et les jours fériés payés (religieux/nationaux) : on ne compte que les jours PRÉVUS au calendrier
// administratif (`jours_travail.heures > 0` — même règle métier que les taux de présence, session 44).

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function fmtFR(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('T')[0].split('-');
  return `${d}/${m}/${y}`;
}

function nbJoursCalendaires(debut, fin) {
  const d1 = new Date(debut + 'T00:00:00');
  const d2 = new Date(fin + 'T00:00:00');
  return Math.round((d2 - d1) / 86400000) + 1;
}

// Affiche « 5 » plutôt que « 5.0 » et la virgule décimale française
function fmtNombre(v) {
  const x = Number(v);
  if (!Number.isFinite(x)) return String(v);
  const s = x.toFixed(1);
  return s.endsWith('.0') ? s.slice(0, -2) : s.replace('.', ',');
}

// Jours ouvrables [debut, fin] selon le calendrier administratif configuré.
// Repli refusé sur estOuvrable() seul : si une année couverte n'a pas de calendrier, on le signale.
function joursOuvrables(debut, fin) {
  const annees = new Set();
  for (let y = +debut.slice(0, 4); y <= +fin.slice(0, 4); y++) annees.add(y);
  const manquantes = [];
  for (const y of annees) {
    if (!db.prepare('SELECT COUNT(*) AS n FROM jours_travail WHERE annee = ?').get(y).n) manquantes.push(y);
  }
  if (manquantes.length) return { manquantes };
  const prevus = db.prepare('SELECT COUNT(*) AS n FROM jours_travail WHERE date >= ? AND date <= ? AND heures > 0').get(debut, fin).n;
  const total = nbJoursCalendaires(debut, fin);
  return { jours: prevus, total, exclus: total - prevus, manquantes: [] };
}

function chargerNotification(id) {
  return db.prepare(`
    SELECT n.*, e.nom, e.prenom, e.matricule AS mat_employe, c.libelle AS categorie
    FROM notifications_absence n
    JOIN employes e ON e.id = n.employe_id
    LEFT JOIN categories c ON c.id = e.categorie_id
    WHERE n.id = ?
  `).get(id);
}

// ---- Aperçu du nombre de jours ouvrables d'une période (calcul en direct du formulaire) ----
router.get('/jours', (req, res) => {
  const { debut, fin } = req.query;
  if (!debut || !fin || !DATE_RE.test(debut) || !DATE_RE.test(fin)) {
    return res.status(400).json({ error: 'Paramètres debut et fin requis au format AAAA-MM-JJ.' });
  }
  if (fin < debut) return res.status(400).json({ error: 'La date de fin doit être postérieure ou égale à la date de début.' });
  const r = joursOuvrables(debut, fin);
  if (r.manquantes.length) {
    return res.json({ jours: null, message: `Calendrier administratif non configuré pour ${r.manquantes.join(', ')}. Configurez-le dans Calendrier.` });
  }
  res.json({ jours: r.jours, total_calendaire: r.total, exclus: r.exclus });
});

// ---- Journal des notifications (toutes les opérations) ----
router.get('/', (req, res) => {
  const { debut, fin, matricule } = req.query;
  let sql = `
    SELECT n.id, n.employe_id, n.matricule, n.date_debut, n.date_fin, n.nb_jours,
           n.superieur, n.cree_par, n.created_at,
           e.nom, e.prenom, c.libelle AS categorie
    FROM notifications_absence n
    JOIN employes e ON e.id = n.employe_id
    LEFT JOIN categories c ON c.id = e.categorie_id
    WHERE 1 = 1`;
  const params = [];
  if (debut && DATE_RE.test(debut)) { sql += ' AND n.date_fin >= ?'; params.push(debut); }
  if (fin && DATE_RE.test(fin)) { sql += ' AND n.date_debut <= ?'; params.push(fin); }
  if (matricule) {
    sql += ' AND (n.matricule = ? OR CAST(n.matricule AS INTEGER) = ?)';
    params.push(String(matricule).trim(), parseInt(matricule, 10) || -1);
  }
  sql += ' ORDER BY n.id DESC LIMIT 500';
  const notifications = db.prepare(sql).all(...params);
  const t = db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(nb_jours),0) AS jours FROM notifications_absence').get();
  res.json({
    notifications,
    totaux: { notifications: t.n, jours: t.jours },
    filtre: { debut: debut || null, fin: fin || null, matricule: matricule || null },
  });
});

// ---- Création d'une notification (formulaire validé) ----
router.post('/', (req, res) => {
  const b = req.body || {};
  const matricule = String(b.matricule || '').trim();
  const { date_debut, date_fin } = b;
  const superieur = String(b.superieur || '').trim();

  if (!matricule || !/^\d{1,10}$/.test(matricule)) return res.status(400).json({ error: 'Matricule requis (chiffres uniquement).' });
  if (!date_debut || !date_fin || !DATE_RE.test(date_debut) || !DATE_RE.test(date_fin)) {
    return res.status(400).json({ error: 'Dates de début et de fin requises au format AAAA-MM-JJ.' });
  }
  if (date_fin < date_debut) return res.status(400).json({ error: 'La date de fin doit être postérieure ou égale à la date de début.' });
  if (!superieur) return res.status(400).json({ error: 'Le nom du supérieur hiérarchique est requis.' });

  const empParMat = new Map();
  for (const e of db.prepare('SELECT id, matricule FROM employes WHERE actif = 1').all()) {
    empParMat.set(String(e.matricule).trim(), e);
    const n = parseInt(e.matricule, 10);
    if (!isNaN(n)) empParMat.set(String(n), e);
  }
  const emp = empParMat.get(matricule) || empParMat.get(String(parseInt(matricule, 10) || -1));
  if (!emp) return res.status(404).json({ error: `Aucun employé actif avec le matricule « ${matricule} ».` });

  const calc = joursOuvrables(date_debut, date_fin);
  if (calc.manquantes.length) {
    return res.status(400).json({ error: `Calendrier administratif non configuré pour ${calc.manquantes.join(', ')}.` });
  }
  if (!calc.jours) {
    return res.status(400).json({ error: "La période choisie ne contient aucun jour ouvrable (uniquement des repos hebdomadaires et/ou des jours fériés)." });
  }

  const info = db.prepare(`
    INSERT INTO notifications_absence (employe_id, matricule, date_debut, date_fin, nb_jours, superieur, cree_par)
    VALUES (?,?,?,?,?,?,?)
  `).run(emp.id, emp.matricule, date_debut, date_fin, calc.jours, superieur, req.user ? req.user.login : null);

  res.status(201).json({
    ok: true,
    notification: chargerNotification(info.lastInsertRowid),
    detail: { total_calendaire: calc.total, exclus: calc.exclus },
  });
});

// ---- Suppression (gestion des données) ----
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const row = db.prepare('SELECT id FROM notifications_absence WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Notification introuvable.' });
  db.prepare('DELETE FROM notifications_absence WHERE id = ?').run(id);
  res.json({ ok: true });
});

// ---- Impression PDF du formulaire (portrait A4) ----
router.get('/:id/pdf', (req, res) => {
  const n = chargerNotification(parseInt(req.params.id, 10));
  if (!n) return res.status(404).json({ error: 'Notification introuvable.' });

  const doc = new PDFDocument({ size: 'A4', layout: 'portrait', margins: { top: 55, bottom: 55, left: 60, right: 60 } });
  doc.registerFont('Garamond', path.join(__dirname, '..', 'fonts', 'EBGaramond.ttf'));
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="notification-absence-${n.id}.pdf"`);
  doc.pipe(res);

  const pageW = doc.page.width;
  const L = doc.page.margins.left;
  const W = pageW - doc.page.margins.left - doc.page.margins.right;
  const today = new Date();
  const stamp = `${today.getDate()}/${today.getMonth() + 1}/${today.getFullYear()}`;

  doc.font('Garamond').fontSize(15).fillColor('#111827')
    .text('Amicale du Personnel', L, 58, { width: W, align: 'center' });
  doc.fontSize(13)
    .text('de la Banque Centrale de Tunisie', L, 82, { width: W, align: 'center' });
  doc.moveTo(L, 108).lineTo(L + W, 108).strokeColor('#111827').lineWidth(1.2).stroke();

  doc.font('Garamond').fontSize(17).fillColor('#111827')
    .text("NOTIFICATION D'ABSENCE", L, 130, { width: W, align: 'center', characterSpacing: 1 });
  doc.font('Helvetica').fontSize(9.5).fillColor('#64748b')
    .text(`N° ${String(n.id).padStart(4, '0')}`, L, 156, { width: W, align: 'center' });

  const y0 = 190;
  doc.font('Garamond').fontSize(12).fillColor('#1f2937')
    .text(`Je soussigné(e), ${n.superieur}, supérieur hiérarchique / responsable RH, notifie l'absence de l'employé(e) suivant(e) :`,
      L, y0, { width: W, lineGap: 3 });

  // Tableau des champs
  const rows = [
    ['Matricule', String(n.matricule)],
    ['Nom et prénom', `${n.nom} ${n.prenom}`],
    ['Catégorie', n.categorie || '—'],
    ["Date d'absence — début", fmtFR(n.date_debut)],
    ["Date d'absence — fin", fmtFR(n.date_fin)],
    ['Nombre de jours d\u2019absence', `${fmtNombre(n.nb_jours)} jour(s)`],
  ];
  let y = y0 + 52;
  const labelW = W * 0.42;
  const valW = W - labelW;
  const rowH = 30;
  for (const [k, v] of rows) {
    doc.rect(L, y, labelW, rowH).fill('#eef2f7');
    doc.rect(L + labelW, y, valW, rowH).fill('#ffffff');
    doc.lineWidth(0.8).strokeColor('#94a3b8').rect(L, y, labelW, rowH).stroke().rect(L + labelW, y, valW, rowH).stroke();
    doc.fillColor('#334155').font('Helvetica-Bold').fontSize(10)
      .text(k, L + 8, y + 9, { width: labelW - 16, lineBreak: false });
    doc.fillColor('#111827').font('Helvetica').fontSize(11)
      .text(v, L + labelW + 8, y + 8, { width: valW - 16, lineBreak: false });
    y += rowH;
  }

  doc.fillColor('#475569').font('Helvetica').fontSize(8.5)
    .text('Nombre de jours calculé hors samedis/dimanches (repos hebdomadaire) et hors jours fériés payés (religieux et nationaux).',
      L, y + 8, { width: W });

  let ys = y + 40;
  doc.font('Garamond').fontSize(12).fillColor('#1f2937')
    .text('Fait pour servir et valoir ce que de droit.', L, ys, { width: W });
  ys += 34;
  doc.text(`Tunis, le ${stamp}`, L, ys, { width: W, align: 'right' });

  // Bloc signatures
  ys += 70;
  const colW = W / 3;
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#334155');
  doc.text('L\u2019intéressé(e)', L + colW * 0, ys, { width: colW, align: 'center', lineBreak: false });
  doc.text('Le supérieur hiérarchique', L + colW, ys, { width: colW, align: 'center', lineBreak: false });
  doc.text('Le responsable RH', L + colW * 2, ys, { width: colW, align: 'center', lineBreak: false });
  doc.moveTo(L + colW * 0.15, ys + 46).lineTo(L + colW * 0.85, ys + 46).strokeColor('#cbd5e1').lineWidth(0.7).stroke();
  doc.moveTo(L + colW * 1.15, ys + 46).lineTo(L + colW * 1.85, ys + 46).strokeColor('#cbd5e1').lineWidth(0.7).stroke();
  doc.moveTo(L + colW * 2.15, ys + 46).lineTo(L + colW * 2.85, ys + 46).strokeColor('#cbd5e1').lineWidth(0.7).stroke();

  doc.font('Helvetica').fontSize(8).fillColor('#94a3b8')
    .text(`Document établi le ${stamp} par « ${n.cree_par || '—'} » — Notification d'absences N° ${String(n.id).padStart(4, '0')}`,
      L, doc.page.height - 62, { width: W, align: 'center', lineBreak: false });

  doc.end();
});

module.exports = router;
