// Tests critiques — POST /api/presence/pointage (P12) : horodatage borné autour de l'heure serveur.
// DB temporaire isolée.
const { withServer } = require('./harness.cjs');

let OK = 0;
function eq(a, b, label) { if (a !== b) throw new Error(`${label} : attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`); OK++; }

let token;
async function api(base, p, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(`${base}/${p}`, { ...opts, headers });
  let b = null; try { b = await r.json(); } catch {}
  return { status: r.status, body: b };
}
const pad = (n) => String(n).padStart(2, '0');
function isoMod(days, min) {
  const d = new Date(Date.now() + days * 864e5 + (min || 0) * 6e4);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

async function tests(srv, port) {
  const base = `http://127.0.0.1:${port}/api`;
  const l = await api(base, 'auth/login', { method: 'POST', body: JSON.stringify({ login: 'Xmator', password: 'SuperPass!1' }) });
  eq(l.status, 200, 'login 200');
  token = l.body.token;
  const cat = await api(base, 'categories', { method: 'POST', body: JSON.stringify({ libelle: 'Cadre' }) });
  const emp = await api(base, 'employes', { method: 'POST', body: JSON.stringify({ matricule: '9002', nom: 'POINT', prenom: 'Test', categorie_id: cat.body.id }) });
  const id = emp.body.id;

  const pt = (iso) => api(base, 'presence/pointage', { method: 'POST', body: JSON.stringify({ employe_id: id, horodatage: iso }) });

  let r = await pt(isoMod(0, 0));
  eq(r.status, 200, 'pointage maintenant → 200');
  r = await pt(isoMod(0, +2));
  eq(r.status, 200, 'pointage +2 min (tolérance fut.) → 200');
  r = await pt(isoMod(-3, 0));
  eq(r.status, 200, 'pointage −3 jours (hors-ligne OK) → 200');
  r = await pt(isoMod(0, +10));
  eq(r.status, 400, 'pointage +10 min → 400');
  r = await pt(isoMod(-10, 0));
  eq(r.status, 400, 'pointage −10 jours → 400');
  r = await pt('nimporte:quoi');
  eq(r.status, 400, 'format invalide → 400');
  r = await api(base, 'presence/pointage', { method: 'POST', body: JSON.stringify({ employe_id: id }) });
  eq(r.status, 200, 'sans horodatage → 200');
}

(async () => {
  console.log('=== TEST CRITIQUE — POINTAGE (P12) ===');
  await withServer(4230, {}, (s) => tests(s, 4230), { showLogs: false });
  console.log(`${OK} ASSERTIONS OK`);
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });