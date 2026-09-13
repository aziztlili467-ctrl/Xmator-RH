import { useEffect, useMemo, useState } from 'react';

const sid = (n) => `sa-${String(n).replace(/[^A-Za-z0-9]/g, '')}`;

const W = 960;
const H = 300;
const PLOT_X0 = 46;
const PLOT_X1 = W - 14;
const PLOT_BOTTOM = H - 28;
const PLOT_TOP = 16;

export default function StatsAreasChart({ rows = [], colors = {}, onPick, height = H }) {
  const [hidden, setHidden] = useState({});
  const [hoverIdx, setHoverIdx] = useState(null);
  const [mount, setMount] = useState(false);

  useEffect(() => {
    const t = requestAnimationFrame(() => setMount(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const cats = useMemo(() => Object.keys(colors), [colors]);

  const data = useMemo(() => rows.map((r) => ({
    label: r.label,
    tot: r.tot,
    cells: cats.map((name) => {
      const c = (r.cats || []).find((x) => x.name === name);
      return { name, j: Number(c?.j) || 0, pct: Number(c?.pct) || 0 };
    }),
  })), [rows, cats]);

  const maxVal = useMemo(() => {
    let m = 0;
    for (const r of data) for (const c of r.cells) m = Math.max(m, c.j);
    return Math.max(5, Math.ceil(m / 5) * 5);
  }, [data]);

  if (!data.length) {
    return <p className="py-10 text-center text-sm" style={{ color: 'var(--dp-text-3)' }}>Aucune donnée sur la période filtrée.</p>;
  }

  const chartH = PLOT_BOTTOM - PLOT_TOP;
  const stepX = data.length > 1 ? (PLOT_X1 - PLOT_X0) / (data.length - 1) : 0;
  const x = (i) => (data.length === 1 ? (PLOT_X0 + PLOT_X1) / 2 : PLOT_X0 + i * stepX);
  const y = (v) => PLOT_BOTTOM - Math.min(1, v / maxVal) * chartH;

  const activeCats = cats.filter((name) => !hidden[name] && data.some((r) => r.cells.find((c) => c.name === name)?.j > 0));

  const buildPath = (pts) => {
    if (!pts.length) return '';
    let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const cx1 = p1.x + (p2.x - p0.x) / 6;
      const cy1 = p1.y + (p2.y - p0.y) / 6;
      const cx2 = p2.x - (p3.x - p1.x) / 6;
      const cy2 = p2.y - (p3.y - p1.y) / 6;
      d += ` C ${cx1.toFixed(1)} ${cy1.toFixed(1)}, ${cx2.toFixed(1)} ${cy2.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
    return d;
  };

  const series = activeCats.map((name) => ({
    name,
    pts: data.map((r, i) => ({ x: x(i), y: y(r.cells.find((c) => c.name === name)?.j || 0) })),
  }));

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * maxVal);
  const clampPct = (p) => Math.max(14, Math.min(86, p));
  const tipLeft = hoverIdx !== null ? clampPct((x(hoverIdx) / W) * 100) : 0;

  return (
    <div className="mt-3" style={{ position: 'relative' }}>
      <svg width="100%" height={height} viewBox={`0 0 ${W} ${height}`} style={{ display: 'block' }}>
        <defs>
          {cats.map((name) => (
            <linearGradient key={name} id={sid(name)} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colors[name]} stopOpacity="0.04" />
              <stop offset="55%" stopColor={colors[name]} stopOpacity="0.2" />
              <stop offset="100%" stopColor={colors[name]} stopOpacity="0.4" />
            </linearGradient>
          ))}
        </defs>

        {ticks.map((t) => (
          <g key={t}>
            <line x1={PLOT_X0} x2={PLOT_X1} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'rgba(148,163,199,0.22)' : 'rgba(148,163,199,0.12)'} strokeDasharray={t === 0 ? '0' : '3 4'} />
            <text x={PLOT_X0 - 8} y={y(t) + 3} textAnchor="end" style={{ fill: 'var(--dp-text-3)', fontSize: 9.5 }}>{Math.round(t)}</text>
          </g>
        ))}

        {series.map((s, si) => {
          const dLine = buildPath(s.pts);
          const dArea = s.pts.length ? `${dLine} L ${s.pts[s.pts.length - 1].x.toFixed(1)} ${PLOT_BOTTOM} L ${s.pts[0].x.toFixed(1)} ${PLOT_BOTTOM} Z` : '';
          return (
            <g key={s.name}>
              <path d={dArea} fill={`url(#${sid(s.name)})`} style={{ opacity: mount ? 1 : 0, transition: `opacity 0.7s ease ${300 + si * 130}ms` }} />
              <path d={dLine} pathLength={1} fill="none" stroke={colors[s.name]} strokeWidth="2.5" strokeLinecap="round"
                style={{ strokeDasharray: 1, strokeDashoffset: mount ? 0 : 1, transition: `stroke-dashoffset 1s cubic-bezier(.22,1,.36,1) ${si * 150}ms` }} />
            </g>
          );
        })}

        {data.map((r, i) => (
          <text key={r.label} x={x(i)} y={height - 9} textAnchor="middle" style={{ fill: 'var(--dp-text-3)', fontSize: 10, fontWeight: 600 }}>{r.label}</text>
        ))}

        {hoverIdx !== null && series.map((s) => {
          const p = s.pts[hoverIdx];
          return (
            <circle key={s.name} className="statsarea-dot" cx={p.x} cy={p.y} r="4.5" fill={colors[s.name]} stroke="rgba(255,255,255,0.85)" strokeWidth="1.5"
              onClick={() => onPick && onPick(s.name)} />
          );
        })}

        <rect x={PLOT_X0} y={PLOT_TOP} width={PLOT_X1 - PLOT_X0} height={chartH} fill="transparent"
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const px = ((e.clientX - rect.left) / rect.width) * (PLOT_X1 - PLOT_X0) + PLOT_X0;
            const idx = data.length === 1 ? 0 : Math.round((px - PLOT_X0) / stepX);
            setHoverIdx(Math.max(0, Math.min(data.length - 1, idx)));
          }}
          onMouseLeave={() => setHoverIdx(null)} />
      </svg>

      {hoverIdx !== null && (
        <div className="statsarea-tip" style={{ left: `${tipLeft}%`, top: '7%' }}>
          <p className="statsarea-tip-title">{data[hoverIdx].label}</p>
          {data[hoverIdx].cells.filter((c) => !hidden[c.name] && c.j > 0).map((c) => (
            <p key={c.name} className="statsarea-tip-row">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: colors[c.name] }} />{c.name}</span>
              <span><b style={{ color: colors[c.name] }}>{c.j} j</b> · {c.pct} %</span>
            </p>
          ))}
          <p className="statsarea-total"><b className="num">{data[hoverIdx].tot} j</b> au total</p>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
        {cats.map((name) => (
          <button key={name} type="button" onClick={() => setHidden((s) => ({ ...s, [name]: !s[name] }))}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold transition-all ${hidden[name] ? 'statsarea-legend--off' : ''}`}
            style={{ borderColor: hidden[name] ? 'var(--dp-hairline-soft)' : colors[name], background: hidden[name] ? 'transparent' : `${colors[name]}1f`, color: hidden[name] ? 'var(--dp-text-3)' : colors[name] }}>
            <span className="h-3 w-3 rounded-sm" style={{ background: colors[name] }} />
            {name}
          </button>
        ))}
        <span className="text-[10px]" style={{ color: 'var(--dp-text-3)' }}>
          survol = détail · clic point = panorama
        </span>
      </div>
    </div>
  );
}