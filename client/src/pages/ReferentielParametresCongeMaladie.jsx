import ReferentielPlaceholder from '../components/ReferentielPlaceholder';
import { IconCalendarCheck } from '../components/icons';

export default function ReferentielParametresCongeMaladie() {
  return (
    <ReferentielPlaceholder
      titre="Paramètres de Congé & Maladie"
      description="Règles et quotas des congés et des arrêts maladie : durées, cumuls, seuils et conditions d'éligibilité."
      rubriques={[
        'Types de congés',
        'Quotas annuels et cumuls',
        'Règles de prélèvement',
        'Durées et conditions de l\'arrêt maladie',
        'Seuils et alertes de solde',
      ]}
      icon={IconCalendarCheck}
    />
  );
}