const STATUS_LABELS = {
  en_instance: 'En instance',
  acceptee: 'Acceptée',
  rejetee: 'Rejetée',
  valide: 'Validé',
  rejete: 'Rejeté',
};

const CLS = {
  en_instance: 'bg-amber-50 text-amber-700 ring-amber-200',
  acceptee: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  rejetee: 'bg-red-50 text-red-700 ring-red-200',
  valide: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  rejete: 'bg-red-50 text-red-700 ring-red-200',
};

export default function BadgeStatut({ statut }) {
  const cls = CLS[statut] || 'bg-slate-100 text-slate-600 ring-slate-200';
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${cls}`}>
      {STATUS_LABELS[statut] || statut}
    </span>
  );
}