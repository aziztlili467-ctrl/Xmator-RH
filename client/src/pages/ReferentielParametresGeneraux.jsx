import ReferentielPlaceholder from '../components/ReferentielPlaceholder';
import { IconSettings } from '../components/icons';

export default function ParametresGeneraux() {
  return (
    <ReferentielPlaceholder
      titre="Paramètres Généraux"
      description="Réglages généraux de l'application : identité de l'organisme, langue, fuseau horaire, format des dates et chiffres."
      rubriques={[
        'Identité de l\'organisme',
        'Langue et région',
        'Fuseau horaire',
        'Format des dates et des nombres',
        'Rappels et notifications globales',
      ]}
      icon={IconSettings}
    />
  );
}