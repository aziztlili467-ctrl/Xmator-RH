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

// Matrice quotidienne : dates × employés → code du jour.
// Sources fusionnées : pointages badgeuse → P1 (présent) + codifications importées du Journal RMA
// (`codes_importes` : A1/CA/MA/R3/RP…) — plusieurs codes le même jour sont joints par '/'.
function computeStats(debut, fin) {
  const employes = db.prepare(`
    SELECT e.id, e.matricule, e.nom, e.prenom, c.libelle AS categorie
    FROM employes e
    JOIN categories c ON c.id = e.categorie_id
    WHERE e.actif = 1
    ORDER BY CAST(e.matricule AS INTEGER), e.matricule
  `).all();

  const dates = listDates(debut, fin);
  // Calendrier administratif : jours ouvrables (heures > 0)
  const legalRows = db.prepare("SELECT date, heures FROM jours_travail WHERE date >= ? AND date <= ?").all(debut, fin);
  const legalMap = {};
  for (const r of legalRows) legalMap[r.date] = Number(r.heures) || 0;
  const hasCal = legalRows.length > 0;
  const isOuvrable = (iso) => {
    if (!hasCal) { const wd = new Date(iso + 'T00:00:00').getDay(); return wd !== 0 && wd !== 6; }
    return (legalMap[iso] || 0) > 0;
  };

  const jours = {};

  // P1 (présent) : journée avec au moins un pointage (badgeuse) — seulement jours ouvrables comptent dans totaux
  const presences = db.prepare(`
    SELECT employe_id, date FROM pointages
    WHERE date >= ? AND date <= ?
    GROUP BY employe_id, date
  `).all(debut, fin);
  for (const p of presences) {
    if (!jours[p.employe_id]) jours[p.employe_id] = {};
    // Toujours afficher P1 dans la matrice (y compris WE), mais les totaux filtreront plus bas
    jours[p.employe_id][p.date] = 'P1';
  }

  // Codifications importées (Journal RMA) : fusionnées par matricule et date — affichage toujours, totaux filtrés
  const imports = db.prepare(`
    SELECT employe_id, date AS jour, code, demi_journee FROM codes_importes
    WHERE date >= ? AND date <= ?
    ORDER BY date, code
  `).all(debut, fin);
  const joursDemi = {};
  for (const r of imports) {
    if (!jours[r.employe_id]) jours[r.employe_id] = {};
    const cur = jours[r.employe_id][r.jour];
    jours[r.employe_id][r.jour] = cur ? `${cur}/${r.code}` : r.code;
    if (r.demi_journee && r.code === 'CA') {
      if (!joursDemi[r.employe_id]) joursDemi[r.employe_id] = {};
      joursDemi[r.employe_id][r.jour] = true;
    }
  }

  // Totaux synchronisés avec le dashboard : seulement les jours ouvrables comptent.
  // Demi-journée CA = 0.5 (même règle dashboard) ; P1 sur férié/WE = 0.
  const parCode = {};
  let total = 0;
  for (const [empId, jmap] of Object.entries(jours)) {
    for (const [iso, cell] of Object.entries(jmap)) {
      if (!isOuvrable(iso)) continue;
      for (const c of String(cell).split('/')) {
        if (c === 'CA' && joursDemi[empId] && joursDemi[empId][iso]) {
          parCode[c] = (parCode[c] || 0) + 0.5;
          total += 0.5;
        } else {
          parCode[c] = (parCode[c] || 0) + 1;
          total += 1;
        }
      }
    }
  }
  // Arrondi à 0.5 près
  for (const k of Object.keys(parCode)) parCode[k] = Math.round(parCode[k] * 2) / 2;
  total = Math.round(total * 2) / 2;
  return { debut, fin, dates, employes, jours, joursDemi, totaux: { par_code: parCode, p1: parCode.P1 || 0, total } };
}

// Codes de la codification (Paramètres & Codification) : { CODE: { libelle, couleur } }
function codesPaie() {
  const map = {};
  for (const c of db.prepare('SELECT code, libelle, couleur FROM codes_paie ORDER BY code').all()) {
    map[c.code] = { libelle: c.libelle, couleur: c.couleur };
  }
  return map;
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

  res.json({
    ...computeStats(debut, fin),
    // Métadonnées des codes (couleur + libellé) pour l'affichage coloré — accessibles à tous les rôles en lecture
    codes: db.prepare('SELECT code, libelle, couleur FROM codes_paie ORDER BY code').all(),
  });
});

// ---- Export PDF (matrice quotidienne, paysage) ----
router.get('/pdf', (req, res) => {
  const { debut, fin } = req.query;
  if (!debut || !fin || !DATE_RE.test(debut) || !DATE_RE.test(fin)) {
    return res.status(400).json({ error: 'Paramètres debut et fin requis au format AAAA-MM-JJ.' });
  }
  if (fin < debut) return res.status(400).json({ error: 'La date de fin doit être postérieure ou égale à la date de début.' });

  const { dates, employes, jours, joursDemi, totaux } = computeStats(debut, fin);

  // Légende calculée UNE seule fois (les codes présents dans la période) — ne pas rappeler
  // computeStats par page : sur une longue période cela multipliait les requêtes SQL par le nombre de pages.
  const codesMeta = codesPaie();
  const codeColor = {};
  for (const [code, meta] of Object.entries(codesMeta)) {
    codeColor[code] = meta.couleur || '#111827';
  }
  const legendTxt = Object.keys((totaux || {}).par_code || {})
    .sort()
    .map((c) => `${c} = ${(codesMeta[c] || {}).libelle || c}`)
    .join(' · ') || 'Aucune codification sur la période';

  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margins: { top: 50, bottom: 45, left: 30, right: 30 } });
  doc.registerFont('Garamond', path.join(__dirname, '..', 'fonts', 'EBGaramond.ttf'));
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="journal-paie-${debut}_${fin}.pdf"`);
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

  const today = new Date();
  const stamp = `${today.getDate()}/${today.getMonth() + 1}/${today.getFullYear()}`;

  let pageNum = 0;

  const drawTitle = () => {
    doc.font('Garamond').fontSize(16).fillColor('#1f2937')
      .text('Amicale du Personnel de la Banque Centrale de Tunisie', L, 40, { align: 'center', width: W });
    doc.font('Garamond').fontSize(19).fillColor('#111827')
      .text('Journal de paie', L, 66, { align: 'center', width: W });
    doc.moveTo(L, 86).lineTo(R, 86).strokeColor('#111827').lineWidth(1).stroke();
    doc.font('Helvetica').fontSize(10).fillColor('#374151');
    doc.text(`Période du ${fmtFR(debut)} au ${fmtFR(fin)}`, L, 94, { width: W / 2, lineBreak: false });
    doc.text(`Effectif : ${employes.length} employé(s)`, L + W / 2, 94, { width: W / 2, align: 'right', lineBreak: false });
  };

  const shortName = (e) => {
    const initials = e.prenom.split(/\s+/).filter(Boolean).map((w) => w[0].toUpperCase()).join('. ');
    return `${e.nom.toUpperCase()} ${initials}.`;
  };

  // Total par employé synchronisé dashboard : uniquement jours ouvrables, CA demi = 0.5
  const legalMapPdf = {};
  for (const r of db.prepare("SELECT date, heures FROM jours_travail WHERE date >= ? AND date <= ?").all(debut, fin)) legalMapPdf[r.date] = Number(r.heures)||0;
  const hasCalPdf = Object.keys(legalMapPdf).length>0;
  const isOuvPdf = (iso) => hasCalPdf ? (legalMapPdf[iso]||0)>0 : (new Date(iso+'T00:00:00').getDay()!==0 && new Date(iso+'T00:00:00').getDay()!==6);
  const totalJours = (id) => {
    if (!jours[id]) return 0;
    let s = 0;
    for (const [iso, cell] of Object.entries(jours[id])) {
      if (!isOuvPdf(iso)) continue;
      for (const c of String(cell).split('/')) {
        if (c==='CA' && joursDemi && joursDemi[id] && joursDemi[id][iso]) s+=0.5; else s+=1;
      }
    }
    return Math.round(s*2)/2;
  };

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
        const isDemiCA = joursDemi && joursDemi[e.id] && joursDemi[e.id][iso];
        const baseColor = codeColor[code.split('/')[0]] || '#111827';
        const col = isDemiCA ? '#000000' : baseColor;
        doc.fillColor(col).font('Helvetica-Bold').fontSize(7)
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
    const countDate = (iso) => {
      if (!isOuvPdf(iso)) return 0;
      let s=0;
      for (const e of employes) {
        const cell = jours[e.id] ? jours[e.id][iso] : null;
        if (!cell) continue;
        for (const c of String(cell).split('/')) {
          if (c==='CA' && joursDemi && joursDemi[e.id] && joursDemi[e.id][iso]) s+=0.5; else s+=1;
        }
      }
      return Math.round(s*2)/2;
    };
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
          .text(legendTxt, L, 108, { align: 'center', width: W });
        doc.font('Helvetica').fontSize(8).fillColor('#475569')
          .text(`Dates du ${fmtFR(dc[0])} au ${fmtFR(dc[dc.length - 1])}`, L, 118, { align: 'center', width: W });
        y = headerRow(dc, 128);
      } else {
        doc.font('Garamond').fontSize(12).fillColor('#111827')
            .text(`Journal de paie (suite) — ${shortName(eb[0])} à ${shortName(eb[eb.length - 1])}`, L, 40, { align: 'center', width: W });
        y = headerRow(dc, 56);
      }

      for (const e of eb) {
        if (y + rowH > pageH - 100) {
          doc.addPage();
          pageNum += 1;
          doc.font('Garamond').fontSize(12).fillColor('#111827')
          .text(`Journal de paie (suite) — ${shortName(eb[0])} à ${shortName(eb[eb.length - 1])}`, L, 40, { align: 'center', width: W });
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

// ---- Export Excel (.xls SpreadsheetML) : même matrice, cellules colorées selon la codification ----
const xmlEscape = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function teinte(hex, ratio = 0.82) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex || '').trim());
  const base = m ? parseInt(m[1], 16) : 0x1d4ed8;
  const mix = (v) => Math.round(v * (1 - ratio) + 255 * ratio).toString(16).padStart(2, '0');
  return `#${mix((base >> 16) & 255)}${mix((base >> 8) & 255)}${mix(base & 255)}`.toUpperCase();
}

router.get('/xls', (req, res) => {
  const { debut, fin } = req.query;
  if (!debut || !fin || !DATE_RE.test(debut) || !DATE_RE.test(fin)) {
    return res.status(400).json({ error: 'Paramètres debut et fin requis au format AAAA-MM-JJ.' });
  }
  if (fin < debut) return res.status(400).json({ error: 'La date de fin doit être postérieure ou égale à la date de début.' });

  const stats = computeStats(debut, fin);
  const { dates, employes, jours, joursDemi } = stats;
  const codesMeta = codesPaie();
  // Styles générés par code présent dans la période (cellules colorées selon la codification)
  const codesUtilises = Object.keys(stats.totaux.par_code || {}).sort();

  // Totaux XLS synchronisés dashboard : ouvrables uniquement, CA demi = 0.5
  const legalMapXls = {};
  for (const r of db.prepare("SELECT date, heures FROM jours_travail WHERE date >= ? AND date <= ?").all(debut, fin)) legalMapXls[r.date]=Number(r.heures)||0;
  const hasCalXls = Object.keys(legalMapXls).length>0;
  const isOuvXls = (iso) => hasCalXls ? (legalMapXls[iso]||0)>0 : (new Date(iso+'T00:00:00').getDay()!==0 && new Date(iso+'T00:00:00').getDay()!==6);
  const totalJoursEmp = (id) => {
    if (!jours[id]) return 0;
    let s=0;
    for (const [iso,cell] of Object.entries(jours[id])) {
      if (!isOuvXls(iso)) continue;
      for (const c of String(cell).split('/')) { if (c==='CA' && joursDemi[id] && joursDemi[id][iso]) s+=0.5; else s+=1; }
    }
    return Math.round(s*2)/2;
  };
  const countDate = (iso) => {
    if (!isOuvXls(iso)) return 0;
    let s=0;
    for (const e of employes) {
      const cell=jours[e.id]?jours[e.id][iso]:null;
      if (!cell) continue;
      for (const c of String(cell).split('/')) { if (c==='CA' && joursDemi[e.id] && joursDemi[e.id][iso]) s+=0.5; else s+=1; }
    }
    return Math.round(s*2)/2;
  };

  const styleCode = (code) => {
    const meta = codesMeta[code] || {};
    const coul = String(meta.couleur || '#111827').toUpperCase();
    return `<Style ss:ID="c_${xmlEscape(code)}"><Font ss:Bold="1" ss:Color="${coul}"/><Interior ss:Color="${teinte(coul)}" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center" ss:Vertical="Center"/></Style>`;
  };

  const hasDemiCA = Object.values(joursDemi || {}).some((m) => Object.keys(m).length > 0);
  const styles = `
  <Styles>
   <Style ss:ID="titre"><Font ss:Bold="1" ss:Size="14"/></Style>
   <Style ss:ID="entete"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#1E293B" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center" ss:Vertical="Center"/></Style>
   <Style ss:ID="employe"><Font ss:Bold="1"/></Style>
   <Style ss:ID="matricule"><Alignment ss:Horizontal="Center"/></Style>
   ${codesUtilises.map(styleCode).join('\n   ')}
   ${hasDemiCA ? '<Style ss:ID="c_CA_demi"><Font ss:Bold="1" ss:Color="#000000"/><Interior ss:Color="#E5E5E5" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center" ss:Vertical="Center"/></Style>' : ''}
   <Style ss:ID="total"><Font ss:Bold="1"/><Alignment ss:Horizontal="Center" ss:Vertical="Center"/></Style>
  </Styles>`;

  const cell = (styleId, valeur, type = 'String') => `<Cell ss:StyleID="${styleId}"><Data ss:Type="${type}">${xmlEscape(valeur)}</Data></Cell>`;

  const legendeTxt = codesUtilises.map((c) => `${c} = ${(codesMeta[c] || {}).libelle || c}`).join(' · ') || 'Aucune codification sur la période';

  let rows = '';
  rows += '<Row>' + cell('titre', 'Journal de paie') + '</Row>';
  rows += '<Row>' + cell('', `Période du ${fmtFR(debut)} au ${fmtFR(fin)} — ${legendeTxt}`) + '</Row>';
  rows += '<Row></Row>';
  rows += '<Row>' + cell('entete', 'Employé') + cell('entete', 'Matricule')
    + dates.map((iso) => cell('entete', fmtDateShort(iso))).join('')
    + cell('entete', 'Total') + '</Row>';

  for (const e of employes) {
    rows += '<Row>' + cell('employe', `${e.nom} ${e.prenom}`) + cell('matricule', e.matricule)
      + dates.map((iso) => {
        const codeCell = jours[e.id] ? jours[e.id][iso] : null;
        if (!codeCell) return '<Cell><Data ss:Type="String"></Data></Cell>';
        const isDemiCA = joursDemi && joursDemi[e.id] && joursDemi[e.id][iso];
        const styleId = isDemiCA ? 'c_CA_demi' : `c_${codeCell.split('/')[0]}`;
        return `<Cell ss:StyleID="${styleId}"><Data ss:Type="String">${codeCell}</Data></Cell>`;
      }).join('')
      + `<Cell ss:StyleID="total"><Data ss:Type="Number">${totalJoursEmp(e.id)}</Data></Cell>` + '</Row>';
  }

  rows += '<Row>' + cell('total', 'Total employés') + cell('total', '')
    + dates.map((iso) => `<Cell ss:StyleID="total"><Data ss:Type="Number">${countDate(iso)}</Data></Cell>`).join('')
    + `<Cell ss:StyleID="total"><Data ss:Type="Number">${employes.reduce((s, e) => s + totalJoursEmp(e.id), 0)}</Data></Cell>` + '</Row>';

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">${styles}
<Worksheet ss:Name="Journal de paie"><Table>
<Column ss:Width="150"/><Column ss:Width="70"/>${dates.map(() => '<Column ss:Width="28"/>').join('')}<Column ss:Width="45"/>
${rows}</Table></Worksheet></Workbook>`;

  res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="journal-paie-${debut}_${fin}.xls"`);
  res.send('\ufeff' + xml);
});

module.exports = router;
module.exports.computeStats = computeStats;
module.exports.codesPaie = codesPaie;
module.exports.nbJours = nbJours;
