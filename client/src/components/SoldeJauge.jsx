export function jaugeColor(solde, reference, variant = 'emerald') {
  if (solde < 0) return 'bg-red-500';
  const pct = reference > 0 ? solde / reference : 1;
  if (pct < 0.2) return 'bg-red-500';
  if (pct < 0.5) return 'bg-amber-500';
  return variant === 'cyan' ? 'bg-[#27C5F5]' : 'bg-emerald-500';
}

export function jaugePct(solde, reference) {
  if (solde <= 0) return 0;
  if (!reference || reference <= 0) return 100;
  return Math.min(100, Math.round((solde / reference) * 100));
}

export default function SoldeJauge({ solde, reference, showLabel = true, variant = 'emerald' }) {
  const color = jaugeColor(solde, reference, variant);
  const pct = jaugePct(solde, reference);
  return (
    <div className="w-full">
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
          <span>{pct}%</span>
          <span>{solde < 0 ? 'dépassé' : `de ${reference ?? '—'} j`}</span>
        </div>
      )}
    </div>
  );
}