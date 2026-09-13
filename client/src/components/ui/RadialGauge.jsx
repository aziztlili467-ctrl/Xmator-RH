import { useEffect, useRef, useState } from 'react';

/**
 * RadialGauge — jauge radiale « cockpit » : arc à dégradé, graduations
 * (ticks) qui s'allument jusqu'à la valeur, balayage animé au montage,
 * valeur en mono au centre, halo coloré. Variante mini pour clusters.
 */
export default function RadialGauge({
  pct,                    // 0..100
  label,
  sub,
  color = '#e3b94d',
  size = 168,
  mini = false,
  onClick,
}) {
  const [t, setT] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const target = Math.max(0, Math.min(100, pct == null ? 0 : pct));
    if (reduce) { setT(target); return undefined; }
    const start = performance.now();
    const dur = 1300;
    const ease = (x) => 1 - Math.pow(1 - x, 4);
    const step = (now) => {
      const p = Math.min((now - start) / dur, 1);
      setT(target * ease(p));
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [pct]);

  // arc de 250°, gap en bas
  const START = 145;
  const SWEEP = 250;
  const R = 42;
  const ARC = (SWEEP / 360) * 2 * Math.PI * R;
  const val = (t / 100) * ARC;
  const angle = START + (Math.min(pct ?? 0, 100) / 100) * SWEEP;
  const ticks = Array.from({ length: 21 }, (_, i) => START + (i / 20) * SWEEP);
  const lit = t / 100 * 21;

  const gid = `gauge-grad-${(label || '').replace(/\W/g, '')}-${color.slice(1)}`;

  return (
    <div
      className={`relative flex flex-col items-center ${onClick ? 'cursor-pointer group/gauge' : ''}`}
      onClick={onClick}
      style={{ width: size }}
      title={onClick ? 'Cliquer pour le détail dans le panneau contextuel' : undefined}
    >
      <svg viewBox="0 0 100 100" style={{ width: '100%', overflow: 'visible', transform: 'scale(1.01)' }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.55" />
            <stop offset="70%" stopColor={color} />
            <stop offset="100%" stopColor="#ffe9a8" stopOpacity="0.9" />
          </linearGradient>
        </defs>

        {/* graduations */}
        {ticks.map((a, i) => {
          const on = i < lit;
          const rad = (a * Math.PI) / 180;
          const r1 = 47.5; const r2 = i % 5 === 0 ? 43 : 45;
          return (
            <line
              key={i}
              x1={50 + Math.cos(rad) * r1} y1={50 + Math.sin(rad) * r1}
              x2={50 + Math.cos(rad) * r2} y2={50 + Math.sin(rad) * r2}
              stroke={on ? color : 'rgba(148,163,199,0.18)'}
              strokeWidth={i % 5 === 0 ? 1.4 : 0.8}
              strokeLinecap="round"
              style={{ transition: 'stroke 0.3s ease', filter: on ? `drop-shadow(0 0 3px ${color}aa)` : 'none' }}
            />
          );
        })}

        {/* piste */}
        <circle
          cx="50" cy="50" r={R} fill="none"
          stroke="rgba(148,163,199,0.10)" strokeWidth={mini ? 9 : 8} strokeLinecap="round"
          strokeDasharray={`${ARC} ${2 * Math.PI * R}`}
          transform={`rotate(${START} 50 50)`}
        />
        {/* arc de valeur */}
        <circle
          cx="50" cy="50" r={R} fill="none"
          stroke={`url(#${gid})`} strokeWidth={mini ? 9 : 8} strokeLinecap="round"
          strokeDasharray={`${val} ${2 * Math.PI * R}`}
          transform={`rotate(${START} 50 50)`}
          style={{ filter: `drop-shadow(0 0 ${mini ? 4 : 7}px ${color}66)` }}
        />
        {/* curseur */}
        <circle
          cx={50 + Math.cos((angle * Math.PI) / 180) * R}
          cy={50 + Math.sin((angle * Math.PI) / 180) * R}
          r={mini ? 2.4 : 3}
          fill="#fff"
          stroke={color}
          strokeWidth="1.4"
          style={{ filter: `drop-shadow(0 0 6px ${color})`, opacity: t > 0.5 ? 1 : 0, transition: 'opacity .4s' }}
        />
      </svg>

      <div className="absolute inset-x-0 flex flex-col items-center" style={{ top: mini ? '34%' : '36%' }}>
        <span
          className={`num font-extrabold leading-none ${mini ? 'text-[16px]' : 'text-[24px]'}`}
          style={{ color: 'var(--dp-text)' }}
        >
          {pct == null ? '—' : `${Math.round(pct)} %`}
        </span>
      </div>

      <div className="mt-1 text-center">
        <p className={`font-bold uppercase tracking-[0.12em] ${mini ? 'text-[10px]' : 'text-[11px]'}`} style={{ color: 'var(--dp-text-2)' }}>{label}</p>
        {sub && <p className="num mt-0.5 text-[10.5px]" style={{ color: 'var(--dp-text-3)' }}>{sub}</p>}
      </div>
    </div>
  );
}
