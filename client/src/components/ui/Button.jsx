export function Button({ variant = 'primary', loading, children, ...props }) {
  const cls = variant === 'primary' ? 'btn-primary' : 'btn-secondary';
  return <button className={`${cls} min-h-[44px]`} disabled={loading || props.disabled} {...props}>{loading ? 'Chargement…' : children}</button>;
}
