import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

/**
 * AvatarMenu — bloc utilisateur « haut de gamme » : avatar à anneau or en
 * dégradé rotatif, pastille de présence, dropdown animé (pop + items en
 * cascade) avec actions rapides : profil, mon espace, apparence, déconnexion.
 */
const ICONS = {
  user: <path d="M12 12a4 4 0 100-8 4 4 0 000 8zm-7 8a7 7 0 0114 0" />,
  calendar: <path d="M7 3v3m10-3v3M4 8h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z" />,
  list: <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />,
  spark: <path d="M12 3l1.8 4.9L18.7 9l-4.9 1.8L12 15.7l-1.8-4.9L5.3 9l4.9-1.1L12 3zM19 16l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1z" />,
  power: <path d="M12 3v8m4.9-5.9a7 7 0 11-9.8 0" />,
};

function MenuIcon({ name }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name] || ICONS.user}
    </svg>
  );
}

export default function AvatarMenu({ user, onLogout, links = true }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const initiales = ((user?.nom || user?.login || 'XR').charAt(0) + (user?.prenom || '').charAt(0)).toUpperCase() || 'AD';
  const nom = user?.nom ? `${user.nom} ${user.prenom || ''}`.trim() : (user?.login || 'Admin Xmator');
  const role = user?.role === 'super_admin' ? 'Super administrateur' : user?.role === 'moderateur' ? 'Modérateur' : user?.role === 'consultation' ? 'Consultation' : 'Invité démo';

  const items = [
    { key: 'fiche', label: 'Fiche de profil', icon: 'user', to: links ? '/fiche-signaletique/profil' : undefined, d: 20 },
    { key: 'espace', label: 'Mon espace congés', icon: 'calendar', to: links ? '/mon-espace' : undefined, d: 55 },
    { key: 'journal', label: 'Journal des mouvements', icon: 'list', to: links ? '/journal' : undefined, d: 90 },
    { key: 'prefs', label: 'Préférences d’affichage', icon: 'spark', d: 125, action: () => setOpen(false) },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2.5 rounded-2xl p-1 pe-2.5 transition-all duration-300"
        style={{ border: `1px solid ${open ? 'rgba(227,185,77,0.5)' : 'rgba(197,178,128,0.16)'}`, background: open ? 'rgba(227,185,77,0.07)' : 'rgba(255,255,255,0.03)' }}
      >
        <span className="avatar-ring">
          <span className="avatar-core">{initiales}</span>
          <span className="avatar-status" title="En ligne" />
        </span>
        <span className="hidden text-start sm:block">
          <span className="block max-w-[130px] truncate text-[12.5px] font-bold leading-tight" style={{ color: 'var(--dp-text)' }}>{nom}</span>
          <span className="block text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--dp-gold)' }}>{role}</span>
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="text-[var(--dp-text-3)]" className={`transition-transform duration-300 ${open ? 'rotate-180' : ''}`}><path d="M6 9l6 6 6-6" /></svg>
      </button>

      {open && (
        <div className="menu-pop" role="menu">
          <div className="flex items-center gap-3 px-3 pb-3 pt-2">
            <span className="avatar-ring" style={{ width: 40, height: 40 }}><span className="avatar-core" style={{ fontSize: 13 }}>{initiales}</span></span>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-extrabold" style={{ color: 'var(--dp-text)' }}>{nom}</p>
              <p className="num truncate text-[10.5px]" style={{ color: 'var(--dp-text-3)' }}>{user?.login || 'admin@xmator.rh'} · {role}</p>
            </div>
          </div>
          <div className="divider-gold mx-2 mb-1.5" />
          {items.map((it) => {
            const inner = (
              <>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: 'rgba(227,185,77,0.08)', border: '1px solid rgba(227,185,77,0.22)', color: 'var(--dp-gold-bright)' }}><MenuIcon name={it.icon} /></span>
                <span className="flex-1">{it.label}</span>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="opacity-40"><path d="M9 6l6 6-6 6" /></svg>
              </>
            );
            const style = { '--d': `${it.d}ms` };
            return it.to && links ? (
              <Link key={it.key} to={it.to} className="menu-item" role="menuitem" style={style} onClick={() => setOpen(false)}>{inner}</Link>
            ) : (
              <button key={it.key} type="button" className="menu-item" role="menuitem" style={style} onClick={it.action || (() => setOpen(false))}>{inner}</button>
            );
          })}
          <div className="divider-gold mx-2 my-1.5" />
          <button
            type="button"
            role="menuitem"
            className="menu-item menu-item--danger"
            style={{ '--d': '160ms' }}
            onClick={() => { setOpen(false); onLogout?.(); }}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: 'rgba(251,113,133,0.12)', border: '1px solid rgba(251,113,133,0.3)', color: '#fda4af' }}><MenuIcon name="power" /></span>
            <span className="flex-1">Se déconnecter</span>
          </button>
        </div>
      )}
    </div>
  );
}
