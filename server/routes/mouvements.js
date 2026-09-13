const { Router } = require('express');
const path = require('path');
const PDFDocument = require('pdfkit');
const { db, insertMouvement, updateMouvement, deleteMouvement, recomputeSoldeChain, soldeEmploye, soldeCongeRestantDate, journalSoldeConge, TYPES, isDebit } = require('../db');
const { detailJours } = require('../utils/jourOuvrable');
const { drawPDFBrandFooter } = require('../utils/pdfBranding');
const router = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isIsoDate = (v) => typeof v === 'string' && DATE_RE.test(v);
const normJours = (v) => Number(v);

const fmtFR = (iso) => {
  if (!iso) return '';
  const parts = iso.split('T')[0].split('-');
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

const fmtJours = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  const s = v.toFixed(1);
  return s.endsWith('.0') ? s.slice(0, -2) : s.replace('.', ',');
};

const TYPE_JOURNAL_LABEL = (ligne) => {
  if (ligne.type === 'prelevement_rma') return `Prélèvement RMA ${ligne.code || ''}`.trim();
  if (ligne.type_operation === 'solde_initial') return 'Solde initial';
  return 'Ajout annuel';
};

// Détail du journal du solde de congé d'un employé : identité + totaux + lignes (mêmes règles
// que le JSON exposé à l'écran — dotation crédit + prélèvements RMA synchronisés depuis la grille).
function journalDetail(id) {
  const employe = db.prepare(`
    SELECT e.id, e.matricule, e.nom, e.prenom, e.departement, c.libelle AS categorie
    FROM employes e
    LEFT JOIN categories c ON c.id = e.categorie_id
    WHERE e.id = ?
  `).get(Number(id));
  if (!employe) return null;
  const journal = journalSoldeConge(Number(id));
  const lignes = journal.lignes;
  return {
    employe,
    accorde: lignes.filter((l) => l.signe > 0).reduce((s, l) => s + l.jours, 0),
    consomme: lignes.filter((l) => l.signe < 0 && l.deduit !== false).reduce((s, l) => s + l.jours, 0),
    solde: journal.solde,
    lignes,
  };
}

// Types de congé proposés par « Prélèvement de congé » → type_operation / solde_type / code du
// Journal RMA (source de vérité) / libellé. Le code RMA est écrit pour chaque jour ouvrable déduit,
// si bien que le solde, la grille, le journal et le tableau de bord restent parfaitement synchronisés.
// `debite: false` = CI exceptionnel : présent dans le Journal RMA / tableau de bord mais jamais déduit
// du solde (même règle que les demandes de congé « exceptionnel »).
const TYPES_CONGE = {
  annuel: { type_operation: 'prelevement', solde_type: 'conge', code: 'CA', label: 'Congé annuel', debite: true },
  exceptionnel: { type_operation: 'prelevement', solde_type: 'conge', code: 'CE', label: 'Congé exceptionnel', debite: false },
  maladie: { type_operation: 'maladie', solde_type: 'maladie', code: 'MA', label: 'Maladie', debite: true },
  maternite: { type_operation: 'maladie', solde_type: 'maladie', code: 'MA', label: 'Maternité', debite: true },
};

// Écrit les cellules du Journal RMA (`codes_importes`) pour chaque jour ouvrable d'un prélèvement :
// code principal (CA / CE / MA) et, si demi-journée, « DJ » (0,5 j) sur le dernier jour ouvrable.
function insererCodesPrelevement(employeId, matricule, dates, code, demi) {
  const ins = db.prepare(`
    INSERT INTO codes_importes (employe_id, matricule, date, code, demi_journee)
    VALUES (?,?,?,?,?)
    ON CONFLICT(employe_id, date, code) DO UPDATE SET demi_journee = excluded.demi_journee
  `);
  for (let i = 0; i < dates.length; i += 1) {
    const dernier = i === dates.length - 1;
    const isDemi = !!demi && dernier;
    ins.run(employeId, matricule, dates[i], isDemi ? 'DJ' : code, isDemi ? 1 : 0);
  }
}

// GET /api/mouvements/compte-jours — aperçu avant validation : calcule, pour un employé (sa catégorie)
// et une période [debut, fin], le nombre de jours de congé à déduire hors jours fériés et repos
// hebdomadaires (règles du calendrier de l'année). Lecture seule, cohérent avec la validation serveur.
router.get('/compte-jours', (req, res) => {
  const { employe_id, debut, fin, demi_journee } = req.query;
  const emp = db.prepare('SELECT id, categorie_id FROM employes WHERE id = ?').get(Number(employe_id));
  if (!emp) return res.status(400).json({ error: 'Employé introuvable.' });
  if (!isIsoDate(debut) || !isIsoDate(fin)) {
    return res.status(400).json({ error: 'Période invalide (AAAA-MM-JJ attendu).' });
  }
  if (fin < debut) {
    return res.status(400).json({ error: 'La date de fin doit être postérieure ou égale à la date de début.' });
  }
  const detail = detailJours(debut, fin, emp.categorie_id);
  if (!detail) return res.status(400).json({ error: 'Période invalide.' });
  const jours = detail.ouvrables - (demi_journee === '1' || demi_journee === 'true' ? (detail.ouvrables >= 1 ? 0.5 : 0) : 0);
  res.json({ employe_id: emp.id, categorie_id: emp.categorie_id, date_debut: debut, date_fin: fin, ...detail, jours });
});

router.get('/', (req, res) => {
  const { employe, categorie, type, debut, fin, search } = req.query;
  let sql = `
    SELECT m.*, e.matricule, e.nom, e.prenom, e.categorie_id, c.libelle AS categorie
    FROM mouvements m
    JOIN employes e ON e.id = m.employe_id
    JOIN categories c ON c.id = e.categorie_id
    WHERE 1=1
  `;
  const params = [];
  if (employe) { sql += ' AND m.employe_id = ?'; params.push(Number(employe)); }
  if (categorie) { sql += ' AND e.categorie_id = ?'; params.push(Number(categorie)); }
  if (type && TYPES.includes(type)) { sql += ' AND m.type_operation = ?'; params.push(type); }
  if (debut && DATE_RE.test(debut)) { sql += ' AND m.date_operation >= ?'; params.push(debut); }
  if (fin && DATE_RE.test(fin)) { sql += ' AND m.date_operation <= ?'; params.push(fin); }
  if (search) {
    sql += ' AND (e.matricule LIKE ? OR e.nom LIKE ? OR e.prenom LIKE ? OR m.motif LIKE ?)';
    const p = `%${search}%`;
    params.push(p, p, p, p);
  }
  sql += ' ORDER BY m.date_operation DESC, m.id DESC';
  res.json(db.prepare(sql).all(...params));
});

// GET /api/mouvements/journal-solde/:id — « journal du solde de congé » d'un employé :
// combine les dotations crédit (solde_initial / ajout_annuel) avec les prélèvements CA/DJ
// synchronisés depuis le journal RMA, avec solde courant recalculé en continu.
router.get('/journal-solde/:id', (req, res) => {
  const detail = journalDetail(req.params.id);
  if (!detail) return res.status(404).json({ error: 'Employé introuvable.' });
  res.json(detail);
});

// GET /api/mouvements/journal-solde/:id/pdf — version PDF imprimable du journal du solde de congé
// d'un employé (mêmes lignes que l'écran), utilisée par « Télécharger en PDF » et « Imprimer en PDF ».
// Mise en page professionnelle : bandeau d'en-tête, carte d'identité de l'employé, indicateurs,
// tableau paginé (en-tête répété sur les suites) — aucune page blanche résiduelle en fin de document.
router.get('/journal-solde/:id/pdf', (req, res) => {
  const detail = journalDetail(req.params.id);
  if (!detail) return res.status(404).json({ error: 'Employé introuvable.' });
  const { employe, accorde, consomme, solde, lignes } = detail;

  const titre = 'Journal du solde de congé';
  const doc = new PDFDocument({
    size: 'A4',
    layout: 'portrait',
    margins: { top: 12, bottom: 20, left: 16, right: 16 },
  });
  doc.registerFont('Garamond', path.join(__dirname, '..', 'fonts', 'EBGaramond.ttf'));

  const dateRef = new Date().toISOString().slice(0, 10);
  const heureRef = new Date().toTimeString().slice(0, 5);
  const safeMat = String(employe.matricule || employe.id).replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `journal-solde-${safeMat}_${dateRef}.pdf`.toLowerCase().replace(/ /g, '-');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);

  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const L = doc.page.margins.left;
  const R = pageW - doc.page.margins.right;
  const W = R - L;
  const LOGO = path.join(__dirname, '..', 'photos-reference', 'photos', 'XMATOR RH-logo.png');

  // ---- Bandeau d'en-tête (pleine largeur) : logo + titre + référence ----
  const BAND_H = 58;
  doc.rect(0, 0, pageW, BAND_H).fill('#1e3a5f');
  try {
    doc.image(LOGO, L + 2, 8, { height: 26 });
  } catch (_) { /* logo indisponible : on continue sans image */ }
  doc.font('Helvetica-Bold').fontSize(14).fillColor('#ffffff')
    .text('XMator-RH', L + 34, 13, { width: 200, align: 'left', lineBreak: false });
  doc.font('Helvetica').fontSize(7.5).fillColor('#cbd5e1')
    .text('Gestion des Ressources Humaines', L + 34, 29, { width: 200, align: 'left', lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#ffffff')
    .text(titre, L + 34, 45, { width: 220, align: 'left', lineBreak: false });
  const refName = `${employe.nom} ${employe.prenom}`.slice(0, 34);
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#93c5fd')
    .text(`${refName}`, R - 250, 14, { width: 250, align: 'right', lineBreak: false });
  doc.font('Helvetica').fontSize(8).fillColor('#cbd5e1')
    .text(`Mat. ${employe.matricule} · Édité le ${fmtFR(dateRef)} à ${heureRef}`, R - 250, 27, { width: 250, align: 'right', lineBreak: false });
  doc.rect(0, BAND_H, pageW, 3).fill('#3b82f6');

  let y = BAND_H + 3 + 12;

  // ---- Carte d'identité de l'employé ----
  const identH = 47;
  doc.rect(L, y, W, identH).fillAndStroke('#f8fafc', '#e2e8f0').lineWidth(0.8);
  doc.fillColor('#94a3b8').font('Helvetica-Bold').fontSize(6).text('EMPLOYÉ', L + 12, y + 4, { width: W - 24, align: 'left', lineBreak: false });
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(11)
    .text(`${employe.nom} ${employe.prenom}`, L + 12, y + 10, { width: W - 24, align: 'left', lineBreak: false });
  const idCells = [
    { label: 'Matricule', value: String(employe.matricule) },
    { label: 'Catégorie', value: employe.categorie || '—' },
    { label: 'Département', value: employe.departement || '—' },
  ];
  const idColW = (W - 24) / 3;
  idCells.forEach((c, i) => {
    const x = L + 12 + i * idColW;
    doc.fillColor('#94a3b8').font('Helvetica-Bold').fontSize(6).text(c.label.toUpperCase(), x, y + 25, { width: idColW - 8, align: 'left', lineBreak: false });
    doc.fillColor('#334155').font('Helvetica').fontSize(9).text(c.value, x, y + 31, { width: idColW - 8, align: 'left', lineBreak: false });
  });
  y += identH + 12;

  // ---- Indicateurs : solde courant / accordé / consommé ----
  const statH = 44;
  const statGap = 10;
  const statW = (W - statGap * 2) / 3;
  const stats = [
    { label: 'Solde courant', value: solde, color: solde <= 0 ? '#dc2626' : solde <= 5 ? '#d97706' : '#059669' },
    { label: 'Total accordé', value: accorde, color: '#059669' },
    { label: 'Total consommé', value: consomme, color: '#d97706' },
  ];
  stats.forEach((s, i) => {
    const x = L + i * (statW + statGap);
    doc.rect(x, y, statW, 6).fill(s.color);
    doc.rect(x, y, statW, statH).fillAndStroke('#ffffff', '#cbd5e1').lineWidth(0.8);
    doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(6.5)
      .text(s.label.toUpperCase(), x + 8, y + 11, { width: statW - 16, align: 'left', lineBreak: false });
    doc.fillColor(s.color).font('Helvetica-Bold').fontSize(15)
      .text(`${fmtJours(s.value)} j`, x + 8, y + 19, { width: statW - 16, align: 'left', lineBreak: false });
  });
  y += statH + 16;

  // ---- Tableau du journal ----
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(9).text('Journal des mouvements', L, y, { width: W - 90, align: 'left', lineBreak: false });
  doc.fillColor('#64748b').font('Helvetica').fontSize(7)
    .text(`${lignes.length} ligne(s) — dotations et prélèvements RMA synchronisés depuis la grille`, L, y + 10, { width: W, align: 'left', lineBreak: false });
  y += 24;

  const colType = 100;
  const colPeriode = 118;
  const colJours = 52;
  const colSolde = 62;
  const colMotif = W - colType - colPeriode - colJours - colSolde;
  const headerH = 18;
  const rowH = 17;
  const drawableBottom = pageH - doc.page.margins.bottom - 4;

  const drawSuiteHeader = (yy) => {
    doc.rect(0, 0, pageW, 16).fill('#1e3a5f');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7.5)
      .text(`${titre} — ${employe.nom} ${employe.prenom} (suite)`, L, 4.5, { width: W, align: 'center', lineBreak: false });
    return yy;
  };

  const drawTableHeader = (yy) => {
    const cols = [
      { t: 'Opération', col: colType, align: 'left' },
      { t: 'Période (début → fin)', col: colPeriode, align: 'left' },
      { t: 'Jours', col: colJours, align: 'center' },
      { t: 'Solde après', col: colSolde, align: 'center' },
      { t: 'Motif', col: colMotif, align: 'left' },
    ];
    doc.rect(L, yy, W, headerH).fill('#1e3a5f');
    let x = L;
    for (const c of cols) {
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7)
        .text(c.t, c.align === 'left' ? x + 6 : x, yy + 5.5, { width: c.col - (c.align === 'left' ? 12 : 0), align: c.align });
      x += c.col;
    }
    return yy + headerH;
  };

  const truncatedMotif = (motif) => {
    let t = String(motif || '—');
    doc.font('Helvetica').fontSize(7);
    if (doc.widthOfString(t) <= colMotif - 12) return t;
    while (t.length > 3 && doc.widthOfString(t) > colMotif - 14) t = t.slice(0, -1);
    return `${t}…`;
  };

  const valeurTexte = (ligne) => {
    if (ligne.signe < 0 && ligne.deduit === false) return '±0';
    return (ligne.signe < 0 ? '−' : '+') + fmtJours(Math.abs(ligne.jours));
  };

  const drawRow = (ligne, yy, idx) => {
    const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
    doc.rect(L, yy, W, rowH).fillAndStroke(bg, '#e2e8f0').lineWidth(0.5);
    const nonDeduit = ligne.signe < 0 && ligne.deduit === false;
    let x = L;
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(7)
      .text(TYPE_JOURNAL_LABEL(ligne), x + 6, yy + 4.5, { width: colType - 12, align: 'left' });
    x += colType;
    doc.fillColor('#334155').font('Helvetica').fontSize(7)
      .text(`${fmtFR(ligne.date_debut || ligne.date_operation)} → ${fmtFR(ligne.date_fin || ligne.date_operation)}`, x + 6, yy + 4.5, { width: colPeriode - 12, align: 'left' });
    x += colPeriode;
    doc.fillColor(nonDeduit ? '#94a3b8' : ligne.signe < 0 ? '#d97706' : '#059669').font('Helvetica-Bold').fontSize(7.5)
      .text(valeurTexte(ligne), x, yy + 4, { width: colJours, align: 'center' });
    x += colJours;
    doc.fillColor('#475569').font('Helvetica').fontSize(7)
      .text(`${fmtJours(ligne.solde_apres)} j`, x, yy + 4.5, { width: colSolde, align: 'center' });
    x += colSolde;
    doc.fillColor('#64748b').font('Helvetica').fontSize(7)
      .text(truncatedMotif(ligne.motif), x + 6, yy + 4.5, { width: colMotif - 12, align: 'left' });
    return yy + rowH;
  };

  let pageRows = 0;
  const ensureFit = (need) => {
    if (y + need > drawableBottom) {
      doc.addPage();
      pageRows = 0;
      y = 20;
      y = drawSuiteHeader(y);
      y = drawTableHeader(y);
    }
  };

  y = drawTableHeader(y);
  if (!lignes.length) {
    doc.rect(L, y, W, rowH).fillAndStroke('#ffffff', '#e2e8f0').lineWidth(0.5);
    doc.fillColor('#94a3b8').font('Helvetica').fontSize(7.5).text('Aucun mouvement pour cet employé — solde vierge.', L, y + 4.5, { width: W, align: 'center' });
    y += rowH;
  } else {
    for (const ligne of lignes) {
      ensureFit(rowH);
      y = drawRow(ligne, y, pageRows);
      pageRows += 1;
    }
  }

  // Récapitulatif — affiché uniquement s'il tient dans la page courante (jamais de page ajoutée).
  const summaryText = `Récapitulatif — Accordé : ${fmtJours(accorde)} j · Consommé : ${fmtJours(consomme)} j · Solde courant : ${fmtJours(solde)} j · ${lignes.length} ligne(s)`;
  if (y + 8 + 18 <= drawableBottom) {
    y += 8;
    doc.rect(L, y, W, 18).fillAndStroke('#f1f5f9', '#cbd5e1').lineWidth(0.6);
    doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(7.5).text(summaryText, L, y + 4.5, { width: W, align: 'center' });
  }

  drawPDFBrandFooter(doc);
  doc.end();
});// GET /api/mouvements/journal-solde/:id/xls — export Excel (SpreadsheetML, .xls) du journal du
// solde de congé d'un employé : mêmes colonnes que l'écran, avec totaux accordé / consommé / courant.
const xmlEscape = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

router.get('/journal-solde/:id/xls', (req, res) => {
  const detail = journalDetail(req.params.id);
  if (!detail) return res.status(404).json({ error: 'Employé introuvable.' });
  const { employe, accorde, consomme, solde, lignes } = detail;

  const dateRef = new Date().toISOString().slice(0, 10);
  const safeMat = String(employe.matricule || employe.id).replace(/[^a-zA-Z0-9_-]/g, '_');

  const styles = `
  <Styles>
   <Style ss:ID="titre"><Font ss:Bold="1" ss:Size="14"/></Style>
   <Style ss:ID="entete"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#1E293B" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center" ss:Vertical="Center"/></Style>
   <Style ss:ID="c_dot"><Font ss:Bold="1" ss:Color="#047857"/><Alignment ss:Horizontal="Center" ss:Vertical="Center"/></Style>
   <Style ss:ID="c_prel"><Font ss:Bold="1" ss:Color="#B45309"/><Alignment ss:Horizontal="Center" ss:Vertical="Center"/></Style>
   <Style ss:ID="total"><Font ss:Bold="1"/></Style>
  </Styles>`;

  const cell = (styleId, valeur, type = 'String') => `<Cell ss:StyleID="${styleId}"><Data ss:Type="${type}">${xmlEscape(valeur)}</Data></Cell>`;
  const cellPlain = (valeur, type = 'String') => `<Cell><Data ss:Type="${type}">${xmlEscape(valeur)}</Data></Cell>`;

  let rows = '';
  rows += '<Row>' + cell('titre', `Journal du solde de congé — ${employe.nom} ${employe.prenom} (mat. ${employe.matricule})`) + '</Row>';
  rows += '<Row>' + cellPlain(`Généré le ${fmtFR(dateRef)}`) + '</Row>';
  rows += '<Row></Row>';
  rows += '<Row>' + cell('entete', 'Type') + cell('entete', 'Début') + cell('entete', 'Fin') + cell('entete', 'Jours') + cell('entete', 'Solde après') + cell('entete', 'Motif') + '</Row>';

  for (const l of lignes) {
    const styleId = l.type === 'prelevement_rma' ? 'c_prel' : 'c_dot';
    const nonDeduit = l.signe < 0 && l.deduit === false;
    const valeur = nonDeduit ? 0 : l.signe * l.jours;
    rows += '<Row>' + cell(styleId, TYPE_JOURNAL_LABEL(l))
      + cellPlain(fmtFR(l.date_debut || l.date_operation))
      + cellPlain(fmtFR(l.date_fin || l.date_operation))
      + `<Cell ss:StyleID="${styleId}"><Data ss:Type="Number">${valeur}</Data></Cell>`
      + `<Cell><Data ss:Type="Number">${l.solde_apres}</Data></Cell>`
      + cellPlain(l.motif || '—') + '</Row>';
  }

  rows += '<Row></Row>';
  rows += '<Row>' + cell('total', 'Total accordé (j)') + `<Cell><Data ss:Type="Number">${accorde}</Data></Cell>` + '</Row>';
  rows += '<Row>' + cell('total', 'Total consommé (j)') + `<Cell><Data ss:Type="Number">${consomme}</Data></Cell>` + '</Row>';
  rows += '<Row>' + cell('total', 'Solde courant (j)') + `<Cell><Data ss:Type="Number">${solde}</Data></Cell>` + '</Row>';

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">${styles}
<Worksheet ss:Name="Journal du solde"><Table>
<Column ss:Width="160"/><Column ss:Width="70"/><Column ss:Width="70"/><Column ss:Width="60"/><Column ss:Width="70"/><Column ss:Width="260"/>
${rows}</Table></Worksheet></Workbook>`;

  res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="journal-solde-${safeMat}_${dateRef}.xls"`);
  res.send('\ufeff' + xml);
});

router.post('/', (req, res) => {
  const { employe_id, type_conge, type_operation, date_operation, date_debut, date_fin, jours, motif, demi_journee } = req.body || {};

  const empId = Number(employe_id);
  const emp = db.prepare('SELECT id, matricule, categorie_id FROM employes WHERE id = ?').get(empId);
  if (!emp) return res.status(400).json({ error: 'Employé introuvable.' });

  let op;
  let soldeType;
  let j;
  let dOp;
  let motifFinal;
  let datesOuvrables = null;
  let detailInfo = null;

  if (type_conge) {
    // ---- Saisie manuelle par période [date_debut → date_fin] (correction du pointage) ----
    const t = TYPES_CONGE[type_conge];
    if (!t) return res.status(400).json({ error: 'Type de congé invalide.' });
    if (!isIsoDate(date_debut) || !isIsoDate(date_fin)) {
      return res.status(400).json({ error: 'Période invalide : date de début et de fin attendues au format AAAA-MM-JJ.' });
    }
    if (date_fin < date_debut) {
      return res.status(400).json({ error: 'La date de fin doit être postérieure ou égale à la date de début.' });
    }
    // Jours de congé = jours OUVRABLES de la période (jours fériés et repos hebdomadaires déduits),
    // calculés depuis le calendrier de l'année pour la catégorie de l'employé.
    const detail = detailJours(date_debut, date_fin, emp.categorie_id);
    if (!detail) return res.status(400).json({ error: 'Période invalide.' });
    if (detail.ouvrables < 1) {
      return res.status(400).json({
        error: 'Aucun jour ouvrable dans cette période pour ce type de congé : tous les jours sont fériés ou repos (hebdomadaire).',
      });
    }
    j = detail.ouvrables - (demi_journee ? 0.5 : 0);
    op = t.type_operation;
    soldeType = t.solde_type;
    dOp = date_debut;
    motifFinal = t.label + (motif ? ` — ${String(motif).trim()}` : '');
    datesOuvrables = detail.dates;
    detailInfo = detail;
    if (demi_journee) motifFinal += ' (demi-journée)';
  } else {
    // ---- Mode historique : type d'opération + date + nombre de jours saisi à la main ----
    if (!TYPES.includes(type_operation)) {
      return res.status(400).json({ error: 'Type d\'opération invalide.' });
    }
    if (!date_operation || !DATE_RE.test(date_operation)) {
      return res.status(400).json({ error: 'Date invalide (format AAAA-MM-JJ attendu).' });
    }
    const jj = Number(jours);
    if (!Number.isFinite(jj) || jj <= 0) {
      return res.status(400).json({ error: 'Le nombre de jours doit être positif.' });
    }
    j = jj;
    op = type_operation;
    soldeType = type_operation === 'maladie' ? 'maladie' : 'conge';
    dOp = date_operation;
    motifFinal = motif;
  }

  // Contrôle du solde de congé cohérent avec la fiche et le journal RMA (accorde − consomme)
  const debite = !(type_conge && TYPES_CONGE[type_conge].debite === false);
  const soldeAvant = soldeType === 'conge' ? soldeCongeRestantDate(empId) : soldeEmploye(empId, soldeType);
  if (debite && isDebit(op) && j > soldeAvant + 0.0001) {
    return res.status(400).json({
      error: `Solde ${soldeType === 'maladie' ? 'maladie' : 'de congé'} insuffisant. Disponible : ${soldeAvant} jour(s), prélèvement demandé : ${j} jour(s).`,
    });
  }

  // Insertion transactionnelle : mouvement de solde (sauf congé exceptionnel, jamais débité) + cellules
  // du Journal RMA — toute la chaîne d'affichage (solde, grille, journal, tableau de bord) en découle.
  const r = db.transaction(() => {
    let mvt = null;
    let noteTx = null;
    if (debite) {
      mvt = insertMouvement({
        employe_id: empId,
        type_operation: op,
        date_operation: dOp,
        date_debut: date_debut || dOp,
        date_fin: date_fin || dOp,
        jours: j,
        motif: motifFinal,
        solde_type: soldeType,
      });
    }
    if (datesOuvrables && datesOuvrables.length) {
      const t = TYPES_CONGE[type_conge];
      insererCodesPrelevement(empId, emp.matricule, datesOuvrables, t.code, demi_journee);
      if (!debite) noteTx = 'Congé exceptionnel : ajouté au Journal RMA (cellules CE) sans déduction du solde.';
    }
    return { mvt, note: noteTx };
  })();
  const { mvt } = r;

  const soldeApres = debite
    ? (soldeType === 'conge' ? soldeCongeRestantDate(empId) : soldeEmploye(empId, soldeType))
    : soldeAvant;
  res.status(201).json({
    mvt,
    note: r.note,
    type_conge,
    date_debut: date_debut || null,
    date_fin: date_fin || null,
    jours_calcules: type_conge ? j : null,
    detail: detailInfo ? { total: detailInfo.total, ouvrables: detailInfo.ouvrables, feries: detailInfo.feries, repos: detailInfo.repos } : null,
    solde_apres: soldeApres,
  });
});

router.post('/correction-solde', (req, res) => {
  const { employe_id, nouveau_solde, date_operation, motif } = req.body || {};
  const emp = db.prepare('SELECT id FROM employes WHERE id = ?').get(Number(employe_id));
  if (!emp) return res.status(400).json({ error: 'Employé introuvable.' });
  if (!date_operation || !DATE_RE.test(date_operation)) {
    return res.status(400).json({ error: 'Date invalide (format AAAA-MM-JJ attendu).' });
  }
  const cible = Number(nouveau_solde);
  if (!Number.isFinite(cible)) {
    return res.status(400).json({ error: 'Le solde cible doit être un nombre.' });
  }

  const courant = soldeCongeRestantDate(Number(employe_id));
  const diff = Math.round((cible - courant) * 1000) / 1000;
  if (Math.abs(diff) < 0.0001) {
    return res.status(200).json({ mvt: null, courant, message: 'Le solde correspond déjà à la valeur cible. Aucune correction nécessaire.' });
  }

  const typeOperation = diff > 0 ? 'ajout_annuel' : 'prelevement';
  const jours = Math.abs(diff);

  if (typeOperation === 'prelevement' && jours > courant + 0.0001) {
    return res.status(400).json({
      error: `Impossible : pour corriger le solde de ${courant} à ${cible} j, il faudrait prélever ${jours} j alors que le solde disponible est de ${courant} j.`,
    });
  }

  const mvt = insertMouvement({
    employe_id: Number(employe_id),
    type_operation: typeOperation,
    date_operation,
    jours,
    motif: `Correction de solde — ${motif || 'régularisation'}`,
  });
  res.status(201).json({ mvt, courant, cible });
});

// Éditer solde de congé — dotation d'un solde pour UN employé sur une période [début → fin].
// type_operation : 'solde_initial' (fixe/remplace le socle) ou 'ajout_annuel' (ajoute au solde courant).
router.post('/balances', (req, res) => {
  const { employe_id, type_operation, date_debut, date_fin, date_operation, jours, motif } = req.body || {};
  const emp = db.prepare('SELECT id FROM employes WHERE id = ?').get(Number(employe_id));
  if (!emp) return res.status(400).json({ error: 'Employé introuvable.' });
  const op = type_operation === 'solde_initial' ? 'solde_initial' : 'ajout_annuel';
  const j = Number(jours);
  // Un solde initial peut être NÉGATIF (dette / avance consommée) pour être soustrait des droits annuels futurs.
  const initialNegatif = op === 'solde_initial' && j < 0;
  if (!Number.isFinite(j) || j === 0 || (!initialNegatif && j < 0)) {
    return res.status(400).json({ error: op === 'solde_initial' ? 'Le nombre de jours doit être non nul (négatif autorisé pour un solde initial).' : 'Le nombre de jours doit être positif.' });
  }
  if (!date_debut || !isIsoDate(date_debut) || !date_fin || !isIsoDate(date_fin)) {
    return res.status(400).json({ error: 'Période invalide : date de début et de fin attendues au format AAAA-MM-JJ.' });
  }
  if (date_fin < date_debut) {
    return res.status(400).json({ error: 'La date de fin doit être postérieure ou égale à la date de début.' });
  }
  const dOp = date_operation && isIsoDate(date_operation) ? date_operation : date_debut;
  const mvt = insertMouvement({
    employe_id: Number(employe_id),
    type_operation: op,
    date_operation: dOp,
    date_debut,
    date_fin,
    jours: j,
    motif: motif || (op === 'solde_initial' ? 'Solde initial' : 'Ajout de solde annuel'),
  });
  res.status(201).json({ mvt, solde: soldeCongeRestantDate(Number(employe_id)) });
});

router.post('/ajout-annuel-masse', (req, res) => {
  const { jours, date_operation, motif, categorie_id, employes } = req.body || {};
  const j = Number(jours);
  if (!Number.isFinite(j) || j <= 0) {
    return res.status(400).json({ error: 'Le nombre de jours doit être positif.' });
  }
  if (!date_operation || !DATE_RE.test(date_operation)) {
    return res.status(400).json({ error: 'Date invalide (format AAAA-MM-JJ attendu).' });
  }

  let sql = 'SELECT id FROM employes WHERE actif = 1';
  const params = [];
  if (categorie_id) { sql += ' AND categorie_id = ?'; params.push(Number(categorie_id)); }
  if (Array.isArray(employes) && employes.length) {
    const placeholders = employes.map(() => '?').join(',');
    sql += ` AND id IN (${placeholders})`;
    params.push(...employes.map(Number));
  }
  const list = db.prepare(sql).all(...params);
  if (!list.length) return res.status(400).json({ error: 'Aucun employé concerné.' });

  const tx = db.transaction(() =>
    list.map((e) => insertMouvement({
      employe_id: e.id,
      type_operation: 'ajout_annuel',
      date_operation,
      jours: j,
      motif,
    }))
  );
  const rows = tx();
  res.status(201).json({ count: rows.length, rows });
});

// Éditer solde de congé — dotation en masse par catégorie (période [début → fin] + nombre de jours)
// type_operation : 'solde_initial' (remplace l'historique de congé) ou 'ajout_annuel' (s'ajoute au solde).
router.post('/balances-masse', (req, res) => {
  const { type_operation, date_debut, date_fin, date_operation, jours, motif, categorie_id, employes } = req.body || {};
  const op = type_operation === 'solde_initial' ? 'solde_initial' : 'ajout_annuel';
  const j = Number(jours);
  // Un solde initial peut être NÉGATIF pour être soustrait des droits annuels futurs.
  const initialNegatif = op === 'solde_initial' && j < 0;
  if (!Number.isFinite(j) || j === 0 || (!initialNegatif && j < 0)) {
    return res.status(400).json({ error: op === 'solde_initial' ? 'Le nombre de jours doit être non nul (négatif autorisé pour un solde initial).' : 'Le nombre de jours doit être positif.' });
  }
  if (!date_debut || !isIsoDate(date_debut) || !date_fin || !isIsoDate(date_fin)) {
    return res.status(400).json({ error: 'Période invalide : date de début et de fin attendues au format AAAA-MM-JJ.' });
  }
  if (date_fin < date_debut) {
    return res.status(400).json({ error: 'La date de fin doit être postérieure ou égale à la date de début.' });
  }
  const dOp = date_operation && isIsoDate(date_operation) ? date_operation : date_debut;

  let sql = 'SELECT id FROM employes WHERE actif = 1';
  const params = [];
  if (categorie_id) { sql += ' AND categorie_id = ?'; params.push(Number(categorie_id)); }
  if (Array.isArray(employes) && employes.length) {
    const placeholders = employes.map(() => '?').join(',');
    sql += ` AND id IN (${placeholders})`;
    params.push(...employes.map(Number));
  }
  const list = db.prepare(sql).all(...params);
  if (!list.length) return res.status(400).json({ error: 'Aucun employé concerné.' });

  const tx = db.transaction(() =>
    list.map((e) => insertMouvement({
      employe_id: e.id,
      type_operation: op,
      date_operation: dOp,
      date_debut,
      date_fin,
      jours: j,
      motif: motif || (op === 'solde_initial' ? 'Solde initial' : 'Ajout de solde annuel'),
    }))
  );
  const rows = tx();
  res.status(201).json({ count: rows.length, rows });
});

// Ajout de solde MALADIE annuel en masse (ex. 20 jours)
router.post('/ajout-maladie-masse', (req, res) => {
  const { jours, date_operation, motif, categorie_id, employes } = req.body || {};
  const j = Number(jours);
  if (!Number.isFinite(j) || j <= 0) {
    return res.status(400).json({ error: 'Le nombre de jours doit être positif.' });
  }
  if (!date_operation || !DATE_RE.test(date_operation)) {
    return res.status(400).json({ error: 'Date invalide (format AAAA-MM-JJ attendu).' });
  }

  let sql = 'SELECT id FROM employes WHERE actif = 1';
  const params = [];
  if (categorie_id) { sql += ' AND categorie_id = ?'; params.push(Number(categorie_id)); }
  if (Array.isArray(employes) && employes.length) {
    const placeholders = employes.map(() => '?').join(',');
    sql += ` AND id IN (${placeholders})`;
    params.push(...employes.map(Number));
  }
  const list = db.prepare(sql).all(...params);
  if (!list.length) return res.status(400).json({ error: 'Aucun employé concerné.' });

  const tx = db.transaction(() =>
    list.map((e) => insertMouvement({
      employe_id: e.id,
      type_operation: 'ajout_annuel',
      date_operation,
      jours: j,
      motif: motif || 'Ajout solde maladie annuel',
      solde_type: 'maladie',
    }))
  );
  const rows = tx();
  res.status(201).json({ count: rows.length, rows });
});

// Éditer solde de congé — supprimer TOUS les soldes de congé d'un employé ou d'une catégorie (en masse),
// afin d'intégrer de nouvelles valeurs. Ne touche pas aux soldes maladie.
router.post('/clear-soldes', (req, res) => {
  const { employe_id, categorie_id, employes } = req.body || {};
  let sql = 'SELECT id FROM employes';
  const params = [];
  if (employe_id) { sql += ' WHERE id = ?'; params.push(Number(employe_id)); }
  else {
    sql += ' WHERE actif = 1';
    if (categorie_id) { sql += ' AND categorie_id = ?'; params.push(Number(categorie_id)); }
  }
  if (Array.isArray(employes) && employes.length) {
    sql += (sql.includes('WHERE') ? ' AND' : ' WHERE') + ' id IN (' + employes.map(() => '?').join(',') + ')';
    params.push(...employes.map(Number));
  }
  const list = db.prepare(sql).all(...params);
  if (!list.length) return res.status(400).json({ error: 'Aucun employé concerné.' });

  const tx = db.transaction(() => {
    let total = 0;
    for (const e of list) {
      const ids = db.prepare("SELECT id FROM mouvements WHERE employe_id = ? AND solde_type = 'conge'").all(e.id).map((r) => r.id);
      if (!ids.length) continue;
      const ph = ids.map(() => '?').join(',');
      const r = db.prepare(`DELETE FROM mouvements WHERE id IN (${ph})`).run(...ids);
      total += r.changes;
    }
    return total;
  });
  const deleted = tx();

  // Recalcule les soldes courant (désormais 0) pour les employés concernés
  for (const e of list) recomputeSoldeChain(e.id, 'conge');

  res.json({ ok: true, count: list.length, deleted, soldes_reinitialises: list.length });
});

// PUT /api/mouvements/:id — éditer une dotation de solde (Éditer solde de congé)
router.put('/:id', (req, res) => {
  const { date_operation, date_debut, date_fin, jours, motif } = req.body || {};
  if (date_operation && !isIsoDate(date_operation)) {
    return res.status(400).json({ error: 'Date d\'opération invalide (format AAAA-MM-JJ attendu).' });
  }
  if (date_debut && !isIsoDate(date_debut)) {
    return res.status(400).json({ error: 'Date de début invalide (format AAAA-MM-JJ attendu).' });
  }
  if (date_fin && !isIsoDate(date_fin)) {
    return res.status(400).json({ error: 'Date de fin invalide (format AAAA-MM-JJ attendu).' });
  }
  if (jours !== undefined) {
    const existant = db.prepare('SELECT type_operation FROM mouvements WHERE id = ?').get(req.params.id);
    const initialNegatif = existant && existant.type_operation === 'solde_initial' && Number(jours) < 0;
    if (!Number.isFinite(Number(jours)) || Number(jours) === 0 || (!initialNegatif && Number(jours) < 0)) {
      const estInitial = existant && existant.type_operation === 'solde_initial';
      return res.status(400).json({ error: estInitial ? 'Le nombre de jours doit être non nul (négatif autorisé pour un solde initial).' : 'Le nombre de jours doit être positif.' });
    }
  }
  try {
    const mvt = updateMouvement(req.params.id, { date_operation, date_debut, date_fin, jours, motif });
    if (!mvt) return res.status(404).json({ error: 'Mouvement introuvable.' });
    res.json({ mvt, solde: mvt.solde_type === 'conge' ? soldeCongeRestantDate(mvt.employe_id) : soldeEmploye(mvt.employe_id, mvt.solde_type) });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  const mvt = deleteMouvement(req.params.id);
  if (!mvt) return res.status(404).json({ error: 'Mouvement introuvable.' });
  res.json({ ok: true, solde: mvt.solde_type === 'conge' ? soldeCongeRestantDate(mvt.employe_id) : soldeEmploye(mvt.employe_id, mvt.solde_type) });
});

module.exports = router;
