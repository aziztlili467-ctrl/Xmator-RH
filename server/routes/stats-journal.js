const { Router } = require('express');
const path = require('path');
const PDFDocument = require('pdfkit');
const { db } = require('../db');
const router = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Jours ouvrés (hors samedi/dimanche) entre deux dates incluses.
function nbJours(debut, fin) {
  const d1 = new Date(debut + 'T00:00:00');
  const d2 = new Date(fin + 'T00:00:00');
  if (isNaN(d1) || isNaN(d2) || d2 < d1) return null;
  let count = 0;
  const cur = new Date(d1);
  while (cur <= d2) {
    const wd = cur.getDay();
    if (wd !== 0 && wd !== 6) count += 1;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Liste de toutes les dates calendaires (y compris week-ends) entre debut et fin incluses.
function listDates(debut, fin) {
  const dates = [];
  const cur = new Date(debut + 'T00:00:00');
  const end = new Date(fin + 'T00:00:00');
  while (cur <= end) {
    dates.push(toISO(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function isWeekend(iso) {
  const wd = new Date(iso + 'T00:00:00').getDay();
  return wd === 0 || wd === 6;
}

const COLS = [
  { key: 'ca', abbr: 'CA', label: 'Congé légal' },
  { key: 'ce', abbr: 'CE', label: 'Congé exceptionnel' },
  { key: 'ma', abbr: 'MA', label: 'Arrêt maladie' },
  { key: 'abs', abbr: 'ABS', label: 'Absence injustifiée' },
];

// Matrice quotidienne : dates × employés → code (CA/CE/MA/ABS) par journée ouvrable.
function computeStats(debut, fin) {
  const employes = db.prepare(`
    SELECT e.id, e.matricule, e.nom, e.prenom, c.libelle AS categorie
    FROM employes e
    JOIN categories c ON c.id = e.categorie_id
    WHERE e.actif = 1
    ORDER BY CAST(e.matricule AS INTEGER), e.matricule
  `).all();

  const dates = listDates(debut, fin);
  const jours = {};

  const setCode = (employeId, dD, dF, code) => {
    if (!jours[employeId]) jours[employeId] = {};
    const s = dD > debut ? dD : debut;
    const e = dF < fin ? dF : fin;
    if (e < s) return;
    const cur = new Date(s + 'T00:00:00');
    const end = new Date(e + 'T00:00:00');
    while (cur <= end) {
      const wd = cur.getDay();
      if (wd !== 0 && wd !== 6) {
        const iso = toISO(cur);
        jours[employeId][iso] = jours[employeId][iso] ? `${jours[employeId][iso]}/${code}` : code;
      }
      cur.setDate(cur.getDate() + 1);
    }
  };

  // CA (légal) / CE (exceptionnel) : demandes acceptées chevauchant la période
  const conges = db.prepare(`
    SELECT employe_id, nature_conge, date_debut, date_fin FROM demandes_conge
    WHERE statut = 'acceptee' AND date_debut <= ? AND date_fin >= ?
  `).all(fin, debut);
  for (const c of conges) setCode(c.employe_id, c.date_debut, c.date_fin, c.nature_conge === 'legal' ? 'CA' : 'CE');

  // MA : arrêts maladie validés
  const arrets = db.prepare(`
    SELECT employe_id, date_debut, date_fin FROM arrets_maladie
    WHERE statut = 'valide' AND date_debut <= ? AND date_fin >= ?
  `).all(fin, debut);
  for (const a of arrets) setCode(a.employe_id, a.date_debut, a.date_fin, 'MA');

  // ABS : absences (rejet d'arrêt maladie ou absence saisie)
  const absences = db.prepare(`
    SELECT m.employe_id,
           COALESCE(a.date_debut, m.date_operation) AS dD,
           COALESCE(a.date_fin, m.date_operation) AS dF
    FROM mouvements m
    LEFT JOIN arrets_maladie a ON a.id = m.arret_id
    WHERE m.type_operation = 'absence'
  `).all();
  for (const x of absences) setCode(x.employe_id, x.dD, x.dF, 'ABS');

  const totaux = { ca: 0, ce: 0, ma: 0, abs: 0, total: 0 };
  for (const id of Object.keys(jours)) {
    for (const iso of Object.keys(jours[id])) {
      jours[id][iso].split('/').forEach((code) => {
        const k = code.toLowerCase();
        if (Object.prototype.hasOwnProperty.call(totaux, k)) totaux[k] += 1;
      });
    }
  }
  totaux.total = totaux.ca + totaux.ce + totaux.ma + totaux.abs;

  return { debut, fin, dates, employes, jours, totaux };
}

function fmtFR(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('T')[0].split('-');
  return `${d}/${m}/${y}`;
}

function fmtDateShort(iso) {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

// ---- Journal JSON (matrice quotidienne) ----
router.get('/', (req, res) => {
  const { debut, fin } = req.query;
  if (!debut || !fin || !DATE_RE.test(debut) || !DATE_RE.test(fin)) {
    return res.status(400).json({ error: 'Paramètres debut et fin requis au format AAAA-MM-JJ.' });
  }
  if (fin < debut) return res.status(400).json({ error: 'La date de fin doit être postérieure ou égale à la date de début.' });

  res.json(computeStats(debut, fin));
});

// ---- Export PDF (matrice quotidienne, paysage) ----
router.get('/pdf', (req, res) => {
  const { debut, fin } = req.query;
  if (!debut || !fin || !DATE_RE.test(debut) || !DATE_RE.test(fin)) {
    return res.status(400).json({ error: 'Paramètres debut et fin requis au format AAAA-MM-JJ.' });
  }
  if (fin < debut) return res.status(400).json({ error: 'La date de fin doit être postérieure ou égale à la date de début.' });

  const { dates, employes, jours } = computeStats(debut, fin);

  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margins: { top: 50, bottom: 45, left: 30, right: 30 } });
  doc.registerFont('Garamond', path.join(__dirname, '..', 'fonts', 'EBGaramond.ttf'));
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="journal-statistiques-${debut}_${fin}.pdf"`);
  doc.pipe(res);

  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const L = doc.page.margins.left;
  const R = pageW - doc.page.margins.right;
  const W = R - L;

  const empColW = 130;
  const dateColW = 42;
  const totalColW = 46;
  const rowH = 17;
  const headerH = 24;
  const maxDates = Math.max(1, Math.floor((W - empColW - totalColW) / dateColW));
  const maxRows = Math.max(1, Math.floor((pageH - 100 - 128 - headerH) / rowH));

  const codeColor = { CA: '#0284c7', CE: '#059669', MA: '#e11d48', ABS: '#64748b' };
  const today = new Date();
  const stamp = `${today.getDate()}/${today.getMonth() + 1}/${today.getFullYear()}`;

  let pageNum = 0;

  const drawTitle = () => {
    doc.font('Garamond').fontSize(16).fillColor('#1f2937')
      .text('Amicale du Personnel de la Banque Centrale de Tunisie', L, 40, { align: 'center', width: W });
    doc.font('Garamond').fontSize(19).fillColor('#111827')
      .text('Journal de statistiques — Congés · Maladies · Absences', L, 66, { align: 'center', width: W });
    doc.moveTo(L, 86).lineTo(R, 86).strokeColor('#111827').lineWidth(1).stroke();
    doc.font('Helvetica').fontSize(10).fillColor('#374151');
    doc.text(`Période du ${fmtFR(debut)} au ${fmtFR(fin)}`, L, 94, { width: W / 2, lineBreak: false });
    doc.text(`Effectif : ${employes.length} employé(s)`, L + W / 2, 94, { width: W / 2, align: 'right', lineBreak: false });
  };

  const shortName = (e) => {
    const initials = e.prenom.split(/\s+/).filter(Boolean).map((w) => w[0].toUpperCase()).join('. ');
    return `${e.nom.toUpperCase()} ${initials}.`;
  };

  const totalJours = (id) => (jours[id] ? Object.values(jours[id]).reduce((s, c) => s + c.split('/').length, 0) : 0);

  const headerRow = (dc, y) => {
    doc.rect(L, y, empColW, headerH).fill('#1e293b');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8.5)
      .text('Employé', L, y + 8, { width: empColW, align: 'center', lineBreak: false });
    dc.forEach((iso, idx) => {
      const x = L + empColW + idx * dateColW;
      const we = isWeekend(iso);
      doc.rect(x, y, dateColW, headerH).fill(we ? '#475569' : '#1e293b');
      doc.fillColor(we ? '#e2e8f0' : '#ffffff').font('Helvetica-Bold').fontSize(7)
        .text(fmtDateShort(iso), x, y + 4, { width: dateColW, align: 'center', lineBreak: false });
    });
    const tx = L + empColW + dc.length * dateColW;
    doc.rect(tx, y, totalColW, headerH).fill('#1e293b');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8.5)
      .text('Total', tx, y + 8, { width: totalColW, align: 'center', lineBreak: false });
    return y + headerH;
  };

  const empRow = (e, dc, y) => {
    doc.rect(L, y, empColW, rowH).fill('#e2e8f0');
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(7)
      .text(shortName(e), L + 2, y + 2, { width: empColW - 4, align: 'center', lineBreak: false });
    doc.fillColor('#64748b').font('Helvetica').fontSize(6)
      .text(`M. ${e.matricule}`, L + 2, y + 10, { width: empColW - 4, align: 'center', lineBreak: false });
    dc.forEach((iso, idx) => {
      const x = L + empColW + idx * dateColW;
      const we = isWeekend(iso);
      doc.rect(x, y, dateColW, rowH).fill(we ? '#f8fafc' : '#ffffff');
      const code = jours[e.id] ? jours[e.id][iso] : null;
      if (code) {
        doc.fillColor(codeColor[code.split('/')[0]] || '#111827').font('Helvetica-Bold').fontSize(7)
          .text(code, x, y + 5, { width: dateColW, align: 'center', lineBreak: false });
      }
    });
    const tx = L + empColW + dc.length * dateColW;
    doc.rect(tx, y, totalColW, rowH).fill('#f1f5f9');
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8)
      .text(String(totalJours(e.id)), tx, y + 5, { width: totalColW, align: 'center', lineBreak: false });
    return y + rowH;
  };

  const totalsRow = (dc, y) => {
    const countDate = (iso) => employes.reduce((s, e) => s + (jours[e.id] && jours[e.id][iso] ? 1 : 0), 0);
    doc.rect(L, y, empColW, headerH).fill('#cbd5e1');
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(7.5)
      .text('Total employés', L, y + 8, { width: empColW, align: 'center', lineBreak: false });
    dc.forEach((iso, idx) => {
      const x = L + empColW + idx * dateColW;
      doc.rect(x, y, dateColW, headerH).fill('#cbd5e1');
      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8)
        .text(String(countDate(iso)), x, y + 6, { width: dateColW, align: 'center', lineBreak: false });
    });
    const tx = L + empColW + dc.length * dateColW;
    doc.rect(tx, y, totalColW, headerH).fill('#cbd5e1');
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8)
      .text(String(employes.reduce((s, e) => s + totalJours(e.id), 0)), tx, y + 6, { width: totalColW, align: 'center', lineBreak: false });
    return y + headerH;
  };

  const drawFooter = () => {
    doc.font('Helvetica').fontSize(8).fillColor('#94a3b8')
      .text(`Document généré le ${stamp} — page ${pageNum + 1} — Amicale du Personnel de la Banque Centrale de Tunisie`, L, pageH - 58, { align: 'center', width: W, lineBreak: false });
  };

  // Chunks horizontaux (dates) × blocs verticaux (employés)
  const dateChunks = [];
  for (let i = 0; i < dates.length; i += maxDates) dateChunks.push(dates.slice(i, i + maxDates));

  dateChunks.forEach((dc, di) => {
    const empBlocks = [];
    for (let i = 0; i < employes.length; i += maxRows) empBlocks.push(employes.slice(i, i + maxRows));

    empBlocks.forEach((eb, bi) => {
      if (di > 0 || bi > 0) {
        doc.addPage();
        pageNum += 1;
      }

      if (bi === 0) {
        drawTitle();
        doc.font('Helvetica').fontSize(8.5).fillColor('#64748b')
          .text(COLS.map((c) => `${c.abbr} = ${c.label}`).join('   ·   '), L, 108, { align: 'center', width: W });
        doc.font('Helvetica').fontSize(8).fillColor('#475569')
          .text(`Dates du ${fmtFR(dc[0])} au ${fmtFR(dc[dc.length - 1])}`, L, 118, { align: 'center', width: W });
        y = headerRow(dc, 128);
      } else {
        doc.font('Garamond').fontSize(12).fillColor('#111827')
          .text(`Journal de statistiques (suite) — ${shortName(eb[0])} à ${shortName(eb[eb.length - 1])}`, L, 40, { align: 'center', width: W });
        y = headerRow(dc, 56);
      }

      for (const e of eb) {
        if (y + rowH > pageH - 100) {
          doc.addPage();
          pageNum += 1;
          doc.font('Garamond').fontSize(12).fillColor('#111827')
            .text(`Journal de statistiques (suite) — ${shortName(eb[0])} à ${shortName(eb[eb.length - 1])}`, L, 40, { align: 'center', width: W });
          y = headerRow(dc, 56);
        }
        y = empRow(e, dc, y);
      }

      if (bi === empBlocks.length - 1) y = totalsRow(dc, y);
      drawFooter();
    });
  });

  doc.end();
});

module.exports = router;
module.exports.computeStats = computeStats;
module.exports.nbJours = nbJours;
