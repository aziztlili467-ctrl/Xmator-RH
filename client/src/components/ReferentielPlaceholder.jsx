import { IconSettings, IconActivity } from './icons';

// Page placeholder pour les rubriques du Référentiel : liste les futurs réglages prévus.
export default function ReferentielPlaceholder({ titre, description, rubriques, icon: Icon = IconSettings }) {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-700/10 text-brand-700"><Icon /></span>
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">{titre}</h2>
              <p className="mt-1 max-w-2xl text-xs text-slate-500">{description}</p>
            </div>
          </div>
          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
            Rubrique à construire
          </span>
        </div>

        <div className="mt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Réglages prévus</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {rubriques.map((r) => (
              <div key={r} className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3 text-sm text-slate-700">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-brand-700 ring-1 ring-slate-200"><IconActivity /></span>
                {r}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 p-8 text-center">
        <IconSettings />
        <p className="mt-2 text-sm text-slate-500">Cette rubrique sera active dans une prochaine version.</p>
      </div>
    </div>
  );
}