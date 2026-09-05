import ReferentielPlaceholder from '../components/ReferentielPlaceholder';
import { IconBuildingOffice } from '../components/icons';

export default function ReferentielParametresAdministratifs() {
  return (
    <ReferentielPlaceholder
      titre="Paramètres administratifs"
      description="Paramètres liés à l'administration du personnel : structures, ministère/zones, directions et services."
      rubriques={[
        'Ministère et zones',
        'Directions et services',
        'Fonctionnaires et corps',
        'Grades et échelons',
        'Nature du poste de travail',
      ]}
      icon={IconBuildingOffice}
    />
  );
}