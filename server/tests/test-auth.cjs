// Tests critiques — authentification (P4) : refresh token HttpOnly (login, fallback cookie,
// rotation, réutilisation détectée → 401), révocation au logout, socket authentifié par cookie.
// DB temporaire isolée (voir harness.cjs).
const path = require('path');
const { withServer, ROOT } = require('./harness.cjs');

const IO_CLIENT = path.join(ROOT, 'client', 'node_modules', 'socket.io-client');

let OK = 0;
function eq(a, b, label) { if (a !== b) throw new Error(`${label} : attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`); OK++; }
function ok(v, label) { if (!v) throw new Error(`${label} : échec`); OK++; }

function cookieVal(res) {
  const sc = res.headers.get('set-cookie') || '';
  const m = sc.match(/refreshToken=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

async function tests(srv, port) {
  const base = `http://127.0.0.1:${port}/api`;

  const lr = await fetch(`${base}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: 'Xmator', password: 'SuperPass!1' }),
  });
  eq(lr.status, 200, 'login 200');
  const login = await lr.json();
  ok(login.token, 'login → token');
  ok(login.session_id, 'login → session_id');
  const sid = String(login.session_id);
  const sc = lr.headers.get('set-cookie') || '';
  ok(sc.includes('HttpOnly'), 'cookie HttpOnly');
  ok(sc.includes('Path=/'), 'cookie Path=/');
  ok(sc.includes('SameSite=Lax'), 'cookie SameSite=Lax');
  ok(/Max-Age=2592000/.test(sc), 'cookie Max-Age 30 j');
  ok(sc.includes('Secure'), 'cookie Secure (production)');
  const rt1 = cookieVal(lr);
  ok(rt1, 'cookie refreshToken émis');

  const me1 = await fetch(`${base}/auth/me`, { headers: { Authorization: `Bearer ${login.token}` } });
  eq(me1.status, 200, 'me via Bearer');
  eq((await me1.json()).user.login, 'Xmator', 'me → login');

  const me2 = await fetch(`${base}/auth/me`, { headers: { Cookie: `refreshToken=${rt1}` } });
  eq(me2.status, 200, 'me via cookie seul (fallback)');
  const rt2 = cookieVal(me2);
  ok(rt2 && rt2 !== rt1, 'cookie roté au fallback');

  const me3 = await fetch(`${base}/auth/me`, { headers: { Cookie: `refreshToken=${rt1}` } });
  eq(me3.status, 401, 'ancien cookie réutilisé → 401');

  const rr = await fetch(`${base}/auth/refresh`, { method: 'POST', headers: { Cookie: `refreshToken=${rt2}` } });
  eq(rr.status, 200, 'refresh 200');
  const rj = await rr.json();
  ok(rj.token, 'refresh → nouveau token');
  eq(String(rj.session_id), sid, 'refresh → même session');
  const rt3 = cookieVal(rr);
  ok(rt3 && rt3 !== rt2, 'refresh → cookie roté');

  const rr2 = await fetch(`${base}/auth/refresh`, { method: 'POST', headers: { Cookie: `refreshToken=${rt2}` } });
  eq(rr2.status, 401, 'refresh ancien cookie → 401');

  const emp = await fetch(`${base}/employes`, { headers: { Cookie: `refreshToken=${rt3}` } });
  eq(emp.status, 200, '/employes via cookie seul');
  const rt4 = cookieVal(emp);
  ok(rt4 && rt4 !== rt3, '/employes → cookie roté');

  const { io } = require(IO_CLIENT);
  await new Promise((resolve, reject) => {
    const sock = io(`http://127.0.0.1:${port}`, {
      transports: ['polling'],
      auth: {},
      extraHeaders: { Cookie: `refreshToken=${rt4}` },
      withCredentials: true,
    });
    const t = setTimeout(() => { try { sock.disconnect(); } catch {} reject(new Error('socket : timeout')); }, 8000);
    sock.on('connect', () => { clearTimeout(t); try { sock.disconnect(); } catch {} resolve(); });
    sock.on('connect_error', (e) => { clearTimeout(t); try { sock.disconnect(); } catch {} reject(new Error(`socket connect_error : ${e.message}`)); });
  });
  ok(true, 'socket authentifié via cookie');

  const lo = await fetch(`${base}/auth/logout`, {
    method: 'POST',
    headers: { Cookie: `refreshToken=${rt4}`, Authorization: `Bearer ${rj.token}` },
  });
  eq(lo.status, 200, 'logout 200');
  const loc = lo.headers.get('set-cookie') || '';
  ok(/refreshToken=;/.test(loc) && /Max-Age=0/.test(loc), 'logout efface le cookie');

  const rr3 = await fetch(`${base}/auth/refresh`, { method: 'POST', headers: { Cookie: `refreshToken=${rt4}` } });
  eq(rr3.status, 401, 'refresh après logout → 401');

  const anon = await fetch(`${base}/employes`);
  eq(anon.status, 401, 'sans identifiant → 401');
}

(async () => {
  console.log('=== TEST CRITIQUE — AUTH (P4) ===');
  await withServer(4210, {}, (srv) => tests(srv, 4210), { showLogs: false });
  console.log(`${OK} ASSERTIONS OK`);
})().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});