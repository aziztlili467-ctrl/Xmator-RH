// Harnais de test : démarre un serveur avec un env précis sur un port donné, attend la santé,
// exécute une fonction de test, puis arrête le serveur. DB temporaire isolée (WAL frais).
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.resolve(__dirname, '..', '..');

function tmpDb(tag) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `rh2030-${tag}-`));
  return path.join(dir, `test-${tag}.db`);
}

async function waitHealth(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let lastErr = null;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/health`);
      const j = await r.json();
      if (r.status === 200 && j.status === 'ok') return j;
      lastErr = new Error(`health ${r.status}`);
    } catch (e) { lastErr = e; }
    await new Promise((s) => setTimeout(s, 400));
  }
  throw lastErr || new Error('timeout waiting health');
}

class Srv {
  constructor(port, envExtra = {}) {
    this.port = port;
    this.db = tmpDb(`p${port}`);
    const env = {
      ...process.env,
      PORT: String(port),
      DB_PATH: this.db,
      JWT_SECRET: 'cle_test_ci_non_secrete_0123456789abcdef',
      ADMIN_PASSWORD: 'SuperPass!1',
      DANGER_PASSWORD: 'DangerPass!1',
      NODE_ENV: 'production',
      ...envExtra,
    };
    for (const k of ['PORT', 'DB_PATH', 'JWT_SECRET', 'ADMIN_PASSWORD', 'DANGER_PASSWORD', 'NODE_ENV']) {
      const v = env[k];
      if (v === undefined || v === null) delete env[k];
    }
    this.child = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
      env,
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.out = '';
    this.err = '';
    this.child.stdout.on('data', (d) => (this.out += d));
    this.child.stderr.on('data', (d) => (this.err += d));
  }

  async start(silent = true) {
    await waitHealth(this.port);
    if (!silent) console.log(`[ok] serveur démarré sur :${this.port}`);
    return this;
  }

  logs() {
    return this.out + '\n--- stderr ---\n' + this.err;
  }

  async stop() {
    this.child.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 600));
    if (this.child.exitCode !== null && !this.child.killed) {
      try { this.child.kill('SIGKILL'); } catch {}
    }
  }
}

async function withServer(port, env, fn, opts = {}) {
  const srv = new Srv(port, env);
  let ok = false;
  try {
    await srv.start(opts.silentStart);
    await fn(srv);
    ok = true;
  } finally {
    await srv.stop();
    if (opts.showLogs) {
      console.log('----- logs serveur -----');
      console.log(srv.logs().slice(0, 4000));
    }
  }
  return ok;
}

module.exports = { withServer, waitHealth, ROOT };