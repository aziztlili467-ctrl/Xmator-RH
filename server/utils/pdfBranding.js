const path = require('path');

const LOGO_PATH = path.join(__dirname, '..', 'photos-reference', 'photos', 'XMATOR RH-logo.png');
const BRAND = 'XMator-RH';

function drawPDFBrandHeader(doc, opts = {}) {
  const L = doc.page.margins.left;
  const R = doc.page.width - doc.page.margins.right;
  const top = opts.top ?? 10;
  const logoH = opts.logoH ?? 11;
  const gap = 4;
  const nameSize = opts.nameSize ?? 8;

  try {
    doc.image(LOGO_PATH, L, top, { height: logoH });
  } catch (_) {
    /* logo indisponible : on continue sans image */
  }

  const nameX = L + logoH + gap;
  doc.font('Helvetica-Bold').fontSize(nameSize).fillColor('#0f172a')
    .text(BRAND, nameX, top + logoH / 2 - nameSize * 0.6, { width: doc.widthOfString(BRAND, { size: nameSize }), align: 'left', lineBreak: false });

  if (opts.title) {
    doc.font('Helvetica-Bold').fontSize(opts.titleSize ?? 9).fillColor('#111827')
      .text(opts.title, L, top + logoH + 4, { width: R - L, align: 'center', lineBreak: false });
  }
  return top + logoH + (opts.title ? 14 : 6);
}

function drawPDFBrandFooter(doc, opts = {}) {
  const pageH = doc.page.height;
  const pageW = doc.page.width;
  const marginLeft = doc.page.margins.left;
  const marginRight = doc.page.margins.right;
  const bottom = opts.bottom ?? 8;
  const L = marginLeft;
  const R = pageW - marginRight;
  const logoH = opts.logoH ?? 9;
  const gap = 4;
  const nameSize = opts.nameSize ?? 7.5;

  // Placer la ligne au-dessus du bloc logo+nom, tout en bas de page
  const blockH = logoH + 2;
  const ruleY = pageH - bottom - 6 - blockH;
  const rowY = ruleY + 3;

  // Ligne horizontale (pleine largeur du contenu)
  doc.lineWidth(opts.ruleWidth ?? 0.8).strokeColor(opts.ruleColor ?? '#cbd5e1')
    .moveTo(L, ruleY).lineTo(R, ruleY).stroke();

  // Logo + "XMator-RH" ALIGNÉS À GAUCHE, sous la ligne
  try {
    doc.image(LOGO_PATH, L, rowY, { height: logoH });
  } catch (_) { /* logo indisponible : on continue sans image */ }

  doc.font('Helvetica-Bold').fontSize(nameSize).fillColor(opts.nameColor ?? '#0f172a')
    .text(BRAND, L + logoH + gap, rowY + logoH / 2 - nameSize * 0.6, { width: doc.widthOfString(BRAND, { size: nameSize }), align: 'left', lineBreak: false });
}

module.exports = { drawPDFBrandHeader, drawPDFBrandFooter, BRAND, LOGO_PATH };
