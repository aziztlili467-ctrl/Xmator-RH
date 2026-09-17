// Tests — ouverture dans un nouvel onglet / double effet StrictMode : deux appels
// « refresh » concurrents consomment le MÊME cookie. La rotation serveur révoque le
// cookie du perdant (401) ; le correctif garantit que ce 401 N'EFFACE PAS le cookie
// (le cookie frais du gagnant reste utilisable) pour que le client puisse relire le
// plus récent et se renouveler, au lieu de se faire rediriger vers /login.
const { withServer } = require('./harness.cjs');

let OK = 0;
function eq(a, b, label) { if (a !== b) throw new Error(`${label} : attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`); OK++; }
function ok(v, label) { if (!v) throw new Error(`${label} : échec`); OK++; }

function cookieVal(res) {
  const sc = res.headers.get('set-cookie') || '';
  const m = sc.match(/refreshToken=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}
function effaceCookie(res) {
  const sc = res.headers.get('set-cookie') || '';
  return /Max-Age=0/.test(sc) && /refreshToken=;/.test(sc);
}

async function tests(srv, port) {
  const base = `http://127.0.0.1:${port}/api`;

  // 1. Connexion → cookie initial.
  const lr = await fetch(`${base}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: 'Xmator', password: 'SuperPass!1' }),
  });
  eq(lr.status, 200, 'login 200');
  const rt0 = cookieVal(lr);
  ok(rt0, 'cookie initial');

  // 2. Course simulée : deux refresh SANS jeton Bearer, avec le MÊME cookie (équivalent
  //    « nouvel onglet » : AuthContext + socket, ou double effet StrictMode en dev).
  const [ra, rb] = await Promise.all([
    fetch(`${base}/auth/refresh`, { method: 'POST', headers: { Cookie: `refreshToken=${rt0}` } }),
    fetch(`${base}/auth/refresh`, { method: 'POST', headers: { Cookie: `refreshToken=${rt0}` } }),
  ]);
  const statuses = [ra.status, rb.status].sort((x, y) => x - y).join(',');
  eq(statuses, '200,401', 'course → un gagnant (200), un perdant (401)');

  const winner = ra.status === 200 ? ra : rb;
  const loser = ra.status === 200 ? rb : ra;
  const rt1 = cookieVal(winner);
  ok(rt1 && rt1 !== rt0, 'gagnant → cookie roté');

  // 3. LE POINT CRUCIAL : le 401 du perdant ne doit PAS effacer le cookie (pas de
  //    Set-Cookie d'expiration). Sinon la session valide (cookie frais du gagnant)
  //    serait détruite dans le navigateur → redirection /login.
  ok(!effaceCookie(loser), '401 du perdant → cookie NON effacé (réutilisation)');

  // 4. Le perdant (règle client) relit le cookie frais du gagnant et se renouvelle :
  //    c'est le comportement « clean-up » du nouvel onglet après la course.
  const retry = await fetch(`${base}/auth/refresh`, { method: 'POST', headers: { Cookie: `refreshToken=${rt1}` } });
  eq(retry.status, 200, 'reprise du perdant avec le cookie frais → 200');
  const rt2 = cookieVal(retry);
  ok(rt2 && rt2 !== rt1, 'reprise → cookie roté à nouveau');

  // 5. L'onglet est opérationnel : appel protégé via le cookie seul.
  const emp = await fetch(`${base}/employes`, { headers: { Cookie: `refreshToken=${rt2}` } });
  eq(emp.status, 200, 'onglet opérationnel (/employes via cookie)');
  const rt3 = cookieVal(emp);
  ok(rt3 && rt3 !== rt2, '/employes → cookie roté');

  // 6. L'ancien token resté invalide (roté) répond bien 401 SANS effacer le cookie.
  const reuse = await fetch(`${base}/auth/refresh`, { method: 'POST', headers: { Cookie: `refreshToken=${rt0}` } });
  eq(reuse.status, 401, 'token roté + réutilisé → 401');
  ok(!effaceCookie(reuse), 'reuse → cookie NON effacé');

  // 7. Comportement défensif conservé : token INCONNU (pas une rotation) → cookie effacé.
  const anon = await fetch(`${base}/auth/refresh`, { method: 'POST', headers: { Cookie: 'refreshToken=jeton_inconnu_z0123' } });
  eq(anon.status, 401, 'token inconnu → 401');
  ok(effaceCookie(anon), 'token inconnu → cookie effacé (défensif)');

  // 8. Session restante valide jusqu'au bout : la chaîne de cookies se poursuit.
  const rr = await fetch(`${base}/auth/refresh`, { method: 'POST', headers: { Cookie: `refreshToken=${rt3}` } });
  eq(rr.status, 200, 'refresh final 200 (chaîne de cookies intacte)');
}

(async () => {
  console.log('=== TEST MULTI-ONGLETS — course refresh / nouvel onglet ===');
  await withServer(4240, {}, (srv) => tests(srv, 4240), { showLogs: false });
  console.log(`${OK} ASSERTIONS OK`);
})().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});