// Démarrage dev ordonné : l'API doit répondre (sonde publique /api/health) AVANT que
// Vite n'accepte du trafic. Sinon le proxy renvoie ECONNREFUSED et le premier chargement
// du tableau de bord (employes + categories + audit) échoue : « Une erreur est survenue. »
// Jusqu'à présent l'erreur ne disparaissait qu'après un changement de filtre (autre refetch).
const { spawn } = require('node:child_process');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const API_PORT = 4000; // PORT par défaut du serveur (mode dev : .env non chargé par `node --watch`)

const C = { api: '\x1b[34m', web: '\x1b[32m', reset: '\x1b[0m', gris: '\x1b[90m' };

function prefixer(nom) {
  return (data) => {
    String(data)
      .split(/\r?\n/)
      .filter((l) => l.trim())
      .forEach((l) => process.stdout.write(`${C[nom]}[${nom}]${C.reset} ${l}\n`));
  };
}

function killArbre(pid) {
  if (!pid) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    spawn('kill', ['-TERM', String(pid)], { stdio: 'ignore' });
  }
}

// Démarre Vite et le surveille. Un client qui coupe brusquement son socket HMR (mobile
// sur le LAN, veille, réseau instable) peut faire planter Vite (« Unhandled 'error'
// event » ECONNRESET, Node ≥ 20). Si Vite s'arrête sans que ce soit volontaire, on le
// relance automatiquement (avec un garde-fou : 5 redémarrages < 10 s → abandon).
function demarrerWeb() {
  const clientDir = path.join(ROOT, 'client');
  const viteBin = path.join(clientDir, 'node_modules', 'vite', 'bin', 'vite.js');
  const enfant = spawn(process.execPath, [viteBin], {
    cwd: clientDir,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  enfant.stdout.on('data', prefixer('web'));
  enfant.stderr.on('data', prefixer('web'));
  let tombe = Date.now();
  enfant.on('exit', (code) => {
    if (termine) return;
    const maintenant = Date.now();
    if (maintenant - tombe < 10_000) {
      redemarragesProches += 1;
      if (redemarragesProches > MAX_REDEMARRAGES_RAPIDES) {
        console.error(`${C.gris}[api]${C.reset} Trop de redémarrages Vite rapprochés — abandon. Relancez \`npm run dev\`.`);
        couper(1);
        return;
      }
    } else {
      redemarragesProches = 0;
    }
    console.error(`${C.gris}[api]${C.reset} Vite arrêté (code ${code}) — redémarrage automatique dans 800 ms…`);
    setTimeout(() => { if (!termine) web = demarrerWeb(); }, 800);
  });
  return enfant;
}

let web = null;
let termine = false;

const MAX_REDEMARRAGES_RAPIDES = 5; // garde-fou anti boucle de crash
let redemarragesProches = 0;

function couper(code = 0) {
  if (termine) return;
  termine = true;
  if (web && web.pid) killArbre(web.pid);
  if (api.pid) killArbre(api.pid);
  process.exit(code);
}

process.on('SIGINT', () => couper(0));
process.on('SIGTERM', () => couper(0));

const api = spawn(process.execPath, ['--watch', 'index.js'], {
  cwd: path.join(ROOT, 'server'),
  stdio: ['ignore', 'pipe', 'pipe'],
});
api.stdout.on('data', prefixer('api'));
api.stderr.on('data', prefixer('api'));

api.on('exit', (code) => {
  if (termine) return;
  console.error(`${C.gris}[web]${C.reset} API arrêtée (code ${code}) — Vite continue ; relancez \`npm run dev\` pour tout reprendre.`);
});

async function attendreAPI(delai = 30000) {
  const fin = Date.now() + delai;
  while (Date.now() < fin) {
    if (api.exitCode !== null) {
      console.error(`${C.gris}[web]${C.reset} L'API s'est arrêtée (code ${api.exitCode}) avant d'être prête — abandon.`);
      process.exit(api.exitCode || 1);
    }
    try {
      const res = await fetch(`http://localhost:${API_PORT}/api/health`);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  console.error(`${C.gris}[web]${C.reset} API non démarrée au bout de ${delai / 1000}s — abandon.`);
  process.exit(1);
}

attendreAPI()
  .then(() => {
    // Spawn direct du binaire Vite via node — évite npm.cmd/cmd.exe qui, sans shell,
    // lève EINVAL sur Node ≥ 19 (spawn d'un .cmd) et rend le démarrage silencieusement mort.
    web = demarrerWeb();
  })
  .catch((e) => {
    console.error(`${C.gris}[web]${C.reset} Échec du démarrage de Vite :`, e?.message || e);
    couper(1);
  });