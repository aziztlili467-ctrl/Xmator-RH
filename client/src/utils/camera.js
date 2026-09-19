// Utilitaire caméra unifié (PC webcams + smartphones) : demande de permission avec
// try/catch robuste, messages d'erreur explicites et arrêt propre des pistes vidéo.

export const CONTRAINTES_VIDEO = {
  video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
  audio: false,
};

// Renvoie la liste des caméras disponibles (après demande de permission ou sur PC si déjà donnée).
export async function listerCameras() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return [];
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === 'videoinput');
  } catch { return []; }
}

// Contraintes vidéo ciblées : si deviceId est fourni, on l'utilise en priorité (caméra USB / arrière).
export function construireContraintes(facingMode = 'user', deviceId) {
  if (deviceId) {
    return { video: { width: { ideal: 1280 }, height: { ideal: 720 }, deviceId: { exact: deviceId } }, audio: false };
  }
  return { video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode }, audio: false };
}

// Messages d'aide visibles (PC & mobile)
export const MESSAGES_CAMERA = {
  permission: "La caméra est bloquée par votre navigateur. Veuillez cliquer sur l'icône de caméra dans la barre d'adresse en haut pour autoriser l'accès.",
  aucune: 'Aucune caméra détectée sur cet appareil.',
  indisponible: 'Appareil photo non autorisé.',
};

const NOMS_ERREURS_PERMISSION = new Set([
  'NotAllowedError',
  'PermissionDeniedError',
  'SecurityError',
]);
const NOMS_ERREURS_AUCUNE_CAMERA = new Set([
  'NotFoundError',
  'DevicesNotFoundError',
]);
const NOMS_ERREURS_NOTReadable = new Set([
  'NotReadableError',
  'OverconstrainedError',
  'AbortError',
]);

// Ouvre le flux vidéo : renvoie le MediaStream, ou lève une erreur normalisée
// (propriété `code` : 'permission' | 'aucune' | 'inconnue').
export async function ouvrirFluxVideo(constraints = CONTRAINTES_VIDEO) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    const e = new Error(MESSAGES_CAMERA.indisponible);
    e.code = 'permission';
    throw e;
  }
  try {
    return await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err) {
    const name = err && err.name ? err.name : '';
    const erreur = new Error(''); // eslint-disable-line no-new
    if (NOMS_ERREURS_PERMISSION.has(name)) {
      erreur.message = MESSAGES_CAMERA.permission;
      erreur.code = 'permission';
    } else if (NOMS_ERREURS_AUCUNE_CAMERA.has(name)) {
      erreur.message = MESSAGES_CAMERA.aucune;
      erreur.code = 'aucune';
    } else if (NOMS_ERREURS_NOTReadable.has(name)) {
      erreur.message = 'La caméra est déjà utilisée par une autre application ou onglet.';
      erreur.code = 'occupee';
    } else {
      erreur.message = (err && err.message) || MESSAGES_CAMERA.indisponible;
      erreur.code = 'inconnue';
      if (err && err.name) erreur.name = err.name;
    }
    throw erreur;
  }
}

// Capture l'image actuelle d'un élément <video> (flux caméra) en data URL webp compressée.
// Renvoie null si le flux n'est pas encore prêt (la transaction hors-ligne part alors sans photo).
export function capturerImageWebp(video, largeurMax = 1280) {
  try {
    if (!video || !video.videoWidth || !video.videoHeight || !video.srcObject) return null;
    const echelle = Math.min(1, largeurMax / video.videoWidth);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(video.videoWidth * echelle));
    c.height = Math.max(1, Math.round(video.videoHeight * echelle));
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, c.width, c.height);
    return c.toDataURL('image/webp', 0.65);
  } catch {
    return null;
  }
}

// Arrête proprement toutes les pistes d'un flux vidéo posé sur un élément <video>.
export function arreterFluxVideo(video) {
  if (!video) return;
  const flux = video.srcObject;
  if (flux) {
    const pistes = typeof flux.getTracks === 'function' ? flux.getTracks() : [];
    pistes.forEach((p) => { try { p.stop(); } catch {} });
    video.srcObject = null;
  }
}