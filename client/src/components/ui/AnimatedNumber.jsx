import { useEffect, useRef, useState } from 'react';

// Formatage « data-driven » à la française : 85 456,96 — espace fine insécable,
// virgule décimale, chiffres tabulaires.
export function fmtFr(v, decimals = 0) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(v).replace(/\u202f/g, '\u00a0');
}

/**
 * AnimatedNumber — compteur qui défile au montage ET à chaque changement de
 * valeur (transition douce lors des re-filtres). Respecte prefers-reduced-motion.
 *
 * <AnimatedNumber value={85456.96} decimals={2} unit="h" duration={1100} />
 */
export default function AnimatedNumber({
  value,
  decimals = 0,
  unit = '',
  duration = 1100,
  className = '',
  style,
  prefix = '',
}) {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);
  const rafRef = useRef(0);
  const numeric = Number(value);
  const isNumeric = Number.isFinite(numeric);

  useEffect(() => {
    if (!isNumeric) return undefined;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setDisplay(numeric); fromRef.current = numeric; return undefined; }
    const from = fromRef.current;
    const start = performance.now();
    const ease = (t) => 1 - Math.pow(1 - t, 3); // ease-out cubic
    const step = (now) => {
      const p = Math.min((now - start) / duration, 1);
      const v = from + (numeric - from) * ease(p);
      setDisplay(v);
      if (p < 1) rafRef.current = requestAnimationFrame(step);
      else fromRef.current = numeric;
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [numeric, isNumeric, duration]);

  if (!isNumeric) {
    return <span className={className} style={style}>{prefix}{value == null ? '—' : String(value)}{unit && <span className="kpi-unit">{unit}</span>}</span>;
  }
  return (
    <span className={className} style={style}>
      {prefix}
      {fmtFr(display, decimals)}
      {unit && <span className="kpi-unit">{unit}</span>}
    </span>
  );
}
