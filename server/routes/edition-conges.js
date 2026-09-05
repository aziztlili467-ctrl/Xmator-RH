const { Router } = require('express');
const path = require('path');
const PDFDocument = require('pdfkit');
const { db, soldeCongeRestantDate } = require('../db');
const { drawPDFBrandHeader, drawPDFBrandFooter } = require('../utils/pdfBranding');

const router = Router();
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function fmtFR(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('T')[0].split('-');
  return `${d}/${m}/${y}`;
}

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

router.get('/pdf', (req, res) => {
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

  const data = employes.map((e) => ({
    matricule: e.matricule,
    nom: e.nom,
    prenom: e.prenom,
    categorie: e.categorie,
    solde: soldeCongeRestantDate(e.employe_id, dateRef),
  }));

  const titre = 'Journal des Congés';
  const doc = new PDFDocument({
    size: 'A4',
    layout: 'portrait',
    margins: { top: 14, bottom: 14, left: 18, right: 18 },
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

  let y = drawPDFBrandHeader(doc, { title: titre, top: 10, logoH: 12 });

  doc.font('Helvetica').fontSize(8).fillColor('#475569')
    .text(`Référence : ${fmtFR(dateRef)} — ${data.length} employé(s)`, L, y, { width: W, align: 'left' });
  y += 14;

  const colMat = 45;
  const colNom = 120;
  const colCat = 110;
  const colSolde = W - colMat - colNom - colCat;
  const headerH = 16;
  const rowH = 14;

  const drawHeader = (yy) => {
    let x = L;
    doc.rect(x, yy, colMat, headerH).fillAndStroke('#1e3a5f', '#1e3a5f');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7.5).text('Matricule', x, yy + 4.5, { width: colMat, align: 'center' });
    x += colMat;
    doc.rect(x, yy, colNom, headerH).fillAndStroke('#1e3a5f', '#1e3a5f');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7.5).text('Nom & Prénom', x + 4, yy + 4.5, { width: colNom - 8, align: 'left' });
    x += colNom;
    doc.rect(x, yy, colCat, headerH).fillAndStroke('#1e3a5f', '#1e3a5f');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7.5).text('Catégorie', x + 4, yy + 4.5, { width: colCat - 8, align: 'left' });
    x += colCat;
    doc.rect(x, yy, colSolde, headerH).fillAndStroke('#1e3a5f', '#1e3a5f');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7.5).text('Solde congé (j)', x, yy + 4.5, { width: colSolde, align: 'center' });
    return yy + headerH;
  };

  const drawRow = (emp, yy, idx) => {
    const bg = idx % 2 === 0 ? '#f8fafc' : '#ffffff';
    let x = L;
    doc.rect(x, yy, colMat, rowH).fillAndStroke(bg, '#d1d5db').lineWidth(0.3);
    doc.fillColor('#1e293b').font('Helvetica').fontSize(7).text(emp.matricule, x, yy + 3.5, { width: colMat, align: 'center' });
    x += colMat;
    doc.rect(x, yy, colNom, rowH).fillAndStroke(bg, '#d1d5db');
    doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(7).text(`${emp.nom} ${emp.prenom}`, x + 4, yy + 3.5, { width: colNom - 8, align: 'left' });
    x += colNom;
    doc.rect(x, yy, colCat, rowH).fillAndStroke(bg, '#d1d5db');
    doc.fillColor('#475569').font('Helvetica').fontSize(6.5).text(emp.categorie || '', x + 4, yy + 3.5, { width: colCat - 8, align: 'left' });
    x += colCat;
    doc.rect(x, yy, colSolde, rowH).fillAndStroke(bg, '#d1d5db');
    const soldeColor = emp.solde <= 0 ? '#dc2626' : emp.solde <= 5 ? '#d97706' : '#059669';
    doc.fillColor(soldeColor).font('Helvetica-Bold').fontSize(8).text(String(emp.solde), x, yy + 3, { width: colSolde, align: 'center' });
    return yy + rowH;
  };

  const bottomLimit = pageH - doc.page.margins.bottom;
  const ensureFit = (need) => {
    if (y + need > bottomLimit - 14) {
      doc.addPage();
      y = 14;
      y = drawHeader(y);
    }
  };

  y = drawHeader(y);

  data.forEach((emp, idx) => {
    ensureFit(rowH);
    y = drawRow(emp, y, idx);
  });

  const summaryH = 16;
  const summaryText = `Total : ${data.length} employé(s) — Solde moyen : ${data.length ? (data.reduce((s, e) => s + e.solde, 0) / data.length).toFixed(1) : 0} j`;
  // Le résumé n'est affiché que s'il tient dans l'espace libre de la dernière page de données,
  // afin d'éviter de créer une page quasiment vide en fin de document.
  if (y + 8 + summaryH <= bottomLimit - 14) {
    y += 8;
    doc.rect(L, y, W, summaryH - 2).fillAndStroke('#f1f5f9', '#94a3b8').lineWidth(0.5);
    doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(7.5).text(summaryText, L, y + 4, { width: W, align: 'center' });
  }

  // Sécurité anti-feuille vide : si le contenu ne remplit pas la page courante, on le
  // place normalement ; aucune page supplémentaire n'est créée après le dernier enregistrement.
  drawPDFBrandFooter(doc);
  doc.end();
});

module.exports = router;
