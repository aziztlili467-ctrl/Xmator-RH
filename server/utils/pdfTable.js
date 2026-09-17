const path = require('path');
const PDFDocument = require('pdfkit');
const { drawPDFBrandFooter } = require('./pdfBranding');

const LOGO = path.join(__dirname, '..', 'photos-reference', 'photos', 'XMATOR RH-logo.png');
const BRAND = 'XMator-RH';
const NAVY = '#1e3a5f';

function fmtFR(v) {
  if (!v) return '';
  const [y, m, d] = String(v).split('T')[0].split('-');
  if (!y || !m || !d) return String(v);
  return `${d}/${m}/${y}`;
}

function fmtDateTimeFR(v) {
  if (!v) return '';
  const s = String(v).replace('T', ' ').slice(0, 16);
  const [date, heure] = s.split(' ');
  return `${fmtFR(date)} ${heure || ''}`.trim();
}

// Générateur de PDF « journal » : liste tabulaire paginée, en-tête/pied de page XMator-RH,
// enroulement automatique des cellules et mise en page adaptée au format portrait OU paysage.
//
// columns : [{ label, key, weight, align, bold, size, format(row) -> string }]
// rows    : tableau de données
// kpis    : [{ label, value, unit, color }] (facultatif, 1 à 4 indicateurs)
// orientation : 'portrait' | 'landscape'
function buildListePdf(opts) {
  const {
    res,
    orientation = 'portrait',
    titre = 'Journal',
    sousTitre = '',
    refLigne = '',
    columns = [],
    rows = [],
    filename = 'journal.pdf',
    kpis = [],
    emptyText = 'Aucune ligne ne correspond aux filtres appliqués.',
    fontSize = 7.5,
  } = opts;

  const paysage = orientation === 'landscape';
  const doc = new PDFDocument({
    size: 'A4',
    layout: paysage ? 'landscape' : 'portrait',
    margins: { top: 12, bottom: 22, left: 16, right: 16 },
  });
  doc.registerFont('Garamond', path.join(__dirname, '..', 'fonts', 'EBGaramond.ttf'));

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);

  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const L = doc.page.margins.left;
  const R = pageW - doc.page.margins.right;
  const W = R - L;
  const bottomLimit = pageH - doc.page.margins.bottom - 6;

  // ── Répartition des colonnes (proportionnelle au poids, min garanti) ──────────
  const weights = columns.map((c) => (Number(c.weight) > 0 ? Number(c.weight) : 1));
  const totalWeight = weights.reduce((s, w) => s + w, 0) || 1;
  let widths = weights.map((w) => (w / totalWeight) * W);
  const MIN_COL = paysage ? 34 : 28;
  // Redistribue l'espace des colonnes sous le minimum vers les autres colonnes.
  const unders = widths.map((w) => w < MIN_COL);
  if (unders.some(Boolean)) {
    const deficit = widths.reduce((s, w, i) => s + (unders[i] ? MIN_COL - w : 0), 0);
    const pool = widths.reduce((s, w, i) => s + (unders[i] ? 0 : w), 0) || 1;
    widths = widths.map((w, i) => (unders[i] ? MIN_COL : w - deficit * (w / pool)));
  }
  const colX = [];
  let acc = L;
  for (const w of widths) { colX.push(acc); acc += w; }

  const cellPadX = paysage ? 5 : 4;
  const cellPadY = 4;
  const headerH = 16;

  const fontOf = (c) => (c.bold ? 'Helvetica-Bold' : 'Helvetica');
  const sizeOf = (c) => Number(c.size) || fontSize;
  const txtOf = (c, row) => {
    const v = c.format ? c.format(row) : row[c.key];
    return v == null ? '' : String(v);
  };

  const drawBand = () => {
    doc.rect(0, 0, pageW, 58).fill(NAVY);
    try { doc.image(LOGO, L + 2, 8, { height: 26 }); } catch (_) { /* logo indisponible */ }
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#ffffff')
      .text(BRAND, L + 34, 13, { width: 220, align: 'left', lineBreak: false });
    doc.font('Helvetica').fontSize(7.5).fillColor('#cbd5e1')
      .text('Gestion des Ressources Humaines', L + 34, 29, { width: 260, align: 'left', lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(paysage ? 14 : 12.5).fillColor('#ffffff')
      .text(titre, L + 34, 44, { width: W - 260, align: 'left', lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#93c5fd')
      .text(`Format ${paysage ? 'paysage' : 'portrait'} · ${rows.length} ligne(s)`, R - 220, 14, { width: 220, align: 'right', lineBreak: false });
    doc.font('Helvetica').fontSize(8).fillColor('#cbd5e1')
      .text(refLigne, R - 260, 27, { width: 260, align: 'right', lineBreak: false });
    doc.rect(0, 58, pageW, 3).fill('#3b82f6');
    return 73;
  };

  let y = drawBand();

  // ── Barre d'information (sous-titre / filtres) ───────────────────────────────
  if (sousTitre) {
    const infoH = 14;
    doc.rect(L, y, W, infoH).fillAndStroke('#f1f5f9', '#cbd5e1').lineWidth(0.6);
    doc.fillColor('#475569').font('Helvetica').fontSize(7)
      .text(sousTitre, L + 8, y + 3.5, { width: W - 16, align: 'left', lineBreak: false });
    y += infoH + (kpis.length ? 12 : 14);
  }

  // ── Indicateurs (facultatif) ─────────────────────────────────────────────────
  if (kpis.length) {
    const gap = 10;
    const kw = (W - gap * (kpis.length - 1)) / kpis.length;
    const kh = 42;
    kpis.forEach((k, i) => {
      const x = L + i * (kw + gap);
      doc.rect(x, y, kw, 6).fill(k.color || '#1e3a5f');
      doc.rect(x, y, kw, kh).fillAndStroke('#ffffff', '#e2e8f0').lineWidth(0.8);
      doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(6.5)
        .text(String(k.label || '').toUpperCase(), x + 8, y + 11, { width: kw - 16, align: 'left', lineBreak: false });
      doc.fillColor(k.color || '#1e3a5f').font('Helvetica-Bold').fontSize(14)
        .text(String(k.value == null ? '—' : k.value), x + 8, y + 19, { width: kw - 16, align: 'left', lineBreak: false });
      if (k.unit) {
        doc.fillColor('#94a3b8').font('Helvetica').fontSize(6.5)
          .text(k.unit, x + 8, y + 29, { width: kw - 16, align: 'left', lineBreak: false });
      }
    });
    y += kh + 12;
  }

  const drawSuiteBand = () => {
    doc.rect(0, 0, pageW, 16).fill(NAVY);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7.5)
      .text(`${titre} (suite)`, L, 4.5, { width: W, align: 'center', lineBreak: false });
    return 24;
  };

  const drawTableHeader = (yy) => {
    doc.rect(L, yy, W, headerH).fill(NAVY);
    columns.forEach((c, i) => {
      const x = colX[i] + (c.align === 'right' || c.align === 'center' ? 0 : cellPadX);
      const w = widths[i] - (c.align === 'right' || c.align === 'center' ? 2 * cellPadX : 2 * cellPadX);
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7)
        .text(String(c.label || ''), x, yy + 5, { width: Math.max(8, w), align: c.align || 'left', lineBreak: false });
    });
    return yy + headerH;
  };

  const rowHeight = (row) => {
    let h = 0;
    columns.forEach((c, i) => {
      doc.font(fontOf(c)).fontSize(sizeOf(c));
      const th = doc.heightOfString(txtOf(c, row) || ' ', { width: Math.max(8, widths[i] - 2 * cellPadX), align: c.align || 'left' });
      h = Math.max(h, th);
    });
    return Math.max(13, h + 2 * cellPadY);
  };

  const drawRow = (row, yy, idx) => {
    const h = rowHeight(row);
    doc.rect(L, yy, W, h).fillAndStroke(idx % 2 === 0 ? '#ffffff' : '#f8fafc', '#e2e8f0').lineWidth(0.5);
    columns.forEach((c, i) => {
      const x = colX[i] + (c.align === 'right' || c.align === 'center' ? cellPadX : cellPadX);
      const w = Math.max(8, widths[i] - 2 * cellPadX);
      doc.fillColor(c.color || '#334155').font(fontOf(c)).fontSize(sizeOf(c))
        .text(txtOf(c, row), x, yy + cellPadY, { width: w, align: c.align || 'left' });
    });
    return yy + h;
  };

  y = drawTableHeader(y);

  if (!rows.length) {
    doc.rect(L, y, W, 16).fillAndStroke('#ffffff', '#e2e8f0').lineWidth(0.5);
    doc.fillColor('#94a3b8').font('Helvetica').fontSize(7.5)
      .text(emptyText, L, y + 4.5, { width: W, align: 'center' });
    y += 16;
  } else {
    for (let i = 0; i < rows.length; i += 1) {
      const h = rowHeight(rows[i]);
      if (y + h > bottomLimit) {
        doc.addPage();
        y = drawSuiteBand();
        y = drawTableHeader(y);
      }
      y = drawRow(rows[i], y, i);
    }
  }

  drawPDFBrandFooter(doc);
  doc.end();
}

module.exports = { buildListePdf, fmtFR, fmtDateTimeFR };
