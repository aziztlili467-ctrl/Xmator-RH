// Audit de SYNCHRONISATION (lecture seule) — règle : la grille RMA (codes_importes CA/DJ) est la
// source de vérité du congé. « toute cellule CA/DJ = jour consommé », sans exclusion calendaire ni
// couverture par demande. Usage : node server/audit-sync.cjs [matricule] (défaut : 68).
const path = require('path');
const { db, journalSoldeConge, soldeCongeRestantDate } = require('./db');

const matricule = process.argv[2] || '68';
const TAB = [];

// --- 1) Employé ciblé ---
const emp = db.prepare("SELECT id, matricule, nom, prenom, actif FROM employes WHERE CAST(matricule AS INTEGER) = ?").get(matricule);
console.log(`=== EMPLOYE matricule ${matricule} ===`, emp || '(introuvable)');
if (emp) {
  const j = journalSoldeConge(emp.id);
  const codes = j.lignes.filter((l) => l.source === 'codes_importes');
  const accorde = Math.round(j.lignes.filter((l) => l.signe > 0).reduce((s, l) => s + l.jours, 0) * 1000) / 1000;
  const consomme = Math.round(codes.reduce((s, l) => s + l.jours, 0) * 1000) / 1000;
  console.log(`  accorde=${accorde}  consomme(all CA/DJ)=${consomme}  solde=${j.solde}  lignes=${j.lignes.length}  lignes RMA=${codes.length}`);
  console.log(`  lignes RMA non décomptées (deduit=false) = ${codes.filter((l) => l.deduit === false).length}  (doit être 0)`);
  console.log(`  soldeCongeRestantDate(id)=${soldeCongeRestantDate(emp.id)}  (doit égaler solde du journal)`);
  const f27 = codes.find((l) => l.date_operation === '2026-05-29');
  console.log(`  CA du 2026-05-29 (férié Aïd el-Kebir) décompté = ${f27 ? Boolean(f27.deduit) : 'ABSENT en codes'}  (doit être true)`);
}

// --- 2) Réconciliation GLOBALE (tous employés actifs) ---
console.log('\n=== RÉCONCILIATION GLOBALE (employés actifs) ===');
const actifs = db.prepare("SELECT id FROM employes WHERE actif = 1").all();
let totalAccorde = 0, totalConsomme = 0, totalSolde = 0, ecarts = 0;
const cartes = [];
for (const e of actifs) {
  const j = journalSoldeConge(e.id);
  const codes = j.lignes.filter((l) => l.source === 'codes_importes');
  const accorde = Math.round(j.lignes.filter((l) => l.signe > 0).reduce((s, l) => s + l.jours, 0) * 1000) / 1000;
  const consomme = Math.round(codes.reduce((s, l) => s + l.jours, 0) * 1000) / 1000;
  totalAccorde += accorde;
  totalConsomme += consomme;
  totalSolde += j.solde;
  const ref = soldeCongeRestantDate(e.id);
  if (Math.abs(j.solde - ref) > 1e-9) { ecarts++; cartes.push({ id: e.id, solde: j.solde, ref }); }
}
const rnd = (n) => Math.round(n * 1000) / 1000;
console.log(`  accorde=${rnd(totalAccorde)}  consomme(all CA/DJ)=${rnd(totalConsomme)}  solde=${rnd(totalSolde)}`);
console.log(`  employés avec écart journal/soldeCongeRestantDate = ${ecarts}`, ecarts ? cartes : '(aucun)');

// --- 3) Grand livre : restaurations DJ != 0,5 (bug demie-journée) ---
console.log('\n=== GRAND LIVRE : restaurations RMA DJ avec jours != 0,5 ===');
const restosDJ = db.prepare(`
  SELECT m.id, m.employe_id, e.matricule, m.date_operation, m.jours, m.motif
  FROM mouvements m JOIN employes e ON e.id = m.employe_id
  WHERE m.solde_type='conge' AND m.type_operation IN ('ajout_annuel') AND m.motif LIKE '%RMA%restauration%'
`).all().filter((r) => /DJ[ \u2014]/.test(r.motif) || /Demi-journ\u00e9e/.test(r.motif));
console.log(restosDJ.length ? restosDJ : '(aucune)');

// --- 4) Prélèvements RMA « grand livre » sans cellule CA/DJ correspondante (orphelins) ---
console.log('\n=== GRAND LIVRE : prélèvements RMA sans cellule CA/DJ (orphelins) ===');
const prel = db.prepare(`
  SELECT m.id, m.employe_id, e.matricule, m.date_operation, m.jours, m.motif
  FROM mouvements m JOIN employes e ON e.id = m.employe_id
  WHERE m.solde_type='conge' AND m.type_operation='prelevement' AND m.motif LIKE 'RMA%'
`).all();
const orphans = [];
for (const p of prel) {
  const has = db.prepare(`
    SELECT COUNT(*) n FROM codes_importes ci
    WHERE ci.employe_id = ? AND ci.date = ? AND ci.code IN ('CA','DJ')
  `).get(p.employe_id, p.date_operation).n;
  if (has === 0) orphans.push(p);
}
console.log(orphans.length ? orphans.slice(0, 40) : '(aucun) — mais : cellules CA/DJ sans prélèvement grand livre (férié/week-end) = ' +
  db.prepare(`
    SELECT COUNT(*) n FROM codes_importes ci
    WHERE ci.code IN ('CA','DJ') AND NOT EXISTS (
      SELECT 1 FROM mouvements m WHERE m.employe_id=ci.employe_id AND m.type_operation='prelevement'
        AND m.solde_type='conge' AND m.motif LIKE 'RMA%' AND m.date_operation=ci.date)
  `).get().n + ' (lecture uniquement — non bloquant)');

db.close();