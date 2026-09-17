// Test SaaS global (build frais dist/): statiques, PWA (sw.js + manifest), terminal,
// auth (HttpOnly cookie + fallback auto-refresh), socket, assets. DB temporaire isolée.
const path = require('path');
const fs = require('fs');
const { withServer, ROOT } = require('./harness.cjs');

if (!fs.existsSync(path.join(ROOT, 'client', 'dist')) || !fs.existsSync(path.join(ROOT, 'terminal', 'dist'))) {
  console.log('test-global : saute (lancer npm run build avant ce test)');
  process.exit(0);
}

let OK = 0;
function eq(a, b, label) { if (a !== b) throw new Error(`${label} : attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`); OK++; }
function ok(v, label) { if (!v) throw new Error(`${label} : échec`); OK++; }

async function tests(srv, port) {
  const base = `http://127.0.0.1:${port}`;

  const h = await fetch(`${base}/api/health`);
  eq(h.status, 200, '/api/health 200');
  eq((await h.json()).status, 'ok', 'health status ok');

  const idx = await fetch(`${base}/`);
  eq(idx.status, 200, 'GET / 200');
  const html = await idx.text();
  ok(html.includes('<div id="root">'), 'index sert la racine React');
  const assetsDir = require('fs').readdirSync(path.join(ROOT, 'client', 'dist', 'assets'));
  const jsBundle = assetsDir.find((f) => f.endsWith('.js') && (f.includes('main') || f.includes('index')));
  ok(!!jsBundle, 'bundle JS principal trouvé');
  const bundle = require('fs').readFileSync(path.join(ROOT, 'client', 'dist', 'assets', jsBundle), 'utf8');
  ok(bundle.includes('serviceWorker.register') && bundle.includes('/sw.js'), 'index enregistre le service worker');

  const sw = await fetch(`${base}/sw.js`);
  eq(sw.status, 200, 'sw.js 200');
  const swBody = await sw.text();
  ok(/workbox|precacheAndRoute|skipWaiting|self\./.test(swBody), 'sw.js est un service worker');

  const mf = await fetch(`${base}/manifest.webmanifest`);
  eq(mf.status, 200, 'manifest PWA 200');
  ok((await mf.json()).name, 'manifest avec name');

  const term = await fetch(`${base}/terminal`);
  eq(term.status, 200, '/terminal 200');
  ok((await term.text()).includes('<div id="root">'), 'borne servi (index terminal)');

  const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: 'Xmator', password: 'SuperPass!1' }),
  });
  eq(login.status, 200, 'login 200');
  const sc = login.headers.get('set-cookie') || '';
  ok(sc.includes('HttpOnly') && sc.includes('Secure'), 'cookie de session HttpOnly+Secure');
  const rt = decodeURIComponent((sc.match(/refreshToken=([^;]+)/) || [])[1]);
  ok(rt, 'cookie refreshToken émis');

  const emp = await fetch(`${base}/api/employes`, { headers: { Cookie: `refreshToken=${rt}` } });
  eq(emp.status, 200, '/api/employes via cookie seul (fallback auto-refresh)');
  ok(Array.isArray((await emp.json())), 'liste d\u2019employés');
  const rotated = decodeURIComponent(((emp.headers.get('set-cookie') || '').match(/refreshToken=([^;]+)/) || [])[1]);
  ok(rotated && rotated !== rt, 'cookie roté par /api/employes');

  const { io } = require(path.join(ROOT, 'client', 'node_modules', 'socket.io-client'));
  await new Promise((resolve, reject) => {
    const sock = io(`http://127.0.0.1:${port}`, {
      transports: ['polling'], extraHeaders: { Cookie: `refreshToken=${rotated}` }, withCredentials: true,
    });
    const t = setTimeout(() => { try { sock.disconnect(); } catch {} reject(new Error('socket timeout')); }, 8000);
    sock.on('connect', () => { clearTimeout(t); try { sock.disconnect(); } catch {} resolve(); });
    sock.on('connect_error', (e) => { clearTimeout(t); reject(new Error(`socket : ${e.message}`)); });
  });
  ok(true, 'socket authentifié');

  const anon = await fetch(`${base}/api/employes`);
  eq(anon.status, 401, 'API protégée sans identifiant → 401');

  const swing = await fetch(`${base}/manifest-eye.webmanifest`);
  eq(swing.status, 200, 'manifest borne 200');

  const assetsDirAll = require('fs').readdirSync(path.join(ROOT, 'client', 'dist', 'assets'));
  ok(assetsDirAll.length > 0, `assets build présents (${assetsDirAll.length})`);
  const a = await fetch(`${base}/assets/${assetsDirAll[0]}`);
  eq(a.status, 200, `asset hashed ${assetsDir[0]} → 200`);
  ok((a.headers.get('cache-control') || '').includes('max-age'), 'asset immutable');

  const logs = srv.err + srv.out;
  if (/UnhandledPromiseRejection|ECONNREFUSED| \[Error\] |TypeError:/.test(logs)) {
    throw new Error('erreurs inattendues dans les logs serveur : ' + logs.slice(-800));
  }
  ok(true, 'logs serveur propres');
}

(async () => {
  console.log('=== TEST SAAS GLOBAL (build frais + PWA + terminal) ===');
  await withServer(4240, {}, (srv) => tests(srv, 4240), { showLogs: false });
  console.log(`${OK} ASSERTIONS OK`);
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });