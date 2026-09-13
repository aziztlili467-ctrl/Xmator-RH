// Télécharge les modèles IA de reconnaissance faciale @vladmandic/face-api
// vers client/public/models (servis sous /models pour le navigateur).
//
// Usage : npm run models   (ou : node scripts/download-models.mjs)
//
// Réseaux requis pour l'enrôlement visage (ssd_mobilenetv1 = détection,
// face_landmark_68 = landmarks, face_recognition = descriptor 128, face_expression = expressions).
// Les fichiers sont réutilisés s'ils existent déjà à la bonne taille (pas de re-téléchargement).

import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODELS_DIR = join(__dirname, '..', 'public', 'models');

const RESEAUX = [
  'ssd_mobilenetv1_model',
  'face_landmark_68_model',
  'face_recognition_model',
  'face_expression_model',
];

function versionInstallee() {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'node_modules', '@vladmandic', 'face-api', 'package.json'), 'utf8'));
    return pkg.version;
  } catch {
    return null;
  }
}

async function telecharger(url, dest) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} pour ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, buf);
  return buf.length;
}

async function main() {
  const version = versionInstallee() || 'latest';
  const base = `https://cdn.jsdelivr.net/npm/@vladmandic/face-api@${version}/model/`;
  mkdirSync(MODELS_DIR, { recursive: true });

  const manquants = [];
  for (const net of RESEAUX) {
    const manifestUrl = `${base}${net}-weights_manifest.json`;
    let manifest;
    try {
      const r = await fetch(manifestUrl);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      manifest = await r.json();
    } catch (e) {
      console.error(`✗ ${net} : manifest introuvable (${e.message})`);
      manquants.push(`${net}-weights_manifest.json`);
      continue;
    }
    const fichiers = [net + '-weights_manifest.json', ...manifest.flatMap((g) => g.paths || [])];
    for (const f of fichiers) {
      const dest = join(MODELS_DIR, f);
      const existe = existsSync(dest) ? statSync(dest).size : 0;
      if (existe > 0) {
        console.log(`= ${f} (déjà présent, ${existe} o)`);
        continue;
      }
      try {
        const taille = await telecharger(`${base}${f}`, dest);
        if (taille === 0) {
          manquants.push(f);
        } else {
          console.log(`+ ${f} (${taille} o)`);
        }
      } catch (e) {
        console.error(`✗ ${f} : ${e.message}`);
        manquants.push(f);
      }
    }
  }

  if (manquants.length > 0) {
    console.error(`\nTéléchargement incomplet (${manquants.length} fichier(s) manquant(s)).`);
    process.exitCode = 1;
  } else {
    console.log(`\nModèles face-api ${version} prêts dans ${MODELS_DIR}`);
  }
}

main();