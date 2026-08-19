const TYPE_LABELS = {
  solde_initial: 'Solde initial',
  ajout_annuel: 'Ajout annuel',
  prelevement: 'Prélèvement',
  maladie: 'Maladie',
  absence: 'Absence',
};

const CLS = {
  solde_initial: 'bg-brand-50 text-brand-700 ring-brand-200',
  ajout_annuel: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  prelevement: 'bg-amber-50 text-amber-700 ring-amber-200',
  maladie: 'bg-rose-50 text-rose-700 ring-rose-200',
  absence: 'bg-slate-100 text-slate-600 ring-slate-200',
};

export default function BadgeType({ type }) {
  const cls = CLS[type] || 'bg-slate-100 text-slate-600 ring-slate-200';
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${cls}`}>
      {TYPE_LABELS[type] || type}
    </span>
  );
}