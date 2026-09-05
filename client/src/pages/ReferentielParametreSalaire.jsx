import ReferentielPlaceholder from '../components/ReferentielPlaceholder';
import { IconBanknotes } from '../components/icons';

export default function ReferentielParametreSalaire() {
  return (
    <ReferentielPlaceholder
      titre="Paramètre de Salaire"
      description="Référentiel des éléments de salaire : grilles, catégories, primes, indices et paramètres de calcul de la paie."
      rubriques={[
        'Grilles de salaire',
        'Barème et indices',
        'Primes et indemnités',
        'Retenues et avances',
        'Règles de calcul de la paie',
      ]}
      icon={IconBanknotes}
    />
  );
}