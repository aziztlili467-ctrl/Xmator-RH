import { useEffect, useState } from 'react';
export default function KpiCard({ label, value, trend, icon: Icon, accent = 'var(--chart-1)', delay = 0 }) {
  const [display, setDisplay] = useState(0);
  const numeric = Number(String(value).replace(/[^0-9.-]/g, '')) || 0;
  const isNumeric = !isNaN(numeric);
  useEffect(() => {
    if (!isNumeric) return;
    let raf; let start = null;
    const step = (ts) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / 800, 1);
      setDisplay(Math.round(numeric * p));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    const t = setTimeout(() => { raf = requestAnimationFrame(step); }, delay);
    return () => { clearTimeout(t); cancelAnimationFrame(raf); };
  }, [numeric, isNumeric, delay]);
  return (
    <div className="panel flex flex-col gap-3" style={{ animation: `fadeIn 0.4s ease ${delay}ms both` }}>
      <div className="flex items-start justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-secondary)' }}>{label}</span>
        <span className="icon-badge" style={{ background: `linear-gradient(135deg, ${accent}, transparent)`, width: 36, height: 36, borderRadius: 'var(--radius-card)', color: 'white' }}><Icon /></span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-[28px] font-extrabold leading-none" style={{ color: 'var(--text-primary)' }}>{isNumeric ? display : value}</span>
        {trend && <span className="text-xs font-bold" style={{ color: trend.startsWith('+') ? 'var(--status-approved)' : trend.startsWith('-') ? 'var(--status-rejected)' : 'var(--text-muted)' }}>{trend}</span>}
      </div>
    </div>
  );
}
