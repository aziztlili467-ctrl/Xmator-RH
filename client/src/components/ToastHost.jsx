import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Notifications flottantes « Prestige » — haut à droite, entrée/sortie nettes.
 *
 * Usage depuis n'importe quelle page (aucun contexte à brancher) :
 *   import { toast } from '../components/ToastHost';
 *   toast.success('Demande acceptée.');
 *   toast.error('Impossible d\'enregistrer.');
 *   toast.info('Synchronisation terminée.');
 *   toast.warning('Solde faible.');
 */
const EVENT = 'app-toast';
let seq = 0;

function emit(type, message, duration = 4200) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { id: ++seq, type, message, duration } }));
}

export const toast = {
  success: (m, d) => emit('success', m, d),
  error: (m, d) => emit('error', m, d),
  warning: (m, d) => emit('warning', m, d),
  info: (m, d) => emit('info', m, d),
};

const ICONS = {
  success: '✓',
  error: '✕',
  warning: '!',
  info: 'i',
};
const TITRES = {
  success: 'Succès',
  error: 'Erreur',
  warning: 'Attention',
  info: 'Information',
};

export default function ToastHost() {
  const [items, setItems] = useState([]);
  const timers = useRef({});

  const retirer = useCallback((id) => {
    setItems((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    // Laisse jouer l'animation de sortie avant le démontage
    timers.current[id] = setTimeout(() => {
      setItems((list) => list.filter((t) => t.id !== id));
      delete timers.current[id];
    }, 190);
  }, []);

  const ajouter = useCallback((detail) => {
    const { id, type = 'info', message = '', duration = 4200 } = detail || {};
    if (!message) return;
    setItems((list) => [...list.slice(-4), { id: id || Date.now() + Math.random(), type, message, leaving: false }]);
    if (duration > 0) {
      timers.current[id] = setTimeout(() => retirer(id), duration);
    }
  }, [retirer]);

  useEffect(() => {
    const surToast = (e) => ajouter(e.detail);
    window.addEventListener(EVENT, surToast);
    return () => {
      window.removeEventListener(EVENT, surToast);
      Object.values(timers.current).forEach(clearTimeout);
      timers.current = {};
    };
  }, [ajouter]);

  if (items.length === 0) return null;

  return (
    <div className="toast-stack no-print" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast toast--${t.type}${t.leaving ? ' is-leaving' : ''}`}>
          <span className="toast-icon" aria-hidden="true">{ICONS[t.type] || ICONS.info}</span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: 'var(--text-secondary)' }}>
              {TITRES[t.type] || TITRES.info}
            </p>
            <p className="mt-0.5 text-[13px] leading-snug" style={{ color: 'var(--text-primary)' }}>{t.message}</p>
          </div>
          <button type="button" className="toast-close" onClick={() => retirer(t.id)} aria-label="Fermer la notification">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
      ))}
    </div>
  );
}
