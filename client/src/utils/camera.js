// Utilitaire caméra unifié (PC webcams + smartphones) : demande de permission avec
// try/catch robuste, messages d'erreur explicites et arrêt propre des pistes vidéo.

export const CONTRAINTES_VIDEO = {
  video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
  audio: false,
};

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
  'OverconstrainedError',
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
    } else {
      erreur.message = (err && err.message) || MESSAGES_CAMERA.indisponible;
      erreur.code = 'inconnue';
      if (err && err.name) erreur.name = err.name;
    }
    throw erreur;
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