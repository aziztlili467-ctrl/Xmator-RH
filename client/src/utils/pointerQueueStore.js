// File d'attente hors-ligne des pointages de la borne XMATOR EYE, persistée en IndexedDB.
// Chaque pointage est une transaction autonome et autonomelement datée (structure enrichie :
// identifiant local, photo webp, liveness, score de confiance, horodatage local). `etat` passe
// à 1 (synchronisé) dès que l'API a accepté la transaction, à 2 en cas d'échec définitif.
// IndexedDB brut promisifié — aucune dépendance tierce (pas d'idb/Dexie).

const NOM_BASE = 'xmator-eye';
const MAGASIN = 'pointer_queue';
const VERSION = 1;

let basePromise = null;

function ouvrirBase() {
  if (basePromise) return basePromise;
  basePromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error("IndexedDB n'est pas disponible dans ce navigateur."));
      return;
    }
    const req = indexedDB.open(NOM_BASE, VERSION);
    req.onupgradeneeded = () => {
      const base = req.result;
      if (!base.objectStoreNames.contains(MAGASIN)) {
        const magasin = base.createObjectStore(MAGASIN, { keyPath: 'id' });
        magasin.createIndex('par-synced', 'synced');
        magasin.createIndex('par-createdat', 'createdAt');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error(`Ouverture IndexedDB impossible (${NOM_BASE}).`));
  });
  return basePromise;
}

function attendre(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Erreur IndexedDB.'));
  });
}

function terminer(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Erreur de transaction IndexedDB.'));
    tx.onabort = () => reject(tx.error || new Error('Transaction IndexedDB annulée.'));
  });
}

// Identifiant unique local (UUID v4) — `crypto.randomUUID` n'existe qu'en contexte sécurisé
// (HTTPS/localhost) : repli RFC 4122 v4 pour le test sur le LAN en HTTP.
export function genererId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// Ajoute une transaction de pointage dans la file (ou la ré-écrit si `id` fourni).
// Champ attendu : { employe_id, matricule, nom_prenom, horodatage, type, photoCaptured,
// livenessVerified, confidenceScore, timestamp? }. Les champs compatibles avec l'API
// (employe_id, horodatage) sont conservés tels quels pour la synchro.
export async function ajouterPointage(payload = {}) {
  const item = {
    id: payload.id || genererId(),
    employeeId: Number(payload.employe_id),
    employe_id: Number(payload.employe_id),
    matricule: payload.matricule || '',
    nom_prenom: payload.nom_prenom || '',
    horodatage: payload.horodatage || '',
    timestamp: payload.timestamp
      || (payload.horodatage ? new Date(String(payload.horodatage).replace(' ', 'T')).toISOString() : null),
    type: payload.type || 'arrivee',
    methode: 'Biometrie Xmator-Eye',
    photoCaptured: payload.photoCaptured || null,
    livenessVerified: !!payload.livenessVerified,
    confidenceScore: Math.max(0, Math.min(1, Number(payload.confidenceScore) || 0)),
    synced: false,
    syncedAt: null,
    derniereErreur: null,
    etat: 0, // 0 en attente, 1 synchronisé, 2 échec définitif
    createdAt: Date.now(),
  };
  const base = await ouvrirBase();
  const tx = base.transaction(MAGASIN, 'readwrite');
  const magasin = tx.objectStore(MAGASIN);
  await attendre(magasin.put(item));
  await terminer(tx);
  return item;
}

// Transactions encore en attente (etat 0), triées par ancienneté d'enregistrement.
export async function obtenirEnAttente(limite = 500) {
  const base = await ouvrirBase();
  const tx = base.transaction(MAGASIN, 'readonly');
  const magasin = tx.objectStore(MAGASIN);
  const tous = (await attendre(magasin.getAll())) || [];
  await terminer(tx);
  return tous
    .filter((p) => p && p.etat === 0)
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
    .slice(0, limite);
}

// Marque des transactions comme synchronisées (l'API a répondu OK).
export async function marquerSynchronises(ids = []) {
  const base = await ouvrirBase();
  const tx = base.transaction(MAGASIN, 'readwrite');
  const magasin = tx.objectStore(MAGASIN);
  for (const id of ids) {
    if (!id) continue;
    try {
      const item = await attendre(magasin.get(id));
      if (item && item.etat === 0) {
        item.synced = true;
        item.syncedAt = Date.now();
        item.etat = 1;
        magasin.put(item);
      }
    } catch {}
  }
  await terminer(tx);
}

// Échec définitif (rejet métier 4xx) : sort de la file d'attente mais reste inspectable.
export async function marquerEchec(id, message = '') {
  const base = await ouvrirBase();
  const tx = base.transaction(MAGASIN, 'readwrite');
  const magasin = tx.objectStore(MAGASIN);
  try {
    const item = await attendre(magasin.get(id));
    if (item) {
      item.synced = true;
      item.syncedAt = Date.now();
      item.etat = 2;
      item.derniereErreur = message;
      magasin.put(item);
    }
  } catch {}
  await terminer(tx);
}

// Compte les transactions en attente (badge de synchronisation).
export async function compterEnAttente() {
  return (await obtenirEnAttente()).length;
}

// Hygiène : supprime les transactions synchronisées plus vieilles que `conservationMs`.
export async function purgerSynchronises(conservationMs = 7 * 24 * 60 * 60 * 1000) {
  const base = await ouvrirBase();
  const tx = base.transaction(MAGASIN, 'readwrite');
  const magasin = tx.objectStore(MAGASIN);
  const tous = (await attendre(magasin.getAll())) || [];
  const seuil = Date.now() - conservationMs;
  const ids = tous
    .filter((p) => p && p.etat === 1 && (p.syncedAt || 0) <= seuil)
    .map((p) => p.id);
  for (const id of ids) magasin.delete(id);
  await terminer(tx);
  return ids.length;
}

// Migration ponctuelle de l'ancienne file localStorage (xmator_borne_pointages) vers
// IndexedDB, puis suppression de la clé. Ne fait rien si rien à migrer.
export async function migrerAncienneFile() {
  const ANCIENNE_CLE = 'xmator_borne_pointages';
  let arr = [];
  try {
    const raw = localStorage.getItem(ANCIENNE_CLE);
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    arr = Array.isArray(parsed) ? parsed : [];
  } catch {
    return 0;
  }
  let n = 0;
  for (const p of arr) {
    if (p && p.employe_id && p.horodatage) {
      try { await ajouterPointage(p); n += 1; } catch {}
    }
  }
  try { localStorage.removeItem(ANCIENNE_CLE); } catch {}
  return n;
}