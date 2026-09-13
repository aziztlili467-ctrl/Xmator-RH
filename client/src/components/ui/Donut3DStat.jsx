import { useState, useMemo } from 'react';

export default function Donut3DStat({ data = [], size = 220, interactive = true }) {
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const total = useMemo(() => data.reduce((s, d) => s + (d.value || 0), 0), [data]);
  const gradient = useMemo(() => {
    if (!total) return 'conic-gradient(#e2e8f0 0 100%)';
    let acc = 0;
    const stops = data.map((d) => {
      const start = (acc / total) * 100;
      acc += d.value;
      const end = (acc / total) * 100;
      // glow variant
      return `${d.color} ${start}% ${end}%`;
    });
    return `conic-gradient(${stops.join(', ')})`;
  }, [data, total]);

  const active = hoveredIdx !== null ? data[hoveredIdx] : null;
  const centerValue = active ? `${active.value}` : `${total}`;
  const centerLabel = active ? active.name : 'Total';
  const centerPct = active ? `${total ? Math.round((active.value / total) * 100) : 0}%` : `${total}`;

  // responsive size handled via container style
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
  const rotateX = isMobile ? 3 : 8;

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="relative"
        style={{
          width: size,
          height: size,
          aspectRatio: '1/1',
          filter: 'drop-shadow(0 6px 12px rgba(0,0,0,0.28))',
        }}
      >
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: gradient,
            transform: `rotateX(${rotateX}deg)`,
            borderRadius: '50%',
            boxShadow: 'inset 0 4px 10px rgba(0,0,0,0.28)',
          }}
        >
          {/* glossy highlight */}
          <div
            className="pointer-events-none absolute"
            style={{
              top: '8%',
              left: '12%',
              width: '42%',
              height: '32%',
              background: 'radial-gradient(ellipse at 30% 30%, rgba(255,255,255,0.38) 0%, rgba(255,255,255,0.18) 35%, transparent 70%)',
              borderRadius: '50%',
              opacity: 0.9,
              transform: 'rotate(-12deg)',
            }}
          />
          {/* inner hole clair pour chiffres noir/marron */}
          <div
            className="absolute"
            style={{
              inset: '26%',
              background: '#ffffff',
              borderRadius: '50%',
              border: '1px solid rgba(15,23,42,0.08)',
              boxShadow: 'inset 0 1px 4px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.12)',
            }}
          />
        </div>

        {/* segments overlay for interactivity - invisible hit areas */}
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" style={{ transform: `rotateX(${rotateX}deg)`, borderRadius: '50%' }}>
          {data.map((d, i) => {
            const startAngle = data.slice(0, i).reduce((s, x) => s + x.value, 0) / total * 360;
            const sweep = (d.value / total) * 360;
            const isActive = hoveredIdx === i;
            return (
              <circle
                key={d.name}
                cx="50" cy="50" r="38"
                fill="transparent"
                stroke="transparent"
                strokeWidth="22"
                strokeDasharray={`${(d.value / total) * 238.76} 238.76`}
                transform={`rotate(${startAngle - 90} 50 50)`}
                style={{
                  transformOrigin: '50% 50%',
                  transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)',
                  cursor: interactive ? 'pointer' : 'default',
                  filter: isActive ? 'brightness(1.25)' : 'none',
                  scale: isActive ? '1.04' : '1',
                }}
                onMouseEnter={() => interactive && setHoveredIdx(i)}
                onMouseLeave={() => interactive && setHoveredIdx(null)}
                onTouchStart={() => interactive && setHoveredIdx(i)}
                onClick={() => interactive && setHoveredIdx(i)}
              />
            );
          })}
        </svg>

        {/* center label - légende seule sans chiffres */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 pointer-events-none px-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: '#92400e', fontFamily: "var(--font-sans)" }}>{centerLabel}</span>
        </div>
      </div>

      {data.map((d, i) => {
        const start = data.slice(0, i).reduce((s, x) => s + x.value, 0) / total * 360;
        const sweep = (d.value / total) * 360;
        const mid = start - 90 + sweep / 2;
        const rad = (mid * Math.PI) / 180;
        const cx = size / 2, cy = size / 2;
        const rLabel = size * 0.72;
        const x = cx + Math.cos(rad) * rLabel;
        const y = cy + Math.sin(rad) * rLabel;
        if (d.value / total < 0.04) return null;
        return (
          <div
            key={`lab-${d.name}`}
            className="absolute flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold shadow-md"
            style={{
              left: x, top: y, transform: 'translate(-50%,-50%)',
              background: 'white', borderColor: d.color, color: d.color,
              fontFamily: "var(--font-sans)",
            }}
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
          >
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: d.color }} />
            {d.name}
          </div>
        );
      })}
    </div>
  );
}
