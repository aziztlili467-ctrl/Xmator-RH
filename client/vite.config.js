import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// --- Génération du service worker PWA au build (sans dépendance) ---
const SW_CACHE = `xmator-rh-${Date.now().toString(36)}`;

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
      // NOTE: pas de navigate() force ici — cela coupait les requetes /api en vol (refresh)
      // au F5 et provoquait ECONNREFUSED + retour /login. Les onglets prennent la
      // nouvelle version au prochain chargement naturel.
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // API : JAMÁIS interceptée ni mise en cache — les réponses contiennent des données
  // sensibles (employés, soldes, paie, sessions) et doivent rester fraîches. On laisse la
  // requête partir vers le réseau sans modification : aucune copie dans CacheStorage,
  // aucune réponse périmée servie hors-ligne (l'échec réseau remonte naturellement au
  // client, qui applique sa logique de reprise).
  if (url.pathname.startsWith('/api/')) {
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
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
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

// Vite 5 + Node ≥ 20 : si un client coupe brutalement son socket HMR (téléphone sur le
// LAN, mise en veille, réseau instable), le socket TCP brut peut émettre 'error'
// (ECONNRESET) sans écouteur pendant le handshake 'upgrade'. Node juge l'événement
// fatidique et arrête tout le serveur Vite. On attache un écouteur no-op dès l'upgrade.
function hmrSocketGuard() {
  return {
    name: 'hmr-socket-guard',
    configureServer(server) {
      server.httpServer?.on('upgrade', (req, socket) => {
        socket.on('error', () => {});
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), pwaGenerate(), hmrSocketGuard()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    // Autorise les hôtes de prévisualisation distants (tunnels, sandbox, mobile sur le LAN)
    allowedHosts: true,
    proxy: {
      '/api': 'http://localhost:4000',
      '/photos': 'http://localhost:4000',
      // La borne Xmator Terminal est un build séparé servi par Express (/terminal/) :
      // en dev le serveur Vite relaie ces chemins pour que le bouton d'installation marche aussi sur :5173
      '/terminal': 'http://localhost:4000',
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },
});