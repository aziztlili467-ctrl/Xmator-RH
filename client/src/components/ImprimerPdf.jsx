import { IconPrinter, IconFileText } from './icons';

const ORIENTATIONS = [
  { value: 'portrait', label: 'Portrait' },
  { value: 'landscape', label: 'Paysage' },
];

// Aperçu miniature du format de page (portrait = plus haut que large, paysage = l'inverse).
function FormatIcon({ orientation }) {
  const paysage = orientation === 'landscape';
  return (
    <span
      aria-hidden="true"
      className={`inline-block rounded-[2px] border border-current ${paysage ? 'h-2.5 w-3.5' : 'h-3.5 w-2.5'}`}
    />
  );
}

// Bouton d'impression « IMPRIMER EN PDF » avec choix du format Portrait / Paysage.
// `onPrint`/`onDownload` reçoivent l'orientation sélectionnée.
export default function ImprimerPdf({
  orientation,
  onOrientationChange,
  onPrint,
  onDownload,
  disabled = false,
  busy = false,
  downloadLabel = 'Télécharger PDF',
  className = '',
}) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <div
        className="inline-flex overflow-hidden rounded-lg ring-1 ring-slate-200"
        role="group"
        aria-label="Format d'impression"
      >
        {ORIENTATIONS.map((o) => {
          const actif = orientation === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onOrientationChange && onOrientationChange(o.value)}
              title={`Format ${o.label.toLowerCase()}`}
              aria-pressed={actif}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold transition ${
                actif ? 'bg-brand-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
              }`}
            >
              <FormatIcon orientation={o.value} />
              {o.label}
            </button>
          );
        })}
      </div>
      {onDownload && (
        <button
          type="button"
          className="btn-secondary"
          onClick={() => onDownload(orientation)}
          disabled={disabled || busy}
        >
          <IconFileText /> {downloadLabel}
        </button>
      )}
      <button
        type="button"
        className="btn-primary"
        onClick={() => onPrint(orientation)}
        disabled={disabled || busy}
      >
        <IconPrinter /> {busy ? 'Génération…' : 'IMPRIMER EN PDF'}
      </button>
    </div>
  );
}
