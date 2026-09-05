import ReferentielPlaceholder from '../components/ReferentielPlaceholder';
import { IconAward } from '../components/icons';

export default function ReferentielPromotionNotation() {
  return (
    <ReferentielPlaceholder
      titre="Promotion & Notation"
      description="Référentiel des promotions et de la notation : échelles de notation, critères d'évaluation et règles d'avancement."
      rubriques={[
        'Échelles de notation',
        'Critères d\'évaluation',
        'Barèmes de promotion',
        'Règles d\'avancement',
        'Historique des notations',
      ]}
      icon={IconAward}
    />
  );
}