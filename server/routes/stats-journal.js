const { Router } = require('express');
const path = require('path');
const { db } = require('../db');
const { loadContext, estOuvrable, reposFor } = require('../utils/jourOuvrable');
const { departementsPresenceDefaut, normaliserDept } = require('../utils/presenceDefaut');
const { buildPdf } = require('../utils/pdfJournal');
const router = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Jour ouvrable pour UN employé : calendrier (fait foi) si l'année est configurée, sinon jour de
// semaine hors repos hebdomadaire de sa catégorie (le samedi travaillé, ex. Femme de ménage, compte).
function dayOuvrable(ctx, categorieId, iso, legalByDate) {
  if (legalByDate && Object.keys(legalByDate).length > 0) return estOuvrable(ctx, categorieId, iso, legalByDate[iso]);
  return !reposFor(categorieId).has(new Date(iso + 'T00:00:00').getDay());
}

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
function computeStats(debut, fin, matricule) {
  let sqlEmp = `
    SELECT e.id, e.matricule, e.nom, e.prenom, e.departement, e.categorie_id, c.libelle AS categorie
    FROM employes e
    JOIN categories c ON c.id = e.categorie_id
    WHERE e.actif = 1
  `;
  const paramsEmp = [];
  if (matricule) {
    sqlEmp += ' AND (e.matricule = ? OR CAST(e.matricule AS INTEGER) = ?)';
    const n = parseInt(matricule, 10);
    paramsEmp.push(String(matricule).trim(), isNaN(n) ? -1 : n);
  }
  sqlEmp += ' ORDER BY CAST(e.matricule AS INTEGER), e.matricule';
  const employes = db.prepare(sqlEmp).all(...paramsEmp);

  const dates = listDates(debut, fin);
  // Calendrier administratif (ligne complète source/label) + repos hebdomadaire par catégorie :
  // le samedi resté travaillé (ex. Femme de ménage) compte dans CODIFIÉS comme les autres jours.
  const legalRows = db.prepare("SELECT date, heures, source, label FROM jours_travail WHERE date >= ? AND date <= ?").all(debut, fin);
  const legalByDate = {};
  for (const r of legalRows) legalByDate[r.date] = r;
  const ctx = loadContext();
  const empCat = Object.fromEntries(employes.map((e) => [e.id, e.categorie_id]));
  const isOuvrableEmp = (empId, iso) => dayOuvrable(ctx, empCat[empId], iso, legalByDate);

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
    if ((r.demi_journee && r.code === 'CA') || r.code === 'DJ') {
      if (!joursDemi[r.employe_id]) joursDemi[r.employe_id] = {};
      joursDemi[r.employe_id][r.jour] = true;
    }
  }

  // Présence par défaut : les employés des départements configurés (ex. Comptoir) sont considérés
  // PRÉSENTS (P1) sur leurs jours ouvrables selon le calendrier. Une codification déjà insérée
  // (pointage badgeuse ou Journal RMA : MA, CA, CE, A1…) remplace automatiquement cet état — on
  // ne remplit que les cases vides, après fusion des pointages et des codifications.
  // Jours à VENIR : figés — seuls les jours ≤ date système du jour sont « pris par défaut » ;
  // le lendemain d'un jour s'affiche uniquement quand la date système l'atteint.
  const deptsDefaut = new Set(departementsPresenceDefaut().map(normaliserDept));
  const aujourdhui = toISO(new Date());
  if (deptsDefaut.size) {
    for (const e of employes) {
      if (!deptsDefaut.has(normaliserDept(e.departement))) continue;
      for (const iso of dates) {
        if (iso > aujourdhui || (jours[e.id] && jours[e.id][iso])) continue;
        if (isOuvrableEmp(e.id, iso)) {
          if (!jours[e.id]) jours[e.id] = {};
          jours[e.id][iso] = 'P1';
        }
      }
    }
  }

  // Totaux synchronisés avec le dashboard : seulement les jours ouvrables comptent.
  // Demi-journée (CA en demi ou DJ) = 0.5 (même règle dashboard) ; P1 sur férié/WE = 0.
  const parCode = {};
  let total = 0;
  for (const [empId, jmap] of Object.entries(jours)) {
    for (const [iso, cell] of Object.entries(jmap)) {
      if (!isOuvrableEmp(empId, iso)) continue;
      for (const c of String(cell).split('/')) {
        if ((c === 'CA' && joursDemi[empId] && joursDemi[empId][iso]) || c === 'DJ') {
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
  const { debut, fin, matricule } = req.query;
  if (!debut || !fin || !DATE_RE.test(debut) || !DATE_RE.test(fin)) {
    return res.status(400).json({ error: 'Paramètres debut et fin requis au format AAAA-MM-JJ.' });
  }
  if (fin < debut) return res.status(400).json({ error: 'La date de fin doit être postérieure ou égale à la date de début.' });

  res.json({
    ...computeStats(debut, fin, matricule),
    // Métadonnées des codes (couleur + libellé) pour l'affichage coloré — accessibles à tous les rôles en lecture
    codes: db.prepare('SELECT code, libelle, couleur FROM codes_paie ORDER BY code').all(),
  });
});

// ---- Export PDF (modèle identique RMA - voir server/utils/pdfJournal.js) ----
router.get('/pdf', (req, res) => {
  const { debut, fin, matricule, orientation } = req.query;
  if (!debut || !fin || !DATE_RE.test(debut) || !DATE_RE.test(fin)) {
    return res.status(400).json({ error: 'Paramètres debut et fin requis au format AAAA-MM-JJ.' });
  }
  if (fin < debut) return res.status(400).json({ error: 'La date de fin doit être postérieure ou égale à la date de début.' });
  const { dates, employes, jours, joursDemi, totaux } = computeStats(debut, fin, matricule);
  return buildPdf({
    res, debut, fin, dates, employes, jours, joursDemi, totaux,
    titre: 'Journal de paie',
    orientation: orientation === 'portrait' ? 'portrait' : 'landscape',
  });
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
  const { debut, fin, matricule } = req.query;
  if (!debut || !fin || !DATE_RE.test(debut) || !DATE_RE.test(fin)) {
    return res.status(400).json({ error: 'Paramètres debut et fin requis au format AAAA-MM-JJ.' });
  }
  if (fin < debut) return res.status(400).json({ error: 'La date de fin doit être postérieure ou égale à la date de début.' });

  const stats = computeStats(debut, fin, matricule);
  const { dates, employes, jours, joursDemi } = stats;
  const codesMeta = codesPaie();
  // Styles générés par code présent dans la période (cellules colorées selon la codification)
  const codesUtilises = Object.keys(stats.totaux.par_code || {}).sort();

  // Totaux XLS synchronisés dashboard : ouvrables PAR CATÉGORIE uniquement, CA demi = 0.5
  const legalRowsXls = db.prepare("SELECT date, heures, source, label FROM jours_travail WHERE date >= ? AND date <= ?").all(debut, fin);
  const legalByDateXls = {};
  for (const r of legalRowsXls) legalByDateXls[r.date] = r;
  const ctxXls = loadContext();
  const empCatXls = Object.fromEntries(employes.map((e) => [e.id, e.categorie_id]));
  const isOuvEmp = (id, iso) => dayOuvrable(ctxXls, empCatXls[id], iso, legalByDateXls);
  const totalJoursEmp = (id) => {
    if (!jours[id]) return 0;
    let s=0;
    for (const [iso,cell] of Object.entries(jours[id])) {
      if (!isOuvEmp(id, iso)) continue;
      for (const c of String(cell).split('/')) { if ((c==='CA' && joursDemi[id] && joursDemi[id][iso]) || c==='DJ') s+=0.5; else s+=1; }
    }
    return Math.round(s*2)/2;
  };
  const countDate = (iso) => {
    let s=0;
    for (const e of employes) {
      if (!isOuvEmp(e.id, iso)) continue;
      const cell=jours[e.id]?jours[e.id][iso]:null;
      if (!cell) continue;
      for (const c of String(cell).split('/')) { if ((c==='CA' && joursDemi[e.id] && joursDemi[e.id][iso]) || c==='DJ') s+=0.5; else s+=1; }
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
