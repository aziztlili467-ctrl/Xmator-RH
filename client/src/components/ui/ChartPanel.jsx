export default function ChartPanel({ title, icon: Icon, accent = 'var(--chart-1)', children, className = '', delay = 0, action }) {
  return (
    <div className={`panel ${className}`} style={{ animation: `fadeIn 0.4s ease ${delay}ms both` }}>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {Icon && <span className="icon-badge" style={{ background: accent, width: 36, height: 36, borderRadius: 'var(--radius-card)', color: 'white' }}><Icon /></span>}
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-secondary)' }}>{title}</span>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}
