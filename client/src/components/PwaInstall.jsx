import { useEffect, useState } from 'react';

// Bannière « Installer l'application » (PWA) — capte beforeinstallprompt (Chrome/Android),
// propose l'installation et disparaît une fois installé. iOS Safari n'émet pas cet événement
// (ajout via « Partager → Ajouter à l'écran d'accueil »).
export default function PwaInstall() {
  const [prompt, setPrompt] = useState(null);
  const [installe, setInstalle] = useState(false);
  const [ferme, setFerme] = useState(false);

  useEffect(() => {
    const onPrompt = (e) => {
      e.preventDefault();
      setPrompt(e);
    };
    const onInstalled = () => { setInstalle(true); setPrompt(null); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!prompt || installe || ferme) return null;

  const installer = async () => {
    if (!prompt) return;
    prompt.prompt();
    try { await prompt.userChoice; } catch {}
    setPrompt(null);
  };

  return (
    <div className="fixed inset-x-4 bottom-4 z-50 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl ring-1 ring-slate-900/5 md:inset-x-auto md:end-6 md:w-96">
      <img src="/icons/icon-192.png" alt="Amicale RH" className="h-11 w-11 shrink-0 rounded-xl ring-1 ring-slate-200" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-slate-800">Installer Amicale RH</p>
        <p className="text-xs leading-snug text-slate-500">Accès rapide depuis l'écran d'accueil, même hors-ligne.</p>
      </div>
      <button onClick={installer} className="btn-primary shrink-0 px-3">
        Installer
      </button>
      <button onClick={() => setFerme(true)} title="Fermer" className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </div>
  );
}