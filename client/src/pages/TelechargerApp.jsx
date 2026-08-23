import { useEffect, useState } from 'react';

// Page « Télécharger l'application » — la PWA est déjà installable (manifest + service worker
// en place) ; cette page propose le bouton d'installation natif et les instructions de secours.

function detecterPlateforme() {
  const ua = navigator.userAgent || '';
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  if (ios) return 'ios';
  if (android) return 'android';
  return 'desktop';
}

export default function TelechargerApp() {
  const [invite, setInvite] = useState(null);
  const [dejaInstallee, setDejaInstallee] = useState(
    window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
  );
  const plateforme = detecterPlateforme();

  // Capte l'invite d'installation native (l'événement peut arriver après le montage de la page)
  useEffect(() => {
    if (window.__pwaInstall) setInvite(window.__pwaInstall);
    const capter = (e) => { e.preventDefault(); window.__pwaInstall = e; setInvite(e); };
    const installee = () => setDejaInstallee(true);
    window.addEventListener('beforeinstallprompt', capter);
    window.addEventListener('appinstalled', installee);
    return () => {
      window.removeEventListener('beforeinstallprompt', capter);
      window.removeEventListener('appinstalled', installee);
    };
  }, []);

  const installer = async () => {
    const e = invite || window.__pwaInstall;
    if (!e) return;
    e.prompt();
    try { await e.userChoice; } catch {}
    setInvite(null);
    window.__pwaInstall = null;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Télécharger l'application</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Installez le SaaS RH sur votre ordinateur, mobile ou tablette — même application, même compte, fonctionnement hors-ligne partiel.
        </p>
      </div>

      {/* Aperçu de l'application telle qu'elle apparaîtra installée */}
      <div className="card flex flex-col items-center gap-5 p-8 sm:flex-row sm:items-start">
        <img
          src="/icons/icon-192.png?v=20260822"
          alt="Icône XMATOR RH"
          className="h-24 w-24 rounded-3xl bg-white object-contain shadow-lg ring-4 ring-brand-100"
        />
        <div className="min-w-0 flex-1 text-center sm:text-start">
          <h3 className="text-xl font-extrabold text-slate-900">XMATOR RH</h3>
          <p className="text-sm text-slate-500">Gestion des congés, maladies & présences — Amicale du Personnel de la Banque Centrale</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3 sm:justify-start">
            {dejaInstallee ? (
              <span className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-700 ring-1 ring-emerald-200">
                ✓ Application déjà installée sur cet appareil
              </span>
            ) : (
              <button onClick={installer} disabled={!invite} className={`btn-primary px-6 py-3 ${invite ? '' : 'cursor-not-allowed opacity-60'}`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 6v3.776m-13.5 5.724h6" /></svg>
                Installer l'application
              </button>
            )}
            {!invite && !dejaInstallee && (
              <p className="text-xs text-slate-400">
                Invite non disponible ici — suivez les instructions pour {plateforme === 'ios' ? 'iPhone/iPad' : plateforme === 'android' ? 'Android' : 'votre navigateur'} ci-dessous.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Instructions par plateforme */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className={`card p-5 ${plateforme === 'ios' ? 'ring-2 ring-brand-500' : ''}`}>
          <p className="mb-2 text-sm font-bold text-slate-800"> iPhone / iPad (Safari)</p>
          <ol className="list-decimal space-y-1 ps-5 text-xs text-slate-600">
            <li>Ouvrez le site dans <b>Safari</b>.</li>
            <li>Touchez le bouton <b>Partager</b> (carré avec flèche vers le haut).</li>
            <li>Choisissez <b>« Sur l'écran d'accueil »</b>.</li>
            <li>Touchez <b>Ajouter</b>.</li>
          </ol>
        </div>
        <div className={`card p-5 ${plateforme === 'android' ? 'ring-2 ring-brand-500' : ''}`}>
          <p className="mb-2 text-sm font-bold text-slate-800"> Android (Chrome)</p>
          <ol className="list-decimal space-y-1 ps-5 text-xs text-slate-600">
            <li>Ouvrez le site dans <b>Chrome</b>.</li>
            <li>Touchez le menu <b>⋮</b> en haut à droite.</li>
            <li>Choisissez <b>« Installer l'application »</b> ou « Ajouter à l'écran d'accueil ».</li>
            <li>Confirmez <b>Installer</b>.</li>
          </ol>
        </div>
        <div className={`card p-5 ${plateforme === 'desktop' ? 'ring-2 ring-brand-500' : ''}`}>
          <p className="mb-2 text-sm font-bold text-slate-800"> Ordinateur (Windows / macOS)</p>
          <ol className="list-decimal space-y-1 ps-5 text-xs text-slate-600">
            <li>Cliquez sur <b>« Installer l'application »</b> ci-dessus, ou</li>
            <li>utilisez l'icône d'installation <b>⊕ / ⊙</b> dans la barre d'adresse du navigateur,</li>
            <li>ou le menu <b>⋮ → Installer XMATOR RH…</b>.</li>
          </ol>
        </div>
      </div>

      <p className="rounded-lg bg-sky-50 px-4 py-3 text-xs text-sky-800 ring-1 ring-sky-200">
        ℹ️ L'application installée n'est pas un programme distinct : c'est ce même SaaS rendu installable.
        Votre connexion et vos droits (rôles) s'appliquent à l'identique, y compris hors-ligne pour les pages déjà consultées.
      </p>
    </div>
  );
}
