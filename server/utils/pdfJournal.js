const path = require('path');
const PDFDocument = require('pdfkit');
const { db } = require('../db');
const { loadContext, estOuvrable, reposFor } = require('./jourOuvrable');

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

function chunk(arr, size) {
  if (!arr.length) return [[]];
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Matrice « journal » (dates en colonnes, employés en lignes) — utilisée par le Journal de présence
// et le Journal RMA. `orientation` = 'landscape' (défaut, tout sur une page si la période le permet)
// ou 'portrait' : les dates sont alors découpées en blocs lisibles répétés page par page.
function buildPdf({ res, debut, fin, dates, employes, jours, joursDemi, totaux, titre, orientation = 'landscape' }) {
  const paysage = orientation === 'landscape';
  const codesMeta = codesPaie();
  const codeColor = {};
  for (const [code, meta] of Object.entries(codesMeta)) codeColor[code] = meta.couleur || '#111827';
  const legendTxt = Object.keys((totaux || {}).par_code || {}).sort().map((c) => `${c} = ${(codesMeta[c] || {}).libelle || c}`).join(' · ') || 'Aucune codification sur la période';

  const doc = new PDFDocument({
    size: 'A4',
    layout: paysage ? 'landscape' : 'portrait',
    margins: { top: 18, bottom: 10, left: 11, right: 11 },
  });
  doc.registerFont('Garamond', path.join(__dirname, '..', 'fonts', 'EBGaramond.ttf'));
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${titre.toLowerCase().replace(/ /g, '-')}-${debut}_${fin}.pdf"`);
  doc.pipe(res);

  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const L = doc.page.margins.left;
  const R = pageW - doc.page.margins.right;
  const W = R - L;

  const matColW = paysage ? 30 : 26;
  const empColW = paysage ? 74 : 68;
  const totalColW = paysage ? 26 : 24;
  const fixed = matColW + empColW + totalColW;
  const minDateCol = paysage ? 12 : 11;
  const maxPerBlock = Math.max(1, Math.floor((W - fixed) / minDateCol));
  const blocks = chunk(dates, paysage ? Math.max(maxPerBlock, dates.length || 1) : maxPerBlock);

  // Réduit pour densifier : +6 lignes/page, évite 3/4 vide après matr. 260 / 354
  const rowH = paysage ? 7.5 : 8;
  const headerH = 10;

  // Colonne de dates : largeur recalculée à chaque bloc (responsive portrait/paysage).
  let dateColW = 14;
  let dateFontSize = 5;
  let codeFontSize = 5;

  const shortName = (e) => `${e.nom} ${e.prenom}`;

  // Jours de travail PAR CATÉGORIE : le repos hebdomadaire (ex. samedi travaillé de Femme de
  // ménage) est pris en compte pour les totaux par employé et par date.
  const ctxPdf = loadContext();
  const catByEmp = {};
  for (const e of db.prepare('SELECT id, categorie_id FROM employes WHERE actif = 1').all()) catByEmp[e.id] = e.categorie_id;
  const legalRowsPdf = db.prepare("SELECT date, heures, source, label FROM jours_travail WHERE date >= ? AND date <= ?").all(debut, fin);
  const legalByDatePdf = {};
  for (const r of legalRowsPdf) legalByDatePdf[r.date] = r;
  const hasCalPdf = legalRowsPdf.length > 0;
  const isOuvPdf = (empId, iso) => hasCalPdf
    ? estOuvrable(ctxPdf, catByEmp[empId], iso, legalByDatePdf[iso])
    : !reposFor(catByEmp[empId]).has(new Date(iso + 'T00:00:00').getDay());

  // Total d'un employé sur un sous-ensemble de dates (bloc en portrait, période entière en paysage).
  const sumJours = (id, dc) => {
    if (!jours[id]) return 0;
    let s = 0;
    for (const iso of dc) {
      if (!isOuvPdf(id, iso)) continue;
      const cell = jours[id][iso];
      if (!cell) continue;
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

  const drawSuiteBand = () => {
    doc.rect(0, 0, pageW, 16).fill('#1e3a5f');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7.5)
      .text(`${titre} — Période : ${fmtFR(debut)} → ${fmtFR(fin)} (suite)`, L, 4.5, { width: W, align: 'center', lineBreak: false });
    return 20;
  };

  const drawBlockLabel = (dc, y0) => {
    const label = blocks.length > 1 ? `Dates : ${fmtDateShort(dc[0])} → ${fmtDateShort(dc[dc.length - 1])} (${dc.length} jour(s))` : '';
    if (!label) return y0;
    doc.font('Helvetica-Bold').fontSize(7).fillColor('#1e3a5f').text(label, L, y0, { width: W, align: 'left', lineBreak: false });
    return y0 + 10;
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
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(6).text(String(sumJours(e.id, dc)), x, y + 2.5, { width: totalColW, align: 'center' });
    return y + rowH;
  };

  const totalsRow = (dc, y) => {
    const countDate = (iso) => {
      let s = 0;
      for (const e of employes) {
        if (!isOuvPdf(e.id, iso)) continue;
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
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(6).text(String(dc.reduce((s, iso) => s + countDate(iso), 0)), x, y + 3.5, { width: totalColW, align: 'center' });
    return y + headerH;
  };

  const bottomLimit = pageH - doc.page.margins.bottom;

  blocks.forEach((dc, bi) => {
    // Largeur de colonne de dates recalculée pour ce bloc (le portrait découpe la période).
    dateColW = Math.max(minDateCol, (W - fixed) / Math.max(1, dc.length));
    dateFontSize = Math.min(5.5, Math.max(3.4, dateColW / 4.7));
    codeFontSize = Math.min(5.5, Math.max(3.2, dateColW / 4.3));

    let y;
    if (bi === 0) {
      y = drawHeaderBlock(14);
    } else {
      doc.addPage();
      y = drawSuiteBand();
    }
    y = drawBlockLabel(dc, y);
    y = headerRow(dc, y);

    const ensureFit = (need) => {
      if (y + need > bottomLimit) {
        doc.addPage();
        y = drawSuiteBand();
        y = drawBlockLabel(dc, y);
        y = headerRow(dc, y);
      }
    };

    for (const e of employes) {
      ensureFit(rowH);
      y = empRow(e, dc, y);
    }
    ensureFit(headerH);
    y = totalsRow(dc, y);
  });

  doc.end();
}

module.exports = { buildPdf, codesPaie: codesPaie };
