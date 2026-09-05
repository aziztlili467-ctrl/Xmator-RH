import ReferentielPlaceholder from '../components/ReferentielPlaceholder';
import { IconUserClock } from '../components/icons';

export default function ReferentielParametresPointage() {
  return (
    <ReferentielPlaceholder
      titre="Paramètres de Pointage"
      description="Règles de pointage et de contrôle des présences : plages horaires, tolérances, appareils et types de journées."
      rubriques={[
        'Plages horaires et temps de travail',
        'Tolérance de retard et de sortie',
        'Appareils de pointage',
        'Types de journée (normal, été, ramadan…)',
        'Jours fériés et week-ends',
      ]}
      icon={IconUserClock}
    />
  );
}