import ReferentielPlaceholder from '../components/ReferentielPlaceholder';
import { IconDashboard } from '../components/icons';

export default function ReferentielSaasTableauBord() {
  return (
    <ReferentielPlaceholder
      titre="SaaS & Tableau de Bord"
      description="Configuration de la plateforme SaaS et du tableau de bord : indicateurs, widgets, abonnements et accès."
      rubriques={[
        'Indicateurs du tableau de bord',
        'Widgets et graphiques',
        'Abonnement et licence SaaS',
        'Accès et rôles de la plateforme',
        'Personnalisation de l\'interface',
      ]}
      icon={IconDashboard}
    />
  );
}