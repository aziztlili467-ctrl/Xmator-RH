const { Router } = require('express');
const path = require('path');
const { db } = require('../db');
const { requireRole } = require('../middleware/auth');
const router = Router();

// Clôture automatique des sessions orphelines : toute session « connecte » sans heartbeat
// depuis plus de 5 minutes est considérée déconnectée (onglet fermé sans beacon, crash, …).
function cloreSessionsOrphelines() {
  db.prepare(`
    UPDATE sessions_appareils
    SET statut = 'deconnecte', date_deconnexion = datetime('now','localtime'),
        duree_secondes = CAST((julianday(datetime('now','localtime')) - julianday(date_connexion)) * 86400 AS INTEGER)
    WHERE statut = 'connecte'
      AND datetime(derniere_activite) < datetime('now', '-5 minutes')
  `).run();
}

// POST /api/appareils/heartbeat — battement de cœur du client (toutes les 60 s) :
// maintient la session « vivante ». Silencieux (204) pour ne pas polluer le mouchard.
router.post('/heartbeat', (req, res) => {
  const sid = Number((req.body || {}).session_id) || req.user.session_id;
  if (!sid) return res.status(400).json({ error: 'session_id manquant.' });
  const r = db.prepare(`
    UPDATE sessions_appareils SET derniere_activite = datetime('now','localtime')
    WHERE id = ? AND utilisateur_id = ? AND statut = 'connecte'
  `).run(sid, req.user.id);
  if (!r.changes) return res.status(404).json({ error: 'Session introuvable ou déjà terminée.' });
  return res.status(204).end();
});

// Filtres communs (liste + suppression)
function filtres(req) {
  const where = [];
  const params = [];
  const statut = String(req.query.statut || '').trim();
  if (statut === 'connecte' || statut === 'deconnecte') { where.push('s.statut = ?'); params.push(statut); }
  const type = String(req.query.type || '').trim();
  if (['pc', 'mobile', 'tablette', 'autre'].includes(type)) { where.push('s.type_appareil = ?'); params.push(type); }
  const utilisateur = String(req.query.utilisateur || '').trim();
  if (utilisateur) {
    where.push('(s.login LIKE ? OR s.login = ? OR s.utilisateur_id = ?)');
    params.push(`%${utilisateur}%`, utilisateur, isNaN(Number(utilisateur)) ? -1 : Number(utilisateur));
  }
  const debut = String(req.query.debut || '');
  const fin = String(req.query.fin || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(debut)) { where.push("date(s.date_connexion) >= date(?)"); params.push(debut); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(fin)) { where.push("date(s.date_connexion) <= date(?)"); params.push(fin); }
  return { where, params };
}

// GET /api/appareils-connectes — UNE LIGNE PAR APPAREIL (identifiant unique du navigateur,
// équivalent web de l'adresse MAC) avec toutes ses sessions agrégées.
// Colonnes : id appareil, login(s), nom appareil, type, nb sessions, 1re/dernière connexion,
// durée cumulée, statut global (connecté si au moins une session active sur l'appareil).
router.get('/appareils-connectes', (req, res) => {
  cloreSessionsOrphelines();
  const { where, params } = filtres(req);

  const rows = db.prepare(`
    SELECT s.identifiant_appareil, s.login, s.type_appareil, s.nom_appareil, s.statut,
           s.date_connexion, s.duree_secondes,
           CAST((julianday(datetime('now','localtime')) - julianday(s.date_connexion)) * 86400 AS INTEGER)
             AS duree_live_secondes
    FROM sessions_appareils s
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY s.id DESC
  `).all(...params);

  // Agrégation par appareil en JS (les durées live dépendent de chaque session active)
  const map = new Map();
  for (const r of rows) {
    const clef = r.identifiant_appareil || '(sans identifiant)';
    if (!map.has(clef)) {
      map.set(clef, {
        identifiant_appareil: r.identifiant_appareil || null,
        logins: new Set(),
        type_appareil: r.type_appareil,
        nom_appareil: r.nom_appareil,
        nb_sessions: 0,
        premiere_connexion: null,
        derniere_connexion: null,
        duree_totale_secondes: 0,
        connecte: false,
      });
    }
    const d = map.get(clef);
    d.logins.add(r.login);
    d.nb_sessions += 1;
    if (!d.premiere_connexion || r.date_connexion < d.premiere_connexion) d.premiere_connexion = r.date_connexion;
    if (!d.derniere_connexion || r.date_connexion > d.derniere_connexion) {
      d.derniere_connexion = r.date_connexion;
      d.nom_appareil = r.nom_appareil;
      d.type_appareil = r.type_appareil;
    }
    d.duree_totale_secondes += r.statut === 'connecte' ? (r.duree_live_secondes || 0) : (r.duree_secondes || 0);
    if (r.statut === 'connecte') d.connecte = true;
  }

  const lignes = [...map.values()].map((d) => ({
    ...d,
    logins: [...d.logins],
    login: [...d.logins].join(', '),
    statut: d.connecte ? 'connecte' : 'deconnecte',
  })).sort((a, b) => (b.derniere_connexion || '').localeCompare(a.derniere_connexion || ''));

  const totaux = {
    appareils: lignes.length,
    connectes: lignes.filter((l) => l.statut === 'connecte').length,
    pc: lignes.filter((l) => l.type_appareil === 'pc').length,
    mobile: lignes.filter((l) => l.type_appareil === 'mobile').length,
    tablette: lignes.filter((l) => l.type_appareil === 'tablette').length,
    sessions: rows.length,
  };
  res.json({ lignes, totaux });
});

// DELETE /api/appareils-connectes?debut=&fin= — supprime l'historique des sessions
// (tout l'historique sans paramètres ; sinon la période indiquée).
router.delete('/appareils-connectes', requireRole('super_admin'), (req, res) => {
  const debut = String(req.query.debut || '');
  const fin = String(req.query.fin || '');
  let r;
  if (/^\d{4}-\d{2}-\d{2}$/.test(debut) && /^\d{4}-\d{2}-\d{2}$/.test(fin)) {
    r = db.prepare("DELETE FROM sessions_appareils WHERE date(date_connexion) BETWEEN date(?) AND date(?)").run(debut, fin);
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(debut)) {
    r = db.prepare("DELETE FROM sessions_appareils WHERE date(date_connexion) >= date(?)").run(debut);
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(fin)) {
    r = db.prepare("DELETE FROM sessions_appareils WHERE date(date_connexion) <= date(?)").run(fin);
  } else {
    r = db.prepare('DELETE FROM sessions_appareils').run();
  }
  res.json({ ok: true, supprimees: r.changes });
});

// GET /api/appareils/pdf?debut=&fin= — PDF paysage des stats par appareil sur la période.
router.get('/pdf', requireRole('super_admin'), (req, res) => {
  cloreSessionsOrphelines();
  const { where, params } = filtres(req);
  const rows = db.prepare(`
    SELECT s.*,
           CAST((julianday(datetime('now','localtime')) - julianday(s.date_connexion)) * 86400 AS INTEGER)
             AS duree_live_secondes
    FROM sessions_appareils s
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY s.id DESC
  `).all(...params);

  // Même agrégation que la liste
  const map = new Map();
  for (const r of rows) {
    const clef = r.identifiant_appareil || '(sans identifiant)';
    if (!map.has(clef)) {
      map.set(clef, { identifiant: clef, logins: new Set(), type: r.type_appareil, nom: r.nom_appareil, nb: 0, prem: null, dern: null, duree: 0, connecte: false });
    }
    const d = map.get(clef);
    d.logins.add(r.login);
    d.nb += 1;
    if (!d.prem || r.date_connexion < d.prem) d.prem = r.date_connexion;
    if (!d.dern || r.date_connexion > d.dern) { d.dern = r.date_connexion; d.nom = r.nom_appareil; d.type = r.type_appareil; }
    d.duree += r.statut === 'connecte' ? (r.duree_live_secondes || 0) : (r.duree_secondes || 0);
    if (r.statut === 'connecte') d.connecte = true;
  }
  const appareils = [...map.values()].sort((a, b) => (b.dern || '').localeCompare(a.dern || ''));

  // Génération PDF (conventions identiques au mouchard)
  const PDFDocument = require('pdfkit');
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margins: { top: 40, bottom: 40, left: 40, right: 40 } });
  doc.registerFont('Garamond', path.join(__dirname, '..', 'fonts', 'EBGaramond.ttf'));
  res.setHeader('Content-Type', 'application/pdf');
  const stamp = `${String(req.query.debut || 'tout')}_${String(req.query.fin || 'tout')}`;
  res.setHeader('Content-Disposition', `attachment; filename="appareils_connectes_${stamp}.pdf"`);
  doc.pipe(res);

  const L = doc.page.margins.left;
  const R = doc.page.width - doc.page.margins.right;
  const W = R - L;
  const pageH = doc.page.height;

  const fmtDT = (iso) => (iso ? String(iso).replace('T', ' ') : '—');
  const fmtDuree = (sec) => {
    const s = Math.max(0, Math.round(sec || 0));
    const p = (n) => String(n).padStart(2, '0');
    return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
  };
  const TYPE_LABELS = { pc: 'PC', mobile: 'Mobile', tablette: 'Tablette', autre: 'Autre' };

  const periode = req.query.debut && req.query.fin
    ? `Période : du ${fmtDT(req.query.debut)} au ${fmtDT(req.query.fin)}`
    : 'Période : toutes les dates';

  const COLS = [
    { label: '#', w: 28 },
    { label: 'ID appareil', w: 210 },
    { label: 'Utilisateur(s)', w: 130 },
    { label: 'Appareil', w: 130 },
    { label: 'Type', w: 62 },
    { label: 'Sessions', w: 56 },
    { label: '1re connexion', w: 108 },
    { label: 'Dernière connexion', w: 108 },
    { label: 'Durée totale', w: 78 },
    { label: 'Statut', w: 60 },
  ];
  const rowH = 16;

  const drawHeader = (y) => {
    doc.font('Garamond').fontSize(15).fillColor('#1f2937').text('Amicale du Personnel de la Banque Centrale de Tunisie', L, y, { align: 'center', width: W, lineBreak: false });
    doc.font('Garamond').fontSize(19).fillColor('#111827').text('Appareils connectés', L, y + 18, { align: 'center', width: W, lineBreak: false });
    doc.font('Helvetica').fontSize(9).fillColor('#6b7280').text(`${periode} — ${appareils.length} appareil(s), ${rows.length} session(s)`, L, y + 39, { align: 'center', width: W, lineBreak: false });
    return y + 58;
  };

  const drawCols = (y) => {
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#111827');
    let x = L;
    for (const c of COLS) {
      doc.text(c.label, x + 3, y + 4, { width: c.w - 6, lineBreak: false });
      x += c.w;
    }
    doc.moveTo(L, y).lineTo(R, y).strokeColor('#111827').lineWidth(0.8).stroke();
    doc.moveTo(L, y + rowH).lineTo(R, y + rowH).strokeColor('#111827').lineWidth(0.8).stroke();
    return y + rowH;
  };

  let y = drawHeader(doc.page.margins.top);
  y = drawCols(y);
  let idx = 0;
  for (const a of appareils) {
    if (y + rowH > pageH - 50) {
      doc.addPage();
      y = drawHeader(doc.page.margins.top);
      y = drawCols(y);
    }
    const vals = [
      String(++idx),
      a.identifiant,
      [...a.logins].join(', '),
      String(a.nom || '—'),
      TYPE_LABELS[a.type] || a.type || '—',
      String(a.nb),
      fmtDT(a.prem),
      fmtDT(a.dern),
      fmtDuree(a.duree),
      a.connecte ? 'Connecté' : 'Déconnecté',
    ];
    let x = L;
    for (let i = 0; i < COLS.length; i++) {
      doc.font('Helvetica').fontSize(8).fillColor(i === COLS.length - 1 ? (a.connecte ? '#047857' : '#b91c1c') : '#111827');
      doc.text(vals[i], x + 3, y + 4, { width: COLS[i].w - 6, lineBreak: false, ellipsis: true });
      x += COLS[i].w;
    }
    doc.moveTo(L, y + rowH).lineTo(R, y + rowH).strokeColor('#d1d5db').lineWidth(0.5).stroke();
    y += rowH;
  }

  doc.font('Helvetica-Oblique').fontSize(8).fillColor('#6b7280')
    .text(`Document généré le ${new Date().toLocaleString('fr-FR')} — XMATOR RH`, L, Math.min(pageH - 40, y + 16), { lineBreak: false });
  const { drawPDFBrandFooter } = require('../utils/pdfBranding');
  drawPDFBrandFooter(doc, { footerText: 'Appareils connectés' });
  doc.end();
});

module.exports = router;
