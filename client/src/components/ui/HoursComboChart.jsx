import { ResponsiveContainer, ComposedChart, Bar, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

const colorForPct = (pct) => {
  if (pct == null) return 'var(--text-muted)';
  if (pct >= 100) return 'var(--status-approved)';
  if (pct >= 90) return 'var(--accent-amber)';
  if (pct >= 75) return '#fb923c';
  return 'var(--status-rejected)';
};

function CustomDot(props) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null) return null;
  const pct = payload?.pct;
  const fill = colorForPct(pct);
  return (
    <g>
      <circle cx={cx} cy={cy} r={16} fill="transparent" style={{ cursor: 'pointer' }} />
      <circle cx={cx} cy={cy} r={6} fill={fill} stroke="white" strokeWidth={2} style={{ filter: `drop-shadow(0 0 4px ${fill}80)`, transition: 'transform 0.2s' }} className="hover:scale-125" />
    </g>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0]?.payload;
  return (
    <div className="rounded-lg border px-3 py-2 text-xs shadow-lg" style={{ background: 'var(--bg-panel)', borderColor: 'var(--border-panel)', backdropFilter: 'blur(8px)', color: 'var(--text-primary)' }}>
      <p className="font-bold">{label}</p>
      <p>Heures légales : <span className="font-bold">{row?.['Heures légales'] ?? row?.legal} h</span></p>
      <p>Heures travaillées : <span className="font-bold">{row?.['Heures travaillées'] ?? row?.worked} h</span></p>
      <p>Taux : <span className="font-bold" style={{ color: colorForPct(row?.pct) }}>{row?.pct != null ? `${Math.round(row.pct)}%` : '—'}</span></p>
    </div>
  );
}

export default function HoursComboChart({ data, height }) {
  const h = height || 280;
  return (
    <ResponsiveContainer width="100%" height={h}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id="gradWorked" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent-cyan)" stopOpacity="0.15" />
            <stop offset="100%" stopColor="var(--accent-cyan)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="barVivid" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="50%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
          <filter id="barShadow" x="-20%" y="-10%" width="140%" height="130%">
            <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="rgba(99,102,241,0.35)" />
          </filter>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--bg-panel)' }} />
        <Legend
          wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
          content={({ payload }) => (
            <div className="flex flex-wrap justify-center gap-3 pt-2 text-xs">
              {payload?.map((e, i) => (
                <span key={i} className="flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
                  <span className="h-3 w-3 rounded-sm" style={{ background: e.color, opacity: e.dataKey === 'Heures légales' ? 0.65 : 1 }} />
                  {e.value}
                </span>
              ))}
            </div>
          )}
        />
        <Bar dataKey="Heures légales" fill="url(#barVivid)" radius={[8, 8, 0, 0]} barSize={36} barCategoryGap="22%" isAnimationActive animationDuration={800} style={{ filter: 'url(#barShadow)' }} />
        <Area type="monotone" dataKey="Heures travaillées" stroke="var(--accent-cyan)" strokeWidth={2.2} fill="url(#gradWorked)" dot={<CustomDot />} activeDot={{ r: 7, stroke: 'white', strokeWidth: 2 }} isAnimationActive animationDuration={1200} animationBegin={150} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
