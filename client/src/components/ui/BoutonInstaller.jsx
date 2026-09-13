import { useEffect, useState } from 'react';
import { estInstallee, guidanceInstallation } from '../../utils/pwaInstall';

// Bouton « Installer l'application » pour les PWA du domaine.
// - Chrome/Edge (Android + desktop) : déclenche l'installation native (beforeinstallprompt).
// - iOS Safari (pas d'événement natif) : affiche les instructions « Partager → Sur l'écran d'accueil ».
// - déjà installée (mode autonome) : affiche un état « ✓ Installée ».
// Basse le manifest vers /manifest-eye.webmanifest si on est sur /borne (au cas où la page
// a été atteinte par navigation SPA sans rechargement — le parse de index.html l'a déjà fait).
//
// `variante` : 'borne' (kiosque sombre, accents émeraude) ou 'saas' (gradient or).
// `compact`  : version réduite adaptée à un header.

export default function BoutonInstaller({ nomApp = 'XMATOR EYE', variante = 'saas', compact = false }) {
  const [invite, setInvite] = useState(typeof window !== 'undefined' ? window.__pwaInstall : null);
  const [installee, setInstallee] = useState(estInstallee());
  const [aide, setAide] = useState('');

  useEffect(() => {
    // Au cas où /borne est atteinte par navigation SPA : rebranche le manifest dédié et
    // invalide l'événement capté plus tôt (qui concernait le manifest racine).
    if (typeof window !== 'undefined' && location.pathname.startsWith('/borne')) {
      const lien = document.querySelector('link[rel="manifest"]');
      if (lien && !String(lien.getAttribute('href') || '').includes('manifest-eye')) {
        lien.setAttribute('href', '/manifest-eye.webmanifest');
        window.__pwaInstall = null;
        setInvite(null);
      }
    }
    const capter = (e) => {
      if (e && e.preventDefault) e.preventDefault();
      window.__pwaInstall = e;
      setInvite(e);
    };
    const marquer = () => setInstallee(true);
    if (window.__pwaInstall) setInvite(window.__pwaInstall);
    window.addEventListener('beforeinstallprompt', capter);
    window.addEventListener('appinstalled', marquer);
    return () => {
      window.removeEventListener('beforeinstallprompt', capter);
      window.removeEventListener('appinstalled', marquer);
    };
  }, []);

  const installer = async () => {
    const e = invite || window.__pwaInstall;
    if (e && typeof e.prompt === 'function') {
      try {
        e.prompt();
        if (e.userChoice) await e.userChoice;
      } catch {}
      setInvite(null);
      window.__pwaInstall = null;
      return;
    }
    setAide(guidanceInstallation(nomApp));
    setTimeout(() => setAide(''), 10000);
  };

  const iconeDownload = (
    <svg width={compact ? 14 : 17} height={compact ? 14 : 17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12M7 10l5 5 5-5M4 20h16" />
    </svg>
  );

  if (installee) {
    return compact ? (
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/30 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-300">
        ✓ Installée
      </span>
    ) : (
      <span className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-700 ring-1 ring-emerald-200">
        ✓ {nomApp} déjà installée sur cet appareil
      </span>
    );
  }

  const classesBtn = compact
    ? (variante === 'borne'
      ? 'inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/30 bg-white/10 px-3 py-1.5 text-xs font-semibold text-emerald-200 transition hover:bg-white/20'
      : 'inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 transition hover:bg-stone-50')
    : (variante === 'borne'
      ? 'inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-500 active:scale-[0.98]'
      : 'inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition hover:brightness-110 active:scale-[0.98]');

  return (
    <div className={compact ? '' : 'flex flex-col items-start gap-2'}>
      <button type="button" onClick={installer} className={classesBtn} style={!compact && variante === 'saas' ? { background: 'var(--gold-grad)', color: '#2E2013', boxShadow: 'var(--shadow-gold)' } : undefined}>
        {iconeDownload}
        Installer {compact ? '' : `l'application ${nomApp}`}
      </button>
      {aide && (
        <p className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${variante === 'borne' ? 'border border-amber-300/20 bg-amber-300/10 text-amber-200' : 'border border-amber-200 bg-amber-50 text-amber-800'}`}>
          {aide}
        </p>
      )}
    </div>
  );
}