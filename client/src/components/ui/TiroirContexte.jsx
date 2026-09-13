import { useEffect } from 'react';

/**
 * TiroirContexte — panneau latéral escamotable à droite (type tiroir).
 * S'anime élégamment (slide + blur) quand on clique un KPI, un segment du
 * donut ou une ligne du tableau. Fermeture par Échap / clic sur le voile.
 */
export default function TiroirContexte({ open, onClose, title, subtitle, badge, children }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div data-theme="dark-premium" className="fixed inset-0 z-[70]">
      <div className="dp-overlay" onClick={onClose} aria-hidden="true" style={{ zIndex: 0 }} />
      <aside className="dp-drawer" role="dialog" aria-modal="true" aria-label={title || 'Détails contextuels'}>
        {/* En-tête */}
        <header className="flex items-start justify-between gap-3 border-b px-5 pb-4 pt-5" style={{ borderColor: 'rgba(227,185,77,0.22)' }}>
          <div className="min-w-0">
            {badge && <span className="chip chip--gold mb-2">{badge}</span>}
            <h3 className="truncate text-[15px] font-extrabold tracking-tight" style={{ color: 'var(--dp-text)' }}>{title}</h3>
            {subtitle && <p className="mt-0.5 text-[11.5px]" style={{ color: 'var(--dp-text-3)' }}>{subtitle}</p>}
          </div>
          <button type="button" className="icon-btn shrink-0" onClick={onClose} aria-label="Fermer le panneau">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </header>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
      </aside>
    </div>
  );
}
