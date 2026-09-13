import { useMemo, useRef, useState } from 'react';
import { fmtJours } from '../../utils';

// Format compact FR avec séparateur de milliers (1 décimale si nécessaire)
const fmtNum = (v) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(v).replace(/\u202f/g, '\u00a0');

/**
 * DonutPro — anneau SVG fait main (pas un donut recharts basique) :
 *  • segments en arcs stroke-dasharray, ouverture animée au montage ;
 *  • survol : le segment s'épaissit (expansion animée), les autres s'estompent,
 *    glow coloré, tooltip « glass » positionné qui détaille jours + %,
 *  • le centre bascule sur la valeur du segment survolé (transition douce).
 *
 * data : [{ name, value, color, glow? }]
 */
export default function DonutPro({ data = [], size = 220, thickness = 26, unit = 'j', onSelect }) {
  const [active, setActive] = useState(null);
  const [tipPos, setTipPos] = useState(null);
  const wrapRef = useRef(null);

  const total = useMemo(() => data.reduce((s, d) => s + (d.value || 0), 0), [data]);
  const R = 50 - (thickness / 2) / 1.06;
  const C = 2 * Math.PI * R;

  const segments = useMemo(() => {
    if (!total) return [];
    let acc = 0;
    return data.map((d, i) => {
      const frac = d.value / total;
      const seg = {
        ...d,
        i,
        frac,
        dash: Math.max(frac * C - 1.6, 0.6),
        offset: acc * C,
      };
      acc += frac;
      return seg;
    });
  }, [data, total]);

  const act = active != null ? segments[active] : null;

  const handleMove = (e) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  return (
    <div
      ref={wrapRef}
      className={`donut-wrap ${act ? 'has-active' : ''} relative flex items-center justify-center`}
      style={{ width: size, height: size }}
      onMouseMove={handleMove}
      onMouseLeave={() => setActive(null)}
    >
      <svg viewBox="0 0 100 100" className="h-full w-full" style={{ transform: 'rotate(-90deg)', overflow: 'visible' }}>
        {/* piste */}
        <circle cx="50" cy="50" r={R} fill="none" stroke="rgba(148,163,199,0.10)" strokeWidth={thickness * 0.62} />
        {segments.map((s) => (
          <circle
            key={s.name}
            className={`donut-seg ${active === s.i ? 'is-active' : ''}`}
            cx="50"
            cy="50"
            r={R}
            fill="none"
            stroke={s.color}
            strokeWidth={active === s.i ? thickness + 7 : thickness}
            strokeLinecap="butt"
            strokeDasharray={`${s.dash} ${C - s.dash}`}
            strokeDashoffset={-s.offset}
            style={{ '--seg-glow': `${s.color}99`, transitionDelay: `${s.i * 90}ms` }}
            onMouseEnter={() => setActive(s.i)}
            onClick={() => onSelect && onSelect(s)}
          />
        ))}
        {/* liseré intérieur or */}
        <circle cx="50" cy="50" r={R - thickness / 2 - 2.5} fill="none" stroke="rgba(227,185,77,0.28)" strokeWidth="0.35" />
      </svg>

      {/* Centre */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none" style={{ padding: '18%' }}>
        <span className="donut-center-val text-[22px] font-extrabold leading-none" style={{ color: act ? act.color : 'var(--dp-text)' }}>
          {act ? `${Math.round(act.frac * 1000) / 10} %` : fmtNum(total)}
        </span>
        <span className="mt-1 text-[9.5px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--dp-text-3)' }}>
          {act ? act.name : `total ${unit === 'j' ? 'journées' : unit}`}
        </span>
      </div>

      {/* Tooltip sophistiquée */}
      {act && tipPos && (
        <div
          className="tip"
          style={{
            left: Math.min(Math.max(tipPos.x + 14, 8), size - 8),
            top: Math.max(tipPos.y - 64, -8),
            transform: tipPos.x > size * 0.62 ? 'translateX(-100%)' : 'none',
          }}
        >
          <p className="tip-title flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: act.color, boxShadow: `0 0 8px ${act.color}` }} />
            {act.name}
          </p>
          <div className="tip-row"><span>Journées</span><b>{fmtJours(act.value)} j</b></div>
          <div className="tip-row"><span>Part du total</span><b>{Math.round(act.frac * 1000) / 10} %</b></div>
          {onSelect && <p className="mt-1.5 text-[10px]" style={{ color: 'var(--dp-gold)' }}>Cliquer pour ouvrir le détail →</p>}
        </div>
      )}
    </div>
  );
}
