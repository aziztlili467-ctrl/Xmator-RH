export default function IconBadge({ color = 'var(--primary-600)', size = 40, children }) {
  return <div className="icon-badge" style={{ background: color, width: size, height: size }}>{children}</div>;
}
