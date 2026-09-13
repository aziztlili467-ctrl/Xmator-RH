// Aide à l'installation des PWA du domaine. `beforeinstallprompt` n'est émis que par
// Chrome/Edge (Android + desktop) ; iOS Safari installe uniquement via « Partager → Sur
// l'écran d'accueil ». La borne XMATOR EYE est une app séparée : son manifest dédié
// (/manifest-eye.webmanifest) est basculé dès le parse dans index.html sur la route /borne.

export function estInstallee() {
  return (
    typeof window !== 'undefined'
    && (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true)
  );
}

export function detecterPlateforme() {
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

export function guidanceInstallation(nomApp = 'XMATOR EYE') {
  const p = detecterPlateforme();
  if (p === 'ios') {
    return "iPhone / iPad : touchez le bouton Partager (carré + flèche) puis « Sur l'écran d'accueil » et enfin « Ajouter ».";
  }
  if (p === 'android') {
    return 'Chrome (Android) : menu ⋮ → « Installer l\'application » ou « Ajouter à l\'écran d\'accueil », puis Installer.';
  }
  return `Chrome / Edge : icône d'installation dans la barre d'adresse, ou menu ⋮ → « Installer ${nomApp}… ».`;
}