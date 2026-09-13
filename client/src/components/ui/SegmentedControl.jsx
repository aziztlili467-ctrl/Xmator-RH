// Sélecteur segmenté à pastille glissante (remplace le <select> période).
export default function SegmentedControl({ options, value, onChange, className = '' }) {
  const idx = Math.max(0, options.findIndex((o) => o.id === value));
  return (
    <div className={`seg ${className}`} style={{ '--seg-i': idx, '--seg-n': options.length }} role="group">
      <span className="seg-thumb" aria-hidden="true" />
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={o.id === value}
          onClick={() => onChange(o.id)}
          title={o.title || o.label}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
