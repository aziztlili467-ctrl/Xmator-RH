import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// --- Génération du service worker PWA au build (sans dépendance) ---
const SW_CACHE = 'xmator-rh-v2';

const SW_TEMPLATE = `const CACHE = '${SW_CACHE}';
const PRECACHE = __PRECACHE_MANIFEST__;

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // API : réseau d'abord, cache en secours si hors-ligne
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Photos : cache d'abord, réseau en arrière-plan (stale-while-revalidate)
  if (url.pathname.startsWith('/photos/')) {
    e.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // Navigations : réseau d'abord (toujours la version la plus récente), cache si hors-ligne
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((c) => c || caches.match('/index.html')))
    );
    return;
  }

  // App shell / assets (JS, CSS, icônes…) : cache d'abord, sinon réseau
  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => undefined);
    })
  );
});
`;

function listFiles(dir, base, acc) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) listFiles(p, base, acc);
    else acc.push(relative(base, p).split('\\').join('/'));
  }
  return acc;
}

function pwaGenerate() {
  let outDir = '';
  return {
    name: 'pwa-generate',
    apply: 'build',
    configResolved(config) {
      outDir = join(config.root, config.build.outDir);
    },
    closeBundle() {
      const files = listFiles(outDir, outDir, []).filter((f) => f !== 'sw.js').sort();
      const sw = SW_TEMPLATE.replace('__PRECACHE_MANIFEST__', JSON.stringify(files));
      writeFileSync(join(outDir, 'sw.js'), sw);
      console.log(`[pwa] sw.js généré — ${files.length} fichiers précachés`);
    },
  };
}

export default defineConfig({
  plugins: [react(), pwaGenerate()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
});