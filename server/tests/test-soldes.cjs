// Tests critiques — cohérence du solde canonique (P9-P11) : source de vérité codes_importes,
// correction-solde à la baisse réellement décomptée, clear-soldes (remise à zéro + purge RMA CA/DJ),
// mode historique : refus d'un prélèvement sans période. DB temporaire isolée.
const path = require('path');
const { withServer, ROOT } = require('./harness.cjs');

const BETTER = path.join(ROOT, 'server', 'node_modules', 'better-sqlite3');

let OK = 0;
function eq(a, b, label) { if (a !== b) throw new Error(`${label} : attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`); OK++; }
function ok(v, label) { if (!v) throw new Error(`${label} : échec`); OK++; }

let token = null;

async function api(base, p, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(`${base}/${p}`, { ...opts, headers });
  let body = null;
  try { body = await r.json(); } catch {}
  return { status: r.status, body };
}

async function tests(srv, port) {
  const base = `http://127.0.0.1:${port}/api`;

  const login = await api(base, 'auth/login', { method: 'POST', body: JSON.stringify({ login: 'Xmator', password: 'SuperPass!1' }) });
  eq(login.status, 200, 'login 200');
  token = login.body.token;

  const cat = await api(base, 'categories', { method: 'POST', body: JSON.stringify({ libelle: 'Cadre teste' }) });
  eq(cat.status, 201, 'création catégorie');
  const catId = cat.body.id;
  const emp = await api(base, 'employes', { method: 'POST', body: JSON.stringify({ matricule: '9001', nom: 'TEST', prenom: 'Unite', categorie_id: catId }) });
  eq(emp.status, 201, 'création employé');
  const empId = emp.body.id;

  const bal = await api(base, 'mouvements/balances', { method: 'POST', body: JSON.stringify({ employe_id: empId, type_operation: 'solde_initial', date_debut: '2026-01-01', date_fin: '2026-01-01', jours: 20, motif: 'Droit annuel' }) });
  eq(bal.status, 201, 'solde initial 20');
  eq(bal.body.solde, 20, 'solde après solde initial');

  const dbfile = srv.db;
  const db = require(BETTER)(dbfile);
  const ins = db.prepare('INSERT INTO codes_importes (employe_id, matricule, date, code) VALUES (?, ?, ?, ?)');
  ins.run(empId, '9001', '2026-03-02', 'CA');
  ins.run(empId, '9001', '2026-03-03', 'CA');
  db.close();

  const j1 = await api(base, `mouvements/journal-solde/${empId}`);
  eq(j1.status, 200, 'journal-solde 200');
  eq(j1.body.solde, 18, 'solde 18 (20 − 2 CA de la grille)');

  const cor1 = await api(base, 'mouvements/correction-solde', { method: 'POST', body: JSON.stringify({ employe_id: empId, nouveau_solde: 12, date_operation: '2026-06-01', motif: 'test baisse' }) });
  eq(cor1.status, 201, 'correction 18→12 acceptée');
  const j2 = await api(base, `mouvements/journal-solde/${empId}`);
  eq(j2.body.solde, 12, 'solde 12 après correction à la baisse');
  ok(j2.body.lignes.some((l) => l.signe < 0 && l.motif && String(l.motif).startsWith('Correction de solde')), 'journal contient la ligne de correction');

  const cor2 = await api(base, 'mouvements/correction-solde', { method: 'POST', body: JSON.stringify({ employe_id: empId, nouveau_solde: 15, date_operation: '2026-07-01', motif: 'test hausse' }) });
  eq(cor2.status, 201, 'correction 12→15 acceptée');
  const j3 = await api(base, `mouvements/journal-solde/${empId}`);
  eq(j3.body.solde, 15, 'solde 15 après correction à la hausse');

  const hist = await api(base, 'mouvements', { method: 'POST', body: JSON.stringify({ employe_id: empId, type_operation: 'prelevement', date_operation: '2026-08-01', jours: 2 }) });
  eq(hist.status, 400, 'prélèvement mode historique refusé');
  ok(/Journal RMA|historique/i.test(hist.body.error || ''), 'message d\'erreur explicite');
  const j4 = await api(base, `mouvements/journal-solde/${empId}`);
  eq(j4.body.solde, 15, 'solde inchangé (15) après refus');

  const hist2 = await api(base, 'mouvements', { method: 'POST', body: JSON.stringify({ employe_id: empId, type_operation: 'ajout_annuel', date_operation: '2026-08-15', jours: 2, motif: 'reliquat' }) });
  eq(hist2.status, 201, 'ajout_annuel mode historique accepté');
  const j5 = await api(base, `mouvements/journal-solde/${empId}`);
  eq(j5.body.solde, 17, 'solde 17 après ajout historique');

  const clr = await api(base, 'mouvements/clear-soldes', { method: 'POST', body: JSON.stringify({ employe_id: empId }) });
  eq(clr.status, 200, 'clear-soldes 200');
  ok(clr.body.ok, 'clear-soldes ok');
  const j6 = await api(base, `mouvements/journal-solde/${empId}`);
  eq(j6.body.solde, 0, 'solde remis à 0');
  eq(j6.body.lignes.length, 0, 'journal vide après clear-soldes');
  const db2 = require(BETTER)(dbfile);
  const rma = db2.prepare("SELECT COUNT(*) n FROM codes_importes WHERE employe_id = ? AND code IN ('CA','DJ')").get(empId).n;
  const mvts = db2.prepare("SELECT COUNT(*) n FROM mouvements WHERE employe_id = ? AND solde_type = 'conge'").get(empId).n;
  db2.close();
  eq(rma, 0, 'cellules CA/DJ purgées de codes_importes');
  eq(mvts, 0, 'mouvements de congé purgés');
}

(async () => {
  console.log('=== TEST CRITIQUE — SOLDES (P9-P11) ===');
  await withServer(4220, {}, (srv) => tests(srv, 4220), { showLogs: false });
  console.log(`${OK} ASSERTIONS OK`);
})().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});