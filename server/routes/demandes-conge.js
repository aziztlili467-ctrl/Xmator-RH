const { Router } = require('express');
const path = require('path');
const PDFDocument = require('pdfkit');
const { db, insertMouvement, isDebit, soldeCongeRestantDate } = require('../db');
const router = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function nextNumero() {
  return db.transaction(() => {
    const row = db.prepare('SELECT COALESCE(MAX(numero_sequentiel), 0) AS m FROM demandes_conge').get();
    return row.m + 1;
  })();
}

function nbJours(debut, fin) {
  const d1 = new Date(debut + 'T00:00:00');
  const d2 = new Date(fin + 'T00:00:00');
  if (isNaN(d1) || isNaN(d2) || d2 < d1) return null;
  // Source unique : calendrier administratif (jours_travail.heures > 0)
  // Si le calendrier n'est pas renseigné pour la période, fallback lun-ven
  const hasCal = db.prepare('SELECT 1 FROM jours_travail WHERE date >= ? AND date <= ? LIMIT 1').get(debut, fin);
  if (hasCal) {
    const r = db.prepare("SELECT COUNT(*) AS c FROM jours_travail WHERE date >= ? AND date <= ? AND heures > 0").get(debut, fin);
    return r.c;
  }
  let count = 0;
  const cur = new Date(d1);
  while (cur <= d2) {
    const wd = cur.getDay();
    if (wd !== 0 && wd !== 6) count += 1;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

const pad2 = (n) => String(n).padStart(2, '0');
const CODE_RMA_CONGE = 'CA';
const CODE_RMA_CE = 'CE';
const CODE_RMA_DEMI = 'DJ';
const codePourDemande = (d) => d.nature_conge === 'exceptionnel' ? CODE_RMA_CE : CODE_RMA_CONGE;

// Helpers synchronisation Demande ↔ Journal RMA + Journal des mouvements
function insererRMAForDemande(d) {
  const code = codePourDemande(d);
  const cur = new Date(d.date_debut + 'T00:00:00');
  const end = new Date(d.date_fin + 'T00:00:00');
  const ins = db.prepare('INSERT INTO codes_importes (employe_id, matricule, date, code, demi_journee) VALUES (?,?,?,?,?) ON CONFLICT(employe_id, date, code) DO UPDATE SET demi_journee = excluded.demi_journee');
  const legalSet = new Set(db.prepare("SELECT date FROM jours_travail WHERE date >= ? AND date <= ? AND heures > 0").all(d.date_debut, d.date_fin).map(r=>r.date));
  const hasCal = legalSet.size > 0 || db.prepare('SELECT 1 FROM jours_travail WHERE date >= ? AND date <= ? LIMIT 1').get(d.date_debut, d.date_fin);
  while (cur <= end) {
    const iso = `${cur.getFullYear()}-${pad2(cur.getMonth() + 1)}-${pad2(cur.getDate())}`;
    const ouvrable = hasCal ? legalSet.has(iso) : (cur.getDay() !== 0 && cur.getDay() !== 6);
    if (ouvrable) {
      // Dernier jour en demi-journée → code DJ (Demi-journée, noir) ; sinon le code couru (CA/CE)
      const demi = d.demi_journee && iso === d.date_fin ? 1 : 0;
      const c = demi ? CODE_RMA_DEMI : code;
      ins.run(d.employe_id, d.matricule, iso, c, demi);
    }
    cur.setDate(cur.getDate() + 1);
  }
}

function supprimerRMAForDemande(d) {
  const code = codePourDemande(d);
  db.prepare(`DELETE FROM codes_importes WHERE employe_id = ? AND date >= ? AND date <= ? AND code IN (?, ?)`).run(d.employe_id, d.date_debut, d.date_fin, code, CODE_RMA_DEMI);
}

// Vérifie si un mouvement RMA (per-date) existe déjà pour la période → évite double déduction
function rmaMouvementExistePourPeriode(employe_id, debut, fin) {
  const row = db.prepare("SELECT id FROM mouvements WHERE employe_id = ? AND type_operation = 'prelevement' AND solde_type = 'conge' AND motif LIKE 'RMA%' AND date_operation >= ? AND date_operation <= ? LIMIT 1").get(employe_id, debut, fin);
  return !!row;
}

const NOM_PRETEMPS = (e) => `${e.nom} ${e.prenom}`;

const BASE = `
  SELECT d.*, e.categorie_id, c.libelle AS categorie
  FROM demandes_conge d
  JOIN employes e ON e.id = d.employe_id
  JOIN categories c ON c.id = e.categorie_id
`;

router.get('/', (req, res) => {
  const { statut, employe, categorie, debut, fin, search } = req.query;
  let sql = BASE + ' WHERE 1=1';
  const params = [];
  if (statut) { sql += ' AND d.statut = ?'; params.push(statut); }
  if (employe) { sql += ' AND d.employe_id = ?'; params.push(Number(employe)); }
  if (categorie) { sql += ' AND e.categorie_id = ?'; params.push(Number(categorie)); }
  if (debut && DATE_RE.test(debut)) { sql += ' AND d.date_demande >= ?'; params.push(debut); }
  if (fin && DATE_RE.test(fin)) { sql += ' AND d.date_demande <= ?'; params.push(fin); }
  if (search) {
    sql += ' AND (d.matricule LIKE ? OR d.nom_prenom LIKE ?)';
    const p = `%${search}%`;
    params.push(p, p);
  }
  sql += ' ORDER BY d.numero_sequentiel DESC';
  res.json(db.prepare(sql).all(...params));
});

router.get('/:id', (req, res) => {
  const d = db.prepare(BASE + ' WHERE d.id = ?').get(req.params.id);
  if (!d) return res.status(404).json({ error: 'Demande introuvable.' });
  res.json(d);
});

router.post('/', (req, res) => {
  const { employe_id, nature_conge, date_demande, date_debut, date_fin, direction, nombre_jours, demi_journee } = req.body || {};

  if (!['legal', 'exceptionnel'].includes(nature_conge)) {
    return res.status(400).json({ error: 'La nature du congé doit être "legal" ou "exceptionnel".' });
  }
  const emp = db.prepare('SELECT id, matricule, nom, prenom FROM employes WHERE id = ?').get(Number(employe_id));
  if (!emp) return res.status(400).json({ error: 'Employé introuvable.' });
  for (const [k, v] of [['date_demande', date_demande], ['date_debut', date_debut], ['date_fin', date_fin]]) {
    if (!v || !DATE_RE.test(v)) return res.status(400).json({ error: `Date invalide pour ${k} (format AAAA-MM-JJ).` });
  }

  const doublon = db.prepare(`
    SELECT id, numero_sequentiel, date_debut, date_fin, statut
    FROM demandes_conge
    WHERE employe_id = ? AND date_debut = ? AND statut IN ('en_instance', 'acceptee')
  `).get(Number(employe_id), date_debut);
  if (doublon) {
    return res.status(409).json({
      error: `Une demande existe déjà pour le matricule ${emp.matricule} avec la même date de départ (${date_debut}) — N°${String(doublon.numero_sequentiel).padStart(3, '0')} (statut : ${doublon.statut}). Vérifiez pour éviter un doublon.`,
    });
  }

  let jours;
  if (nombre_jours !== undefined && nombre_jours !== null && nombre_jours !== '') {
    const v = Number(nombre_jours);
    // Demi-journées acceptées : tout multiple de 0,5 strictement positif (0,5 · 1 · 2,5 …)
    if (!Number.isFinite(v) || v <= 0 || (v * 2) % 1 !== 0) {
      return res.status(400).json({ error: 'Le nombre de jours saisi manuellement doit être un multiple de 0,5 positif (ex. : 0,5 pour une demi-journée, 2,5 pour deux jours et demi).' });
    }
    jours = v;
  } else {
    jours = nbJours(date_debut, date_fin);
    if (!jours) return res.status(400).json({ error: 'La date de fin doit être postérieure ou égale à la date de début.' });
    if (demi_journee) {
      jours -= 0.5;
      if (jours < 0.5) return res.status(400).json({ error: 'Une demi-journée nécessite au moins un jour ouvrable dans la période.' });
    }
  }
  // Normalisation demi-journée :
  // - valeur fractionnaire saisie manuellement sans la case => demi-journée sur le dernier jour
  // - case cochée mais valeur pleine saisie => le dernier jour passe à 0,5
  const plage = nbJours(date_debut, date_fin);
  let demi = demi_journee ? 1 : 0;
  if (!demi && !Number.isInteger(jours)) demi = 1;
  if (demi && plage !== null && jours === plage) {
    jours -= 0.5;
    if (jours < 0.5) return res.status(400).json({ error: 'Une demi-journée nécessite au moins un jour ouvrable dans la période.' });
  }

  const numero = nextNumero();
  const solde = soldeCongeRestantDate(Number(employe_id), date_demande);

  const r = db.prepare(`
    INSERT INTO demandes_conge
      (numero_sequentiel, employe_id, matricule, nom_prenom, direction, nature_conge,
       date_demande, date_debut, date_fin, nombre_jours, demi_journee, solde_a_la_demande, statut)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'en_instance')
  `).run(
    numero, Number(employe_id), emp.matricule, NOM_PRETEMPS(emp),
    direction || 'Amicale', nature_conge,
    date_demande, date_debut, date_fin, jours, demi, solde
  );
  const created = db.prepare(BASE + ' WHERE d.id = ?').get(r.lastInsertRowid);
  res.status(201).json(created);
});

router.post('/:id/accepter', (req, res) => {
  const d = db.prepare('SELECT * FROM demandes_conge WHERE id = ?').get(req.params.id);
  if (!d) return res.status(404).json({ error: 'Demande introuvable.' });
  if (d.statut === 'acceptee') {
    return res.status(400).json({ error: `Cette demande est déjà acceptée (N°${String(d.numero_sequentiel).padStart(3, '0')}).` });
  }
  if (!['en_instance', 'rejetee'].includes(d.statut)) {
    return res.status(400).json({ error: `Statut incompatible pour acceptation (actuel : ${d.statut}).` });
  }

  const estCE = d.nature_conge === 'exceptionnel';
  if (!estCE) {
    const soldeActuel = soldeCongeRestantDate(d.employe_id);
    if (d.nombre_jours > soldeActuel + 0.0001) {
      return res.status(400).json({
        error: `Solde insuffisant pour accepter cette demande. Solde disponible : ${soldeActuel} j, demandé : ${d.nombre_jours} j.`,
      });
    }
  }

  // Évite double déduction si la période a déjà été déduite via le RMA (import manuel CA) — CE jamais déduit
  const dejaDeduitViaRMA = !estCE && rmaMouvementExistePourPeriode(d.employe_id, d.date_debut, d.date_fin);

  try {
    const tx = db.transaction(() => {
      if (!estCE && !dejaDeduitViaRMA) {
        insertMouvement({
          employe_id: d.employe_id,
          type_operation: 'prelevement',
          date_operation: d.date_fin,
          jours: d.nombre_jours,
          motif: `Congé (validé) — Demande N°${String(d.numero_sequentiel).padStart(3, '0')}`,
        });
      }
      insererRMAForDemande(d);
      db.prepare(`UPDATE demandes_conge SET statut = 'acceptee', date_decision = datetime('now','localtime'), motif_rejet = NULL WHERE id = ?`).run(d.id);
    });
    tx();
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  res.json(db.prepare(BASE + ' WHERE d.id = ?').get(d.id));
});

router.post('/:id/rejeter', (req, res) => {
  const { motif_rejet } = req.body || {};
  const d = db.prepare('SELECT * FROM demandes_conge WHERE id = ?').get(req.params.id);
  if (!d) return res.status(404).json({ error: 'Demande introuvable.' });
  if (d.statut === 'rejetee') {
    return res.status(400).json({ error: `Cette demande est déjà rejetée (N°${String(d.numero_sequentiel).padStart(3, '0')}).` });
  }
  if (!['en_instance', 'acceptee'].includes(d.statut)) {
    return res.status(400).json({ error: `Statut incompatible pour rejet (actuel : ${d.statut}).` });
  }
  try {
    const tx = db.transaction(() => {
      // Si la demande était acceptée, le solde a déjà été débité : on le restaure et on nettoie le RMA (CE jamais débité)
      const estCE = d.nature_conge === 'exceptionnel';
      if (d.statut === 'acceptee') {
        if (!estCE) {
          insertMouvement({
            employe_id: d.employe_id,
            type_operation: 'ajout_annuel',
            date_operation: new Date().toISOString().split('T')[0],
            jours: d.nombre_jours,
            motif: `Annulation congé — Demande N°${String(d.numero_sequentiel).padStart(3, '0')} repassée en rejetée`,
            solde_type: 'conge',
          });
        }
        supprimerRMAForDemande(d);
      }
      db.prepare(`UPDATE demandes_conge SET statut = 'rejetee', date_decision = datetime('now','localtime'), motif_rejet = ? WHERE id = ?`)
        .run(motif_rejet ? String(motif_rejet).trim() : null, d.id);
    });
    tx();
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
  res.json(db.prepare(BASE + ' WHERE d.id = ?').get(d.id));
});

 // Suppression d'une demande (super_admin uniquement via requireModule — DELETE bloqué pour modérateur)
router.delete('/:id', (req, res) => {
  const d = db.prepare('SELECT * FROM demandes_conge WHERE id = ?').get(req.params.id);
  if (!d) return res.status(404).json({ error: 'Demande introuvable.' });
  try {
    const tx = db.transaction(() => {
      const estCE = d.nature_conge === 'exceptionnel';
      if (d.statut === 'acceptee') {
        // Restauration du solde : on crédite les jours prélevés et on nettoie le RMA (CE jamais débité)
        if (!estCE) {
          insertMouvement({
            employe_id: d.employe_id,
            type_operation: 'ajout_annuel',
            date_operation: new Date().toISOString().split('T')[0],
            jours: d.nombre_jours,
            motif: `Annulation congé — Demande N°${String(d.numero_sequentiel).padStart(3, '0')} supprimée`,
            solde_type: 'conge',
          });
        }
        supprimerRMAForDemande(d);
      }
      db.prepare('DELETE FROM demandes_conge WHERE id = ?').run(d.id);
    });
    tx();
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
  res.json({ ok: true, supprimee: d.numero_sequentiel });
});

router.get('/:id/pdf', (req, res) => {
  const d = db.prepare(BASE + ' WHERE d.id = ?').get(req.params.id);
  if (!d) return res.status(404).json({ error: 'Demande introuvable.' });

  const fmtFR = (iso) => {
    if (!iso) return '';
    const [y, m, day] = iso.split('T')[0].split('-');
    return `${day}/${m}/${y}`;
  };
  const n = String(d.numero_sequentiel).padStart(3, '0');
  const nature = d.nature_conge === 'legal' ? 'Légal' : 'Exceptionnel';
  // Demi-journées : affichage à la française (0,5 · 2,5) sur le formulaire imprimé
  const fmtJ = (v) => String(v).replace('.', ',');

  const doc = new PDFDocument({ size: 'A4', margins: { top: 18, bottom: 18, left: 60, right: 60 } });
  doc.registerFont('Amiri', path.join(__dirname, '..', 'fonts', 'Amiri-Regular.ttf'));
  doc.registerFont('Garamond', path.join(__dirname, '..', 'fonts', 'EBGaramond.ttf'));
  doc.registerFont('Playfair', path.join(__dirname, '..', 'fonts', 'PlayfairDisplay.ttf'));
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="demande-conge-N${n}.pdf"`);
  doc.pipe(res);

  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const L = doc.page.margins.left;
  const R = pageW - doc.page.margins.right;
  const W = R - L;
  const mid = pageW / 2;

  const noir = () => doc.font('Helvetica').fontSize(11).fillColor('#111827');
  const gras = () => doc.font('Helvetica-Bold').fontSize(11).fillColor('#111827');
  const numeroRouge = (y) => {
    doc.font('Helvetica-Bold').fontSize(13).fillColor('#e11d48').text(`N° ${n}`, L, y, { align: 'center', width: W, lineBreak: false });
  };
  const checkbox = (x, y) => {
    doc.rect(x, y, 11, 11).lineWidth(0.9).strokeColor('#111827').stroke();
  };
  const ligne = (label, valeur, y, indent = 0) => {
    noir().text(label, L + indent, y, { lineBreak: false });
    gras().text(valeur || '.............................', L + indent + doc.widthOfString(label) + 3, y, { width: W - indent - doc.widthOfString(label) - 20, lineBreak: false });
  };

  const drawFrame = () => {
    const t = 10;
    const b = doc.page.height - 10;
    const fl = 10;
    const fr = doc.page.width - 10;

    doc.lineWidth(2.5).strokeColor('#111111');
    doc.rect(fl, t, fr - fl, b - t).stroke();

    doc.lineWidth(0.8).strokeColor('#111111');
    doc.rect(fl + 5, t + 5, fr - fl - 10, b - t - 10).stroke();
  };

  drawFrame();

  numeroRouge(20);
  numeroRouge(796);

  doc.font('Garamond').fontSize(16).fillColor('#1f2937').text('Amicale du Personnel de la Banque Centrale de Tunisie', L, 50, { align: 'center', width: W, lineBreak: false });

  const titreY = 124;
  doc.font('Garamond').fontSize(24).fillColor('#111827').text('Demande de Congé', L, titreY, { align: 'center', width: W, lineBreak: false });
  doc.moveTo(L + 160, titreY + 30).lineTo(R - 160, titreY + 30).strokeColor('#111827').lineWidth(1).stroke();

  doc.font('Garamond').fontSize(11).fillColor('#374151').text(`Solde de congé : ${fmtJ(d.solde_a_la_demande)} jour(s)`, L, titreY + 40, { align: 'right', width: W, lineBreak: false });

  ligne('Nom et Prénom :', d.nom_prenom, 180);
  ligne('Direction :', `... ${d.direction} ........`, 210);
  ligne('Matricule :', `...${d.matricule}.................`, 240);
  ligne('Adresse et Téléphone :', '', 270);

  noir().text('Nature du congé :', L, 308);

  noir().text('Légal :', L, 336);
  checkbox(L + 60, 336);
  noir().text('Exceptionnel :', L, 366);
  checkbox(L + 96, 366);

  noir().text(`Du : ${fmtFR(d.date_debut)} au : ${fmtFR(d.date_fin)} inclus.`, L, 410);
  noir().text(`Nombre de jours : ${fmtJ(d.nombre_jours)}`, mid + 10, 410);

  doc.font('Helvetica').fontSize(10).fillColor('#374151').text('Signature du demandeur', L, 462, { width: 220, lineBreak: false });
  doc.font('Helvetica').fontSize(10).fillColor('#374151').text('Signature du Supérieur hiérarchique', mid + 10, 462, { width: 220, lineBreak: false });

  const dividerY = 502;
  doc.moveTo(L, dividerY).lineTo(R, dividerY).strokeColor('#cbd5e1').lineWidth(0.8).stroke();

  doc.font('Garamond').fontSize(18).fillColor('#111827').text('Titre De Congé', L, 526, { align: 'center', width: W, lineBreak: false });
  doc.moveTo(L + 190, 556).lineTo(R - 190, 556).strokeColor('#9ca3af').lineWidth(0.8).stroke();

  ligne('Nom et Prénom :', d.nom_prenom, 570);
  ligne('Direction :', `... ${d.direction} ........`, 600);
  ligne('Matricule :', `...${d.matricule}.................`, 630);

  noir().text(`Du : ${fmtFR(d.date_debut)} au : ${fmtFR(d.date_fin)} inclus.`, L, 670);
  noir().text(`Nombre de jours : ${fmtJ(d.nombre_jours)}`, mid + 10, 670);

  doc.font('Helvetica').fontSize(10).fillColor('#374151').text('Signature du Supérieur hiérarchique', mid + 10, 706, { width: 220, lineBreak: false });

  doc.font('Garamond').fontSize(12).fillColor('#111827').text('Exemplaire à conserver par le salarié', L, 762, { align: 'center', width: W, lineBreak: false });

  const { drawPDFBrandFooter } = require('../utils/pdfBranding');
  drawPDFBrandFooter(doc, { footerText: `Demande de congé N° ${n}` });
  doc.end();
});

module.exports = router;
