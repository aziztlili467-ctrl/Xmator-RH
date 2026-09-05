import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
export default function DonutStat({ pct, label, data, colors }) {
  const d = data || [{ value: pct }, { value: 100 - pct }];
  const c = colors || ['var(--chart-1)', 'rgba(255,255,255,0.08)'];
  return (
    <div className="flex flex-col items-center">
      <div className="relative h-40 w-40">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={d} dataKey="value" innerRadius={60} outerRadius={78} startAngle={90} endAngle={-270} strokeWidth={0} isAnimationActive>
              {d.map((_, i) => <Cell key={i} fill={c[i % c.length]} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-extrabold" style={{ color: 'var(--text-primary)' }}>{pct}%</span>
          {label && <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>{label}</span>}
        </div>
      </div>
    </div>
  );
}
