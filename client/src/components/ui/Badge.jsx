const map = { approved: 'badge-approved', pending: 'badge-pending', rejected: 'badge-rejected', draft: 'badge-draft' };
export default function Badge({ variant = 'draft', children }) {
  return <span className={`badge ${map[variant] || map.draft}`}>{children}</span>;
}
