const path = require('path');
const PDFDocument = require('pdfkit');
const { db } = require('../db');

function fmtFR(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('T')[0].split('-');
  return `${d}/${m}/${y}`;
}
function fmtDateShort(iso) {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}
function isWeekend(iso) {
  const wd = new Date(iso + 'T00:00:00').getDay();
  return wd === 0 || wd === 6;
}
function codesPaie() {
  const map = {};
  for (const c of db.prepare('SELECT code, libelle, couleur FROM codes_paie ORDER BY code').all()) map[c.code] = { libelle: c.libelle, couleur: c.couleur };
  return map;
}

function buildPdf({ res, debut, fin, dates, employes, jours, joursDemi, totaux, titre }) {
  const codesMeta = codesPaie();
  const codeColor = {};
  for (const [code, meta] of Object.entries(codesMeta)) codeColor[code] = meta.couleur || '#111827';
  const legendTxt = Object.keys((totaux || {}).par_code || {}).sort().map((c) => `${c} = ${(codesMeta[c] || {}).libelle || c}`).join(' · ') || 'Aucune codification sur la période';

  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margins: { top: 18, bottom: 10, left: 11, right: 11 } });
  doc.registerFont('Garamond', path.join(__dirname, '..', 'fonts', 'EBGaramond.ttf'));
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${titre.toLowerCase().replace(/ /g, '-')}-${debut}_${fin}.pdf"`);
  doc.pipe(res);

  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const L = doc.page.margins.left;
  const R = pageW - doc.page.margins.right;
  const W = R - L;

  const matColW = 30;
  const empColW = 74;
  const totalColW = 26;
  const datesW = W - matColW - empColW - totalColW;
  const dateColW = Math.max(12, datesW / Math.max(1, dates.length));
  // Réduit pour densifier : +6 lignes/page, évite 3/4 vide après matr. 260 / 354
  const rowH = 7.5;
  const headerH = 10;

  const dateFontSize = Math.min(5.5, Math.max(4, dateColW / 4.7));
  const codeFontSize = Math.min(5.5, Math.max(4, dateColW / 4.3));

  const shortName = (e) => `${e.nom} ${e.prenom}`;

  const legalMapPdf = {};
  for (const r of db.prepare("SELECT date, heures FROM jours_travail WHERE date >= ? AND date <= ?").all(debut, fin)) legalMapPdf[r.date] = Number(r.heures) || 0;
  const hasCalPdf = Object.keys(legalMapPdf).length > 0;
  const isOuvPdf = (iso) => hasCalPdf ? (legalMapPdf[iso] || 0) > 0 : (new Date(iso + 'T00:00:00').getDay() !== 0 && new Date(iso + 'T00:00:00').getDay() !== 6);
  const totalJours = (id) => {
    if (!jours[id]) return 0;
    let s = 0;
    for (const [iso, cell] of Object.entries(jours[id])) {
      if (!isOuvPdf(iso)) continue;
      for (const c of String(cell).split('/')) {
        if ((c === 'CA' && joursDemi && joursDemi[id] && joursDemi[id][iso]) || c === 'DJ') s += 0.5; else s += 1;
      }
    }
    return Math.round(s * 2) / 2;
  };

  const drawHeaderBlock = (y0) => {
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text(`${titre} — Période : ${fmtFR(debut)} → ${fmtFR(fin)}`, L, y0, { width: W, align: 'left' });
    doc.font('Helvetica').fontSize(7).fillColor('#555555').text(`${legendTxt} — Total : ${totaux.total || 0} jours`, L, y0 + 11, { width: W, align: 'left' });
    return y0 + 16;
  };

  const headerRow = (dc, y) => {
    const h = headerH;
    let x = L;
    doc.rect(x, y, matColW, h).fillAndStroke('#eef2f7', '#888888'); doc.lineWidth(0.4);
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(6).text('Mat.', x, y + 3.5, { width: matColW, align: 'center' });
    x += matColW;
    doc.rect(x, y, empColW, h).fillAndStroke('#eef2f7', '#888888');
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(6).text('Nom / Prénom', x, y + 3.5, { width: empColW, align: 'center' });
    x += empColW;
    dc.forEach((iso) => {
      const we = isWeekend(iso);
      doc.rect(x, y, dateColW, h).fillAndStroke(we ? '#e2e8f0' : '#eef2f7', '#888888');
      doc.fillColor('#111827').font('Helvetica-Bold').fontSize(dateFontSize).text(fmtDateShort(iso), x, y + 3.5, { width: dateColW, align: 'center' });
      x += dateColW;
    });
    doc.rect(x, y, totalColW, h).fillAndStroke('#eef2f7', '#888888');
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(6).text('Tot.', x, y + 3.5, { width: totalColW, align: 'center' });
    return y + h;
  };

  const empRow = (e, dc, y) => {
    let x = L;
    doc.rect(x, y, matColW, rowH).strokeColor('#888888').lineWidth(0.4).stroke();
    doc.fillColor('#111827').font('Helvetica').fontSize(5.5).text(e.matricule, x, y + 2.5, { width: matColW, align: 'center' });
    x += matColW;
    doc.rect(x, y, empColW, rowH).strokeColor('#888888').lineWidth(0.4).stroke();
    doc.fillColor('#111827').font('Helvetica').fontSize(5.5).text(shortName(e), x + 1, y + 2.5, { width: empColW - 2, align: 'left' });
    x += empColW;
    dc.forEach((iso) => {
      doc.rect(x, y, dateColW, rowH).strokeColor('#888888').lineWidth(0.4).stroke();
      const code = jours[e.id] ? jours[e.id][iso] : null;
      if (code) {
        const isDemiCA = joursDemi && joursDemi[e.id] && joursDemi[e.id][iso];
        const premier = code.split('/')[0];
        const vivid = codeColor[premier] || '#111827';
        const col = isDemiCA ? '#000000' : vivid;
        doc.fillColor(col).font('Helvetica-Bold').fontSize(codeFontSize).text(code, x, y + 2.5, { width: dateColW, align: 'center' });
      }
      x += dateColW;
    });
    doc.rect(x, y, totalColW, rowH).strokeColor('#888888').lineWidth(0.4).stroke();
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(6).text(String(totalJours(e.id)), x, y + 2.5, { width: totalColW, align: 'center' });
    return y + rowH;
  };

  const totalsRow = (dc, y) => {
    const countDate = (iso) => {
      if (!isOuvPdf(iso)) return 0;
      let s = 0;
      for (const e of employes) {
        const cell = jours[e.id] ? jours[e.id][iso] : null;
        if (!cell) continue;
        for (const c of String(cell).split('/')) {
          if (c === 'CA' && joursDemi && joursDemi[e.id] && joursDemi[e.id][iso]) s += 0.5; else s += 1;
        }
      }
      return Math.round(s * 2) / 2;
    };
    let x = L;
    doc.rect(x, y, matColW + empColW, headerH).fillAndStroke('#f8fafc', '#333333');
    doc.lineWidth(0.8);
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(6).text('Total employés', x, y + 3.5, { width: matColW + empColW, align: 'center' });
    x += matColW + empColW;
    dc.forEach((iso) => {
      doc.rect(x, y, dateColW, headerH).fillAndStroke('#f8fafc', '#333333');
      doc.fillColor('#111827').font('Helvetica-Bold').fontSize(dateFontSize).text(String(countDate(iso)), x, y + 3.5, { width: dateColW, align: 'center' });
      x += dateColW;
    });
    doc.rect(x, y, totalColW, headerH).fillAndStroke('#f8fafc', '#333333');
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(6).text(String(employes.reduce((s, e) => s + totalJours(e.id), 0)), x, y + 3.5, { width: totalColW, align: 'center' });
    return y + headerH;
  };

  const dc = dates;

  let y;
  const bottomLimit = pageH - doc.page.margins.bottom;
  const ensureFit = (need) => {
    if (y + need > bottomLimit) {
      doc.addPage();
      // En-tête allégé sur pages suivantes pour maximiser le remplissage
      doc.font('Helvetica-Bold').fontSize(7).fillColor('#111827').text(`${titre} (suite)`, L, 14, { width: W, align: 'center' });
      y = headerRow(dc, 22);
    }
  };

  employes.forEach((e, idx) => {
    if (idx === 0) {
      y = drawHeaderBlock(14);
      y = headerRow(dc, y);
    }
    ensureFit(rowH);
    y = empRow(e, dc, y);
  });
  ensureFit(headerH);
  y = totalsRow(dc, y);

  doc.end();
}

module.exports = { buildPdf, codesPaie: codesPaie };
