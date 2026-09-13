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

  // PDFKit, dans son wrapper de texte, vérifie `document.y + currentLineHeight > maxY`
  // avant de placer CHAQUE ligne du contenu (y compris la seule ligne du pied de page).
  // Il faut donc que la position résultante de la ligne précédente, PLUS la hauteur de ligne,
  // reste inférieure à la limite (page.maxY() = hauteur de page − marge basse) : on positionne
  // le texte à `maxY − 2 × lineHeight − marge`, ce qui évite tout passage sur une page blanche
  // supplémentaire en fin de document.
  const bottomLimit = pageH - doc.page.margins.bottom;
  let lineH = 10;
  try {
    const lh = doc.currentLineHeight && doc.currentLineHeight(true);
    if (Number.isFinite(lh) && lh > 0) lineH = lh;
  } catch (_) { /* ignore */ }
  // PDFKit, dans son wrapper de texte, vérifie `document.y + currentLineHeight > maxY`
  // avant de placer CHAQUE ligne du contenu (y compris la seule ligne du pied de page).
  // On positionne donc le texte à `maxY − 2 × lineHeight − marge` pour qu'aucun passage
  // (ligne résultante + hauteur de ligne suivante) ne dépasse la limite d'impression.
  const rowY = Math.max(0, bottomLimit - 2 * lineH - 4);
  const ruleY = rowY - 3;

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
