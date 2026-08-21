import { useEffect, useState } from 'react';

// Bannière flottante « Installer l'application » — s'affiche sur TOUS les appareils (PC + mobile),
// 20 secondes puis disparaît automatiquement sans gêner la navigation.
// Style : glassmorphism sombre, bordure dégradée lumineuse, halo glow, reflet balayant (saas-ui-designer).
// - Chrome/Edge/Android : le bouton déclenche l'installation native (beforeinstallprompt).
// - iOS Safari (n'émet pas l'événement) : geste manuel « Partager → Sur l'écran d'accueil ».
// - Masquée si l'app est déjà installée (mode autonome) ou fermée manuellement (7 jours de paix).

const DELAI_APPARITION = 2000;
const DUREE_AFFICHAGE = 20000;
const CLE_FERMETURE = 'pwa_banniere_fermee_le';

export default function PwaInstall() {
  const [promptEvent, setPromptEvent] = useState(null);
  const [visible, setVisible] = useState(false);
  const [aide, setAide] = useState('');

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) return undefined;
    const fermeeLe = Number(localStorage.getItem(CLE_FERMETURE) || 0);
    if (fermeeLe && Date.now() - fermeeLe < 7 * 24 * 3600 * 1000) return undefined;

    const onPrompt = (e) => { e.preventDefault(); setPromptEvent(e); };
    const onInstalled = () => setVisible(false);
    // Événement potentiellement émis avant le montage (capté tôt dans index.html)
    if (window.__pwaInstall) setPromptEvent(window.__pwaInstall);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);

    const tApparition = setTimeout(() => setVisible(true), DELAI_APPARITION);
    const tDisparition = setTimeout(() => setVisible(false), DELAI_APPARITION + DUREE_AFFICHAGE);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      clearTimeout(tApparition);
      clearTimeout(tDisparition);
    };
  }, []);

  const fermer = () => {
    localStorage.setItem(CLE_FERMETURE, String(Date.now()));
    setVisible(false);
  };

  const installer = async () => {
    if (promptEvent) {
      try {
        promptEvent.prompt();
        await promptEvent.userChoice;
      } catch {}
      setVisible(false);
      return;
    }
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setAide(ios
      ? 'iPhone / iPad : bouton Partager ▲ puis « Sur l’écran d’accueil »'
      : 'Chrome / Edge : menu ⋮ puis « Installer XMATOR RH »');
    setTimeout(() => setAide(''), 9000);
  };

  return (
    <div
      className={`fixed left-1/2 top-4 z-[70] w-[calc(100vw-1.5rem)] max-w-md -translate-x-1/2 transition-all duration-500 ease-out sm:top-6 ${
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-8 opacity-0'
      }`}
      role="dialog"
      aria-label="Proposition d'installation de l'application"
    >
      <style>{`
        @keyframes pwa-brillance { 0% { transform: translateX(-130%) skewX(-18deg); } 55%, 100% { transform: translateX(340%) skewX(-18deg); } }
        @keyframes pwa-halo { 0%, 100% { opacity: .55; transform: scale(1); } 50% { opacity: .95; transform: scale(1.04); } }
        @keyframes pwa-pouls { 0%, 100% { transform: scale(1); box-shadow: 0 0 18px rgba(129,140,248,.55); } 50% { transform: scale(1.07); box-shadow: 0 0 30px rgba(232,121,249,.75); } }
        @keyframes pwa-progression { from { width: 100%; } to { width: 0%; } }
      `}</style>

      {/* Halo lumineux derrière la carte */}
      <div
        className="pointer-events-none absolute -inset-2 rounded-[28px] bg-gradient-to-r from-indigo-600/40 via-fuchsia-500/40 to-cyan-400/40 blur-xl"
        style={{ animation: 'pwa-halo 3s ease-in-out infinite' }}
      />

      {/* Bordure dégradée 1px */}
      <div className="relative rounded-2xl bg-gradient-to-r from-indigo-500/80 via-fuchsia-500/80 to-cyan-400/80 p-px shadow-[0_12px_45px_rgba(99,102,241,0.35)]">
        <div className="relative overflow-hidden rounded-2xl bg-slate-950/90 backdrop-blur-xl">
          {/* Reflet balayant */}
          <div
            className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/15 to-transparent"
            style={{ animation: 'pwa-brillance 3.4s ease-in-out infinite' }}
          />

          {/* Bouton fermer — coin supérieur droit */}
          <button
            onClick={fermer}
            title="Fermer"
            aria-label="Fermer la bannière d'installation"
            className="absolute end-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-white/10 text-slate-300 transition-all duration-200 ease-in-out hover:bg-white/20 hover:text-white active:scale-90"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>

          <div className="flex items-center gap-3 p-4 pe-9">
            <img
              src="/icons/icon-192.png"
              alt="XMATOR RH"
              className="h-12 w-12 shrink-0 rounded-xl bg-white object-contain p-0.5 ring-1 ring-white/40"
              style={{ animation: 'pwa-pouls 2.4s ease-in-out infinite' }}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-extrabold tracking-tight text-white sm:text-[15px]">
                Installez <span className="bg-gradient-to-r from-indigo-300 via-fuchsia-300 to-cyan-300 bg-clip-text text-transparent">XMATOR RH</span> sur votre appareil
              </p>
              <p className="mt-0.5 text-[11px] font-medium leading-snug text-slate-300">
                Accès en un clic depuis l’écran d’accueil · rapide · hors ligne
              </p>
              {aide && (
                <p className="mt-1.5 rounded-lg border border-amber-300/20 bg-amber-300/10 px-2 py-1 text-[11px] font-semibold text-amber-200">
                  {aide}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 px-4 pb-4 -mt-1">
            <button
              onClick={installer}
              className="flex-1 rounded-xl bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 px-4 py-2 text-sm font-bold text-white shadow-[0_4px_20px_rgba(139,92,246,0.5)] transition-all duration-200 ease-in-out hover:brightness-110 active:scale-[0.98]"
            >
              Installer l’application
            </button>
          </div>

          {/* Barre de temps : disparition auto après 20 s */}
          <div className="h-0.5 w-full bg-white/10">
            <div
              className="h-full bg-gradient-to-r from-indigo-400 via-fuchsia-400 to-cyan-300"
              style={{ animation: `pwa-progression ${DUREE_AFFICHAGE}ms linear forwards` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
