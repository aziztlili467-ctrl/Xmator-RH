const STATUS_LABELS = {
  en_instance: 'En instance',
  acceptee: 'Acceptée',
  rejetee: 'Rejetée',
  valide: 'Validé',
  rejete: 'Rejeté',
};

const CLS = {
  en_instance: 'badge badge-pending',
  acceptee: 'badge badge-approved',
  rejetee: 'badge badge-rejected',
  valide: 'badge badge-approved',
  rejete: 'badge badge-rejected',
};

export default function BadgeStatut({ statut }) {
  const cls = CLS[statut] || 'badge badge-draft';
  return <span className={cls}>{STATUS_LABELS[statut] || statut}</span>;
}