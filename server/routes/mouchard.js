const { Router } = require('express');
const path = require('path');
const { db } = require('../db');
const PDFDocument = require('pdfkit');
const router = Router();

const MODULES = ['employes', 'categories', 'soldes', 'demandes', 'maladie', 'statistiques', 'comptes', 'administration', 'horaires', 'calendrier'];
const ACTIONS = ['lire', 'ajouter', 'modifier', 'supprimer'];

const MODULE_LABELS = {
  employes: 'Employés',
  categories: 'Catégories',
  soldes: 'Soldes & opérations',
  demandes: 'Demandes de congé',
  maladie: 'Maladie',
  statistiques: 'Tableau de bord & stats',
  comptes: 'Comptes',
  administration: 'Sauvegarde & import',
  horaires: 'Horaires de travail',
  calendrier: 'Calendrier de l\'année',
};
const ACTION_LABELS = {
  lire: 'Lecture',
  ajouter: 'Ajout',
  modifier: 'Modification',
  supprimer: 'Suppression',
  login: 'Connexion',
  logout: 'Déconnexion',
  echec_login: 'Échec de connexion',
};
const ROLE_LABELS = {
  super_admin: 'Super Admin',
  consultation: 'Consultation',
  moderateur: 'Modérateur',
  employe: 'Employé',
};

function activiteVide() {
  const o = {};
  for (const m of MODULES) o[m] = { lire: 0, ajouter: 0, modifier: 0, supprimer: 0 };
  return o;
}
const totalVide = () => ({ lire: 0, ajouter: 0, modifier: 0, supprimer: 0 });

// Période demandée (paramètres ?debut=&fin=) → clause WHERE (dates incluses du début au fin)
function plage(req) {
  const debut = String(req.query.debut || '').trim();
  const fin = String(req.query.fin || '').trim();
  const clauses = [];
  const vals = [];
  if (debut) {
    clauses.push('created_at >= ?');
    vals.push(`${debut} 00:00:00`);
  }
  if (fin) {
    clauses.push('created_at <= ?');
    vals.push(`${fin} 23:59:59`);
  }
  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', vals, debut, fin };
}

const fmtDateFR = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};
const fmtDateTimeFR = (iso) => {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : fmtDateFR(String(iso).slice(0, 10));
};

// GET /api/mouchard — statistiques d'activité par compte + journal des événements récents
router.get('/', (req, res) => {
  const comptes = db.prepare(`
    SELECT u.id, u.login, u.role, u.actif, u.derniere_connexion, e.nom, e.prenom, e.matricule
    FROM utilisateurs u
    LEFT JOIN employes e ON e.id = u.employe_id
    ORDER BY u.id
  `).all();

  const aggs = db.prepare(`
    SELECT login, module, action, COUNT(*) AS n
    FROM audit_logs
    WHERE action IN ('lire','ajouter','modifier','supprimer')
      AND statut >= 200 AND statut < 300
    GROUP BY login, module, action
  `).all();

  const conns = db.prepare(`
    SELECT login, COUNT(*) AS n, MAX(created_at) AS derniere
    FROM audit_logs WHERE action = 'login'
    GROUP BY login
  `).all();

  const loginsSupprimes = db.prepare(`
    SELECT DISTINCT login FROM audit_logs
    WHERE login NOT IN (SELECT login FROM utilisateurs)
  `).all().map((r) => r.login);

  const byLogin = {};
  for (const a of aggs) {
    if (!byLogin[a.login]) byLogin[a.login] = { activite: activiteVide(), total: totalVide() };
    if (byLogin[a.login].activite[a.module] && byLogin[a.login].activite[a.module][a.action] !== undefined) {
      byLogin[a.login].activite[a.module][a.action] = a.n;
      byLogin[a.login].total[a.action] += a.n;
    }
  }
  const connByLogin = {};
  for (const c of conns) connByLogin[c.login] = { n: c.n, derniere: c.derniere };

  const build = (u, deleted) => {
    const base = byLogin[u.login] || { activite: activiteVide(), total: totalVide() };
    const conn = connByLogin[u.login];
    return {
      id: u.id,
      login: u.login,
      role: u.role,
      actif: u.actif,
      nom_prenom: u.nom && u.prenom ? `${u.nom} ${u.prenom}` : null,
      matricule: u.matricule,
      supprime: deleted || false,
      connexions: conn ? conn.n : 0,
      derniere_connexion: conn ? conn.derniere : u.derniere_connexion || null,
      activite: base.activite,
      total: base.total,
    };
  };

  const result = comptes.map((u) => build(u, false));
  for (const lg of loginsSupprimes) {
    const dernier = db.prepare('SELECT role FROM audit_logs WHERE login = ? ORDER BY id DESC LIMIT 1').get(lg);
    result.push(build({ id: null, login: lg, role: dernier ? dernier.role : null, actif: 0, nom: null, prenom: null, matricule: null, derniere_connexion: null }, true));
  }
  result.sort((a, b) => String(a.login).localeCompare(String(b.login), 'fr'));

  const evenements = db.prepare(`
    SELECT id, login, role, action, module, detail, statut, ip, created_at
    FROM audit_logs ORDER BY id DESC LIMIT 100
  `).all();

  const totaux = { connexions: 0, operations: 0, evenements: db.prepare('SELECT COUNT(*) AS n FROM audit_logs').get().n };
  for (const c of result) {
    totaux.connexions += c.connexions;
    totaux.operations += c.total.lire + c.total.ajouter + c.total.modifier + c.total.supprimer;
  }

  res.json({ comptes: result, evenements, totaux });
});

// GET /api/mouchard/export?debut=&fin= — télécharger les événements d'une période (fichier JSON)
router.get('/export', (req, res) => {
  const { where, vals, debut, fin } = plage(req);
  if (debut && fin && fin < debut) return res.status(400).json({ error: 'La date de fin doit être postérieure ou égale à la date de début.' });
  const evenements = db.prepare(`
    SELECT id, utilisateur_id, login, role, action, module, detail, statut, ip, created_at
    FROM audit_logs ${where} ORDER BY id
  `).all(...vals);
  const nom = `mouchard-evenements_${debut || 'tout'}_${fin || 'tout'}.json`;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${nom}"`);
  res.send(JSON.stringify({ exporte_le: new Date().toISOString(), debut: debut || null, fin: fin || null, count: evenements.length, evenements }, null, 2));
});

// POST /api/mouchard/restaurer — réinsérer des événements depuis le fichier téléchargé
router.post('/restaurer', (req, res) => {
  const list = Array.isArray(req.body && req.body.evenements) ? req.body.evenements : null;
  if (!list) return res.status(400).json({ error: 'Fichier invalide : un tableau "evenements" est attendu.' });
  if (list.length === 0) return res.json({ ok: true, importes: 0, ignores: 0 });

  const existe = db.prepare(`
    SELECT COUNT(*) AS n FROM audit_logs
    WHERE login = ? AND action = ? AND IFNULL(module,'') = ? AND IFNULL(detail,'') = ?
      AND IFNULL(statut,-1) = IFNULL(?,-1) AND IFNULL(ip,'') = ? AND created_at = ?
  `);
  const insert = db.prepare(`
    INSERT INTO audit_logs (utilisateur_id, login, role, action, module, detail, statut, ip, created_at)
    VALUES (?,?,?,?,?,?,?,?,?)
  `);

  const tx = db.transaction((rows) => {
    let importes = 0;
    let ignores = 0;
    for (const r of rows) {
      const login = String(r.login || '?');
      const action = String(r.action || '');
      const module = r.module == null ? null : String(r.module);
      const detail = r.detail == null ? null : String(r.detail);
      const statut = r.statut == null ? null : Number(r.statut);
      const ip = r.ip == null ? null : String(r.ip);
      const created = r.created_at == null ? null : String(r.created_at);
      const dup = existe.get(login, action, module || '', detail || '', statut, ip || '', created || '');
      if (dup.n > 0) {
        ignores += 1;
        continue;
      }
      insert.run(r.utilisateur_id || null, login, r.role || null, action, module, detail, statut, ip, created);
      importes += 1;
    }
    return { importes, ignores };
  });

  const result = tx(list);
  res.json({ ok: true, ...result });
});

// GET /api/mouchard/pdf?debut=&fin= — imprimer les événements d'une période (PDF)
router.get('/pdf', (req, res) => {
  const { where, vals, debut, fin } = plage(req);
  if (debut && fin && fin < debut) return res.status(400).json({ error: 'La date de fin doit être postérieure ou égale à la date de début.' });
  const evenements = db.prepare(`
    SELECT id, login, role, action, module, detail, statut, ip, created_at
    FROM audit_logs ${where} ORDER BY id
  `).all(...vals);

  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margins: { top: 40, bottom: 40, left: 40, right: 40 } });
  doc.registerFont('Garamond', path.join(__dirname, '..', 'fonts', 'EBGaramond.ttf'));
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="mouchard-evenements_${debut || 'tout'}_${fin || 'tout'}.pdf"`);
  doc.pipe(res);

  const L = doc.page.margins.left;
  const R = doc.page.width - doc.page.margins.right;
  const W = R - L;
  const pageH = doc.page.height;

  const COLS = [
    { label: '#', w: 28 },
    { label: 'Date & heure', w: 92 },
    { label: 'Login', w: 100 },
    { label: 'Rôle', w: 78 },
    { label: 'Action', w: 88 },
    { label: 'Rubrique', w: 108 },
    { label: 'Détail', w: 232 },
    { label: 'Statut', w: 36 },
  ];
  const rowH = 16;

  const periode = debut && fin
    ? `Période : du ${fmtDateFR(debut)} au ${fmtDateFR(fin)}`
    : debut
      ? `Période : à partir du ${fmtDateFR(debut)}`
      : fin
        ? `Période : jusqu'au ${fmtDateFR(fin)}`
        : 'Période : toutes les dates';

  const drawHeader = (y) => {
    doc.font('Garamond').fontSize(15).fillColor('#1f2937').text('Amicale du Personnel de la Banque Centrale de Tunisie', L, y, { align: 'center', width: W, lineBreak: false });
    doc.font('Garamond').fontSize(19).fillColor('#111827').text('Journal des activités (Mouchard)', L, y + 18, { align: 'center', width: W, lineBreak: false });
    doc.font('Helvetica').fontSize(9).fillColor('#6b7280').text(`${periode} — ${evenements.length} événement(s)`, L, y + 39, { align: 'center', width: W, lineBreak: false });
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

  const drawRow = (ev, idx, y) => {
    const vals = [
      String(idx + 1),
      fmtDateTimeFR(ev.created_at),
      String(ev.login || '?'),
      ROLE_LABELS[ev.role] || ev.role || '—',
      ACTION_LABELS[ev.action] || ev.action || '—',
      MODULE_LABELS[ev.module] || ev.module || '—',
      String(ev.detail || ''),
      ev.statut == null ? '' : String(ev.statut),
    ];
    let x = L;
    for (let i = 0; i < COLS.length; i++) {
      doc.font('Helvetica').fontSize(8).fillColor('#111827');
      doc.text(vals[i], x + 3, y + 4, { width: COLS[i].w - 6, lineBreak: false, ellipsis: true });
      x += COLS[i].w;
    }
    doc.moveTo(L, y + rowH).lineTo(R, y + rowH).strokeColor('#d1d5db').lineWidth(0.5).stroke();
    let vx = L;
    for (const c of COLS) {
      vx += c.w;
      doc.moveTo(vx, y).lineTo(vx, y + rowH).strokeColor('#e5e7eb').lineWidth(0.4).stroke();
    }
    return y + rowH;
  };

  let y = drawHeader(32);
  y = drawCols(y);
  if (evenements.length === 0) {
    doc.font('Helvetica').fontSize(10).fillColor('#6b7280').text('Aucun événement sur la période demandée.', L, y + 16, { align: 'center', width: W });
  }
  evenements.forEach((ev, idx) => {
    if (y + rowH > pageH - 40) {
      doc.addPage();
      y = drawHeader(32);
      y = drawCols(y);
    }
    y = drawRow(ev, idx, y);
  });

  doc.end();
});

// DELETE /api/mouchard?debut=&fin= — supprimer les événements d'une période (tout si aucune période)
router.delete('/', (req, res) => {
  const { where, vals, debut, fin } = plage(req);
  if (debut && fin && fin < debut) return res.status(400).json({ error: 'La date de fin doit être postérieure ou égale à la date de début.' });
  const info = db.prepare(`DELETE FROM audit_logs ${where}`).run(...vals);
  res.json({ ok: true, supprimes: info.changes });
});

module.exports = router;