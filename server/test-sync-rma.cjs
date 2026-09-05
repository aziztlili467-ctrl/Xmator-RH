const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, '..', 'data', 'amicale.db'), { readonly: true });
const BASE = 'http://localhost:4000/api';
const EMP = 104;

let failures = 0;
let h = {};
const ok = (cond, label, extra) => {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label} ${extra !== undefined ? '-> ' + JSON.stringify(extra) : ''}`); }
};
const inl = (n) => Math.round(Number(n) * 1000) / 1000;

async function api(path_, opts = {}) {
  const res = await fetch(BASE + path_, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const txt = await res.text();
  let body = null;
  try { body = txt ? JSON.parse(txt) : null; } catch { body = txt; }
  return { status: res.status, body };
}

async function journalSolde() {
  const r = await api('/mouvements/journal-solde/' + EMP, { headers: h });
  return r.body;
}

// Références (2026-09-05, règle « toute cellule CA/DJ de la grille RMA = jour consommé ») :
//   • emp 104 : accorde=59, consomme=22, solde=37 — 22 lignes CA/DJ (dont 2026-05-29 = férié
//     Aïd el-Kebir), TOUTES décomptées.
//   • global : accordeAnnee≈1929.5, consommeAnnee=1554.5, soldeGlobal≈374.
//     (avant : fériés/week-ends exclus → consommeAnnee=1463.5, soldeGlobal=465 ; 91 j non décomptés)
(async () => {
  // 1) Login
  const login = await api('/auth/login', { method: 'POST', body: JSON.stringify({ login: 'Xmator', password: 'Malikoo1984++', device_id: 'e2e-test' }) });
  ok(login.status === 200 && login.body && login.body.token, 'login admin', login);
  h = { Authorization: 'Bearer ' + login.body.token };

  // 2) Basline « Éditer solde de congé »
  const b0 = await journalSolde();
  ok(b0 && b0.employe && b0.employe.id === EMP, 'journal-solde/104 accessible', b0 && b0.employe);
  console.log(`  baseline: accorde=${inl(b0.accorde)} consomme=${inl(b0.consomme)} solde=${inl(b0.solde)} lignes=${b0.lignes.length}`);
  const lignesCA = b0.lignes.filter((l) => l.source === 'codes_importes');
  ok(lignesCA.length >= 22, `toutes les lignes RMA CA/DJ visibles (>=22), trouvées=${lignesCA.length}`);
  ok(lignesCA.filter((l) => l.deduit === true).length === 22, `lignes décomptées = 22 (aucune exclue), trouvées=${lignesCA.filter((l) => l.deduit === true).length}`);
  ok(b0.solde === 37, 'solde de référence = 37 (le CA du 29/05, jour férié, est décompté)');
  const ferie = lignesCA.find((l) => l.date_operation === '2026-05-29');
  ok(!!ferie && ferie.deduit === true, 'CA du 2026-05-29 (Aïd el-Kebir) décompté dans le journal du solde', ferie);

  // 3) Choisir un jour ouvrable libre en juin 2026 pour l’elles que nous créons le round-trip
  const libre = db.prepare(`
    SELECT jt.date FROM jours_travail jt
    WHERE jt.annee=2026 AND jt.heures>0 AND strftime('%w', jt.date) NOT IN ('0','6')
      AND NOT EXISTS (SELECT 1 FROM codes_importes ci WHERE ci.employe_id=? AND ci.date=jt.date)
      AND NOT EXISTS (SELECT 1 FROM demandes_conge dc WHERE dc.employe_id=? AND dc.statut='acceptee' AND dc.date_debut<=jt.date AND dc.date_fin>=jt.date)
      AND jt.date BETWEEN '2026-06-01' AND '2026-06-30' ORDER BY jt.date LIMIT 1
  `).get(EMP, EMP);
  ok(!!libre, 'jour d’essai trouvé', libre);
  const D = libre.date;
  console.log(`  jour d'essai = ${D}`);

  // 4) AJOUT d'une demi-journée (DJ) via la grille RMA
  let r = await api('/journal-rma/update', { method: 'PUT', headers: h, body: JSON.stringify({ employe_id: EMP, date: D, nouveau_code: 'DJ' }) });
  ok(r.status === 200 && r.body.ok, 'PUT update: ajout DJ', r.body);
  let j = await journalSolde();
  ok(inl(j.solde) === inl(b0.solde - 0.5), `après ajout DJ: solde ${inl(b0.solde)} -> ${inl(j.solde)} (attendu ${inl(b0.solde - 0.5)})`, j.solde);
  ok(inl(j.consomme) === inl(b0.consomme + 0.5), `consommé +0,5 -> ${j.consomme}`);

  // 5) RECTIFICATION DJ → CA (demi-journée → journée pleine)
  r = await api('/journal-rma/update', { method: 'PUT', headers: h, body: JSON.stringify({ employe_id: EMP, date: D, ancien_code: 'DJ', nouveau_code: 'CA' }) });
  ok(r.status === 200 && r.body.ok, 'PUT update: rectif DJ->CA', r.body);
  j = await journalSolde();
  ok(inl(j.solde) === inl(b0.solde - 1), `après rectif DJ->CA: solde ${inl(b0.solde - 1)} (attendu, pas de crédit double)`, j.solde);
  const mvtUpdate = db.prepare("SELECT jours, motif FROM mouvements WHERE employe_id=? AND type_operation='prelevement' AND solde_type='conge' AND motif LIKE 'RMA%' AND motif LIKE '%du " + D + "%' ORDER BY id LIMIT 1").get(EMP);
  ok(!!mvtUpdate && mvtUpdate.jours === 1, `prélèvement RMA ajusté à 1j (trouvé ${mvtUpdate ? mvtUpdate.jours : '?'})`, mvtUpdate);

  // 6) SUPPRESSION de la cellule CA → retour à l'exact ligne de base
  r = await api('/journal-rma/cell?employe_id=' + EMP + '&date=' + D, { method: 'DELETE', headers: h });
  ok(r.status === 200 && r.body.ok, 'DELETE cell: suppression CA', r.body);
  j = await journalSolde();
  ok(inl(j.solde) === inl(b0.solde), `après suppression CA: solde retour ligne de base ${inl(b0.solde)} (le bug doublait le crédit → 39)`, j.solde);
  ok(inl(j.consomme) === inl(b0.consomme), `consommé revenu à ${b0.consomme}`);
  const resto = db.prepare("SELECT jours, motif FROM mouvements WHERE employe_id=? AND type_operation='ajout_annuel' AND solde_type='conge' AND motif LIKE 'RMA%restauration%' AND motif LIKE '%du " + D + "%' ORDER BY id LIMIT 1").get(EMP);
  ok(resto && inl(resto.jours) === 1, `restauration grand livre = 1j (montant réellement déduit)`);

  // 7) Nettoyage + cohérence finale
  const mvtRma = db.prepare("SELECT id FROM mouvements WHERE employe_id=? AND motif LIKE 'RMA%' AND motif LIKE '%du " + D + "%'").all(EMP);
  for (const m of mvtRma) {
    await api('/mouvements/' + m.id, { method: 'DELETE', headers: h });
  }
  const restCodes = db.prepare("SELECT COUNT(*) n FROM codes_importes WHERE employe_id=? AND date=?").get(EMP, D);
  ok(restCodes.n === 0, `codes_importes D nettoyés (${restCodes.n})`);
  j = await journalSolde();
  ok(
    inl(j.accorde) === inl(b0.accorde) && inl(j.consomme) === inl(b0.consomme) && inl(j.solde) === inl(b0.solde) && j.lignes.length === b0.lignes.length,
    'état final identique à l’état initial (accorde/consomme/solde/lignes)',
    { accorde: j.accorde, consomme: j.consomme, solde: j.solde, lignes: j.lignes.length }
  );

  console.log(failures === 0 ? '\n=== TOUS LES TESTS PASSENT ===' : `\n=== ${failures} ÉCHEC(S) ===`);
  process.exitCode = failures === 0 ? 0 : 1;
})().catch((e) => { console.error('ERREUR FATALE', e); process.exitCode = 2; });