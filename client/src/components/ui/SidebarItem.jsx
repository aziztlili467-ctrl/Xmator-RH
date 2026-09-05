export default function SidebarItem({ active, icon: Icon, label, accent }) {
  return (
    <div className="flex items-center gap-3 rounded-lg px-3 py-2.5" style={active ? { background: 'var(--bg-panel-hover)', color: 'var(--text-primary)', borderLeft: '3px solid var(--accent-cyan)' } : { color: 'var(--text-secondary)' }}>
      <span className="icon-badge" style={{ background: accent || 'var(--bg-panel)', width: 36, height: 36 }}><Icon /></span>
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}
