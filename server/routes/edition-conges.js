const { Router } = require('express');
const path = require('path');
const PDFDocument = require('pdfkit');
const { db, soldeCongeRestantDate } = require('../db');
const { drawPDFBrandFooter } = require('../utils/pdfBranding');

const router = Router();
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function fmtFR(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('T')[0].split('-');
  return `${d}/${m}/${y}`;
}
function fmtJours(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  const s = v.toFixed(1);
  return s.endsWith('.0') ? s.slice(0, -2) : s.replace('.', ',');
}

// ─── GET /  (JSON) ───────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const { employe, categorie, debut, fin, search } = req.query;
  let sql = `
    SELECT e.id AS employe_id, e.matricule, e.nom, e.prenom,
           c.libelle AS categorie, e.departement
    FROM employes e
    LEFT JOIN categories c ON c.id = e.categorie_id
    WHERE 1=1
  `;
  const params = [];
  if (employe) { sql += ' AND e.id = ?'; params.push(Number(employe)); }
  if (categorie) { sql += ' AND e.categorie_id = ?'; params.push(Number(categorie)); }
  if (search) {
    sql += ' AND (e.matricule LIKE ? OR e.nom LIKE ? OR e.prenom LIKE ?)';
    const p = `%${search}%`;
    params.push(p, p, p);
  }
  sql += ' ORDER BY e.matricule ASC, e.nom ASC';
  const employes = db.prepare(sql).all(...params);
  const dateRef = (fin && DATE_RE.test(fin)) ? fin : new Date().toISOString().slice(0, 10);
  const result = employes.map((e) => ({
    employe_id: e.employe_id,
    matricule: e.matricule,
    nom: e.nom,
    prenom: e.prenom,
    categorie: e.categorie,
    departement: e.departement,
    solde_conge: soldeCongeRestantDate(e.employe_id, dateRef),
  }));
  res.json({ date_ref: dateRef, employes: result });
});

// ─── Helpers requête commune (filtres) ────────────────────────────────────────
function buildList(req) {
  const { employe, categorie, debut, fin, search } = req.query;
  let sql = `
    SELECT e.id AS employe_id, e.matricule, e.nom, e.prenom,
           c.libelle AS categorie, e.departement
    FROM employes e
    LEFT JOIN categories c ON c.id = e.categorie_id
    WHERE 1=1
  `;
  const params = [];
  if (employe) { sql += ' AND e.id = ?'; params.push(Number(employe)); }
  if (categorie) { sql += ' AND e.categorie_id = ?'; params.push(Number(categorie)); }
  if (search) {
    sql += ' AND (e.matricule LIKE ? OR e.nom LIKE ? OR e.prenom LIKE ?)';
    const p = `%${search}%`;
    params.push(p, p, p);
  }
  sql += ' ORDER BY e.matricule ASC, e.nom ASC';
  const employes = db.prepare(sql).all(...params);
  const dateRef = (fin && DATE_RE.test(fin)) ? fin : new Date().toISOString().slice(0, 10);
  return {
    dateRef,
    data: employes.map((e) => ({
      matricule: e.matricule,
      nom: e.nom,
      prenom: e.prenom,
      categorie: e.categorie || '—',
      departement: e.departement || '—',
      solde: soldeCongeRestantDate(e.employe_id, dateRef),
    })),
  };
}

// ─── GET /pdf  (PDF imprimable — maquette cabinet GRH) ──────────────────────
router.get('/pdf', (req, res) => {
  const { dateRef, data } = buildList(req);
  const titre = 'Journal des Congés';
  const doc = new PDFDocument({
    size: 'A4',
    layout: 'portrait',
    margins: { top: 12, bottom: 20, left: 16, right: 16 },
  });
  doc.registerFont('Garamond', path.join(__dirname, '..', 'fonts', 'EBGaramond.ttf'));

  const filename = `journal-conges_${dateRef}.pdf`.toLowerCase().replace(/ /g, '-');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);

  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const L = doc.page.margins.left;
  const R = pageW - doc.page.margins.right;
  const W = R - L;
  const LOGO = path.join(__dirname, '..', 'photos-reference', 'photos', 'XMATOR RH-logo.png');

  // ══════════════════════════════════════════════════════════════════════════════
  // Bandeau d'en-tête (pleine largeur navy) — logo + titre + référence + date
  // ══════════════════════════════════════════════════════════════════════════════
  const BAND_H = 58;
  doc.rect(0, 0, pageW, BAND_H).fill('#1e3a5f');
  try {
    doc.image(LOGO, L + 2, 8, { height: 26 });
  } catch (_) { /* logo indisponible */ }
  doc.font('Helvetica-Bold').fontSize(14).fillColor('#ffffff')
    .text('XMator-RH', L + 34, 13, { width: 200, align: 'left', lineBreak: false });
  doc.font('Helvetica').fontSize(7.5).fillColor('#cbd5e1')
    .text('Gestion des Ressources Humaines', L + 34, 29, { width: 200, align: 'left', lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#ffffff')
    .text(titre, L + 34, 45, { width: 220, align: 'left', lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#93c5fd')
    .text(`Réf. ${titre}`, R - 250, 14, { width: 250, align: 'right', lineBreak: false });
  doc.font('Helvetica').fontSize(8).fillColor('#cbd5e1')
    .text(`Réf. ${fmtFR(dateRef)} · Édité le ${fmtFR(new Date().toISOString().slice(0, 10))} à ${new Date().toTimeString().slice(0, 5)}`, R - 250, 27, { width: 250, align: 'right', lineBreak: false });
  doc.rect(0, BAND_H, pageW, 3).fill('#3b82f6');

  let y = BAND_H + 3 + 12;

  // ══════════════════════════════════════════════════════════════════════════════
  // Carte de filtres appliqués
  // ══════════════════════════════════════════════════════════════════════════════
  const filterH = 14;
  doc.rect(L, y, W, filterH).fillAndStroke('#f1f5f9', '#cbd5e1').lineWidth(0.6);
  doc.fillColor('#475569').font('Helvetica').fontSize(7).text(
    `Filtre — ${data.length} employé(s) · Solde de référence au ${fmtFR(dateRef)}`,
    L + 8, y + 3.5, { width: W - 16, align: 'left', lineBreak: false }
  );
  y += filterH + 12;

  // ══════════════════════════════════════════════════════════════════════════════
  // 4 indicateurs (pastels GRH)
  // ══════════════════════════════════════════════════════════════════════════════
  const totalSolde = data.reduce((s, e) => s + e.solde, 0);
  const avgSolde   = data.length ? totalSolde / data.length : 0;
  const soldeNul   = data.filter((e) => e.solde <= 0).length;
  const maxSolde   = data.length ? Math.max(...data.map((e) => e.solde)) : 0;
  const statH = 44;
  const statGap = 10;
  const statW = (W - statGap * 3) / 4;
  const stats = [
    { label: 'Effectif', value: `${data.length}`, color: '#1e3a5f', unit: 'agent(s)' },
    { label: 'Solde moyen', value: fmtJours(avgSolde), color: '#3b82f6', unit: 'jours' },
    { label: 'Solde total', value: fmtJours(totalSolde), color: '#8b5cf6', unit: 'jours' },
    { label: 'Solde épuisé', value: `${soldeNul}`, color: '#dc2626', unit: 'agent(s)' },
  ];
  stats.forEach((s, i) => {
    const x = L + i * (statW + statGap);
    doc.rect(x, y, statW, 6).fill(s.color);
    doc.rect(x, y, statW, statH).fillAndStroke('#ffffff', '#e2e8f0').lineWidth(0.8);
    doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(6.5)
      .text(s.label.toUpperCase(), x + 8, y + 11, { width: statW - 16, align: 'left', lineBreak: false });
    doc.fillColor(s.color).font('Helvetica-Bold').fontSize(15)
      .text(s.value, x + 8, y + 19, { width: statW - 28, align: 'left', lineBreak: false });
    doc.fillColor('#94a3b8').font('Helvetica').fontSize(6.5)
      .text(s.unit, x + 8 + doc.widthOfString(s.value, { size: 15 }) + 4, y + 24, { width: 50, align: 'left', lineBreak: false });
  });
  y += statH + 16;

  // ══════════════════════════════════════════════════════════════════════════════
  // Tableau
  // ══════════════════════════════════════════════════════════════════════════════
  const colMat  = 50;
  const colNom  = 140;
  const colCat  = 110;
  const colDept = 100;
  const colSolde = W - colMat - colNom - colCat - colDept;
  const headerH = 18;
  const rowH    = 16;
  const bottomLimit = pageH - doc.page.margins.bottom - 4;

  const drawSuiteHeader = (yy) => {
    doc.rect(0, 0, pageW, 16).fill('#1e3a5f');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7.5)
      .text(`${titre} — solde au ${fmtFR(dateRef)} (suite)`, L, 4.5, { width: W, align: 'center', lineBreak: false });
    return yy;
  };

  const drawTableHeader = (yy) => {
    const cols = [
      { t: 'Mat.', c: colMat, a: 'center' },
      { t: 'Nom & Prénom', c: colNom, a: 'left' },
      { t: 'Catégorie', c: colCat, a: 'left' },
      { t: 'Département', c: colDept, a: 'left' },
      { t: 'Solde congé (j)', c: colSolde, a: 'center' },
    ];
    doc.rect(L, yy, W, headerH).fill('#1e3a5f');
    let x = L;
    for (const c of cols) {
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7)
        .text(c.t, c.a === 'left' ? x + 6 : x, yy + 5.5, { width: c.c - (c.a === 'left' ? 12 : 0), align: c.a });
      x += c.c;
    }
    return yy + headerH;
  };

  const truncated = (str, maxW, font, size) => {
    let t = String(str || '—');
    doc.font(font).fontSize(size);
    if (doc.widthOfString(t) <= maxW) return t;
    while (t.length > 3 && doc.widthOfString(`${t}…`) > maxW) t = t.slice(0, -1);
    return `${t}…`;
  };

  const drawRow = (emp, yy, idx) => {
    const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
    doc.rect(L, yy, W, rowH).fillAndStroke(bg, '#e2e8f0').lineWidth(0.5);
    let x = L;
    doc.fillColor('#334155').font('Helvetica').fontSize(7.5).text(emp.matricule, x, yy + 4.5, { width: colMat, align: 'center' });
    x += colMat;
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(7.5)
      .text(truncated(`${emp.nom} ${emp.prenom}`, colNom - 12, 'Helvetica-Bold', 7.5), x + 6, yy + 4.5, { width: colNom - 12, align: 'left' });
    x += colNom;
    doc.fillColor('#475569').font('Helvetica').fontSize(7)
      .text(truncated(emp.categorie, colCat - 12, 'Helvetica', 7), x + 6, yy + 4.5, { width: colCat - 12, align: 'left' });
    x += colCat;
    doc.fillColor('#475569').font('Helvetica').fontSize(7)
      .text(truncated(emp.departement, colDept - 12, 'Helvetica', 7), x + 6, yy + 4.5, { width: colDept - 12, align: 'left' });
    x += colDept;
    const soldeColor = emp.solde <= 0 ? '#dc2626' : emp.solde <= 5 ? '#d97706' : '#059669';
    doc.fillColor(soldeColor).font('Helvetica-Bold').fontSize(8)
      .text(`${fmtJours(emp.solde)} j`, x, yy + 4, { width: colSolde, align: 'center' });
    return yy + rowH;
  };

  let pageRows = 0;
  const ensureFit = (need) => {
    if (y + need > bottomLimit) {
      doc.addPage();
      pageRows = 0;
      y = 20;
      y = drawSuiteHeader(y);
      y = drawTableHeader(y);
    }
  };

  y = drawTableHeader(y);
  if (!data.length) {
    doc.rect(L, y, W, rowH).fillAndStroke('#ffffff', '#e2e8f0').lineWidth(0.5);
    doc.fillColor('#94a3b8').font('Helvetica').fontSize(7.5)
      .text('Aucun employé ne correspond aux filtres appliqués.', L, y + 4.5, { width: W, align: 'center' });
    y += rowH;
  } else {
    for (const emp of data) {
      ensureFit(rowH);
      y = drawRow(emp, y, pageRows);
      pageRows += 1;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // Récapitulatif (jamais de page vide ajoutée)
  // ══════════════════════════════════════════════════════════════════════════════
  if (y + 30 <= bottomLimit) {
    y += 12;
    const boxH = 22;
    doc.roundedRect(L, y, W, boxH, 4).fillAndStroke('#f1f5f9', '#cbd5e1').lineWidth(0.6);
    doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(7.5).text(
      `Récapitulatif — ${data.length} agent(s) · Solde moyen : ${fmtJours(avgSolde)} j · Solde total : ${fmtJours(totalSolde)} j · Solde max : ${fmtJours(maxSolde)} j`,
      L + 10, y + 6, { width: W - 20, align: 'center', lineBreak: false }
    );
    doc.fillColor('#64748b').font('Helvetica').fontSize(6.5).text(
      `Soldes épuisés : ${soldeNul} agent(s) — Soldes inférieurs à 5 jours : ${data.filter((e) => e.solde > 0 && e.solde <= 5).length} agent(s)`,
      L + 10, y + 15, { width: W - 20, align: 'center', lineBreak: false }
    );
  }

  drawPDFBrandFooter(doc);
  doc.end();
});

// ─── GET /xls  (SpreadsheetML — Excel lisible) ───────────────────────────────
router.get('/xls', (req, res) => {
  const { dateRef, data } = buildList(req);

  const totalSolde = data.reduce((s, e) => s + e.solde, 0);
  const avgSolde   = data.length ? totalSolde / data.length : 0;
  const soldeNul   = data.filter((e) => e.solde <= 0).length;
  const maxSolde   = data.length ? Math.max(...data.map((e) => e.solde)) : 0;

  const cell = (val, h = '') => {
    const s = String(val ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return h
      ? `<Cell><Data ss:Type="${h}">${s}</Data></Cell>`
      : `<Cell><Data ss:Type="String">${s}</Data></Cell>`;
  };
  const numCell = (val) => cell(Number(val ?? 0), 'Number');

  const headers = ['Matricule', 'Nom', 'Prénom', 'Catégorie', 'Département', 'Solde congé (j)'];
  const hdrRow = `<Row>${headers.map((h) => cell(h)).join('')}</Row>`;
  const rows = data.map((e) =>
    `<Row>${cell(e.matricule)}${cell(e.nom)}${cell(e.prenom)}${cell(e.categorie)}${cell(e.departement)}${numCell(e.solde)}</Row>`
  ).join('');

  const filename = `journal-conges_${dateRef}.xls`.toLowerCase().replace(/ /g, '-');
  res.setHeader('Content-Type', 'application/vnd.ms-excel');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="h"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#1E3A5F" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center"/></Style>
    <Style ss:ID="nh"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#1E3A5F" ss:Pattern="Solid"/></Style>
    <Style ss:ID="g"><Interior ss:Color="#F1F5F9" ss:Pattern="Solid"/></Style>
  </Styles>
  <Worksheet ss:Name="Journal Congés">
    <Table ss:DefaultColumnWidth="100">
      <Row ss:StyleID="nh">${cell('Journal des Congés — XMator-RH')}</Row>
      <Row><Cell><Data ss:Type="String">Réf. ${fmtFR(dateRef)} — ${data.length} employé(s) — Édité le ${fmtFR(new Date().toISOString().slice(0, 10))}</Data></Cell></Row>
      <Row/>
      <Row ss:StyleID="h">${headers.map((h) => cell(h)).join('')}</Row>
      ${rows}
      <Row/>
      <Row ss:StyleID="nh">
        ${cell(`TOTAL : ${data.length} agent(s)`)  }${cell('')}${cell('')}${cell('')}${cell('')}${cell(`Solde moyen : ${fmtJours(avgSolde)} j`)}
      </Row>
      <Row ss:StyleID="g">
        ${cell(`Solde total : ${fmtJours(totalSolde)} j`)}${cell('')}${cell('')}${cell('')}${cell('')}${cell(`Solde max : ${fmtJours(maxSolde)} j`)}
      </Row>
    </Table>
  </Worksheet>
</Workbook>`);
});

module.exports = router;