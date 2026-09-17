import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { writeFileSync, readdirSync, statSync, copyFileSync, mkdirSync, existsSync } from 'node:fs';

const CLIENT_SRC = path.resolve(__dirname, '..', 'client', 'src');
const CLIENT_PUBLIC = path.resolve(__dirname, '..', 'client', 'public');

// --- Génération du service worker PWA au build ---
const SW_CACHE = `xmator-terminal-${Date.now().toString(36)}`;

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
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then((clients) => clients.forEach((c) => c.navigate(c.url)))
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // API : jamais interceptée ni mise en cache — données sensibles + fraîcheur obligatoire.
  // Hors-ligne, l'échec réseau remonte au kiosque qui met le pointage en file IndexedDB.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/terminal/api/')) {
    return;
  }

  // Photos : stale-while-revalidate
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

  // App shell / assets : cache d'abord, sinon réseau
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
    const p = path.join(dir, entry);
    if (statSync(p).isDirectory()) listFiles(p, base, acc);
    else acc.push(path.relative(base, p).split('\\').join('/'));
  }
  return acc;
}

function pwaGenerate() {
  let outDir = '';
  return {
    name: 'pwa-terminal-generate',
    apply: 'build',
    configResolved(config) {
      outDir = path.join(config.root, config.build.outDir);
      mkdirSync(outDir, { recursive: true });
    },
    closeBundle() {
      const files = listFiles(outDir, outDir, []).filter((f) => f !== 'sw.js').sort();
      const sw = SW_TEMPLATE.replace('__PRECACHE_MANIFEST__', JSON.stringify(files));
      writeFileSync(path.join(outDir, 'sw.js'), sw);
      console.log(`[pwa-terminal] sw.js généré — ${files.length} fichiers précachés`);
    },
  };
}

// Copie les modèles face-api + icônes depuis le client/public
function copySharedAssets() {
  let outDir = '';
  return {
    name: 'copy-shared-assets',
    apply: 'build',
    configResolved(config) {
      outDir = path.join(config.root, config.build.outDir);
      mkdirSync(outDir, { recursive: true });
    },
    closeBundle() {
      // Modèles face-api
      const modelsSrc = path.join(CLIENT_PUBLIC, 'models');
      const modelsDest = path.join(outDir, 'models');
      if (existsSync(modelsSrc)) {
        if (!existsSync(modelsDest)) mkdirSync(modelsDest, { recursive: true });
        for (const f of readdirSync(modelsSrc)) {
          copyFileSync(path.join(modelsSrc, f), path.join(modelsDest, f));
        }
        console.log(`[pwa-terminal] modèles face-api copiés`);
      }
      // Icônes
      const iconsSrc = path.join(CLIENT_PUBLIC, 'icons');
      const iconsDest = path.join(outDir, 'icons');
      if (existsSync(iconsSrc)) {
        if (!existsSync(iconsDest)) mkdirSync(iconsDest, { recursive: true });
        for (const f of readdirSync(iconsSrc)) {
          if (f.startsWith('xmator-eye')) copyFileSync(path.join(iconsSrc, f), path.join(iconsDest, f));
        }
      }
      // Logo principal
      const logoSrc = path.join(CLIENT_PUBLIC, 'xmator-eye-logo.png');
      if (existsSync(logoSrc)) copyFileSync(logoSrc, path.join(outDir, 'xmator-eye-logo.png'));
      console.log(`[pwa-terminal] icônes copiées`);
    },
  };
}

export default defineConfig({
  plugins: [react(), pwaGenerate(), copySharedAssets()],
  base: '/terminal/',
  resolve: {
    alias: {
      '@shared': CLIENT_SRC,
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5174,
    allowedHosts: true,
    proxy: {
      '/api': 'http://localhost:4000',
      '/photos': 'http://localhost:4000',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4174,
    allowedHosts: true,
  },
});
