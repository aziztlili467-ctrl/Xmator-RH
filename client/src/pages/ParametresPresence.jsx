import { useEffect, useState } from 'react';
import { api } from '../api';

export default function ParametresPresence() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [choix, setChoix] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.parametresPresence()
      .then((r) => {
        setData(r.departements || []);
        setChoix(Object.fromEntries((r.departements || []).map((d) => [d.nom, !!d.actif])));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const nbActifs = Object.entries(choix).filter(([, v]) => v).length;
  const nbEmployesAffectes = (data || []).filter((d) => choix[d.nom]).reduce((s, d) => s + d.nb_employes, 0);

  const sauver = async () => {
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      const retenus = (data || []).filter((d) => choix[d.nom]).map((d) => d.nom);
      await api.sauverParametresPresence({ departements: retenus });
      setSaved(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Paramètres de présence</h2>
        <p className="text-sm text-slate-500">
          Départements dont les employés sont affichés <strong>PRÉSENT (P1) par défaut</strong> chaque jour
          ouvrable selon le calendrier, même sans pointage badgeuse.
        </p>
      </div>

      <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
        <p>
          <strong>Comment ça marche ?</strong> Pour un employé d'un département coché, chaque jour ouvrable de sa
          catégorie (jours fériés payés et repos hebdomadaires exclus) sans badge ni codification RMA est considéré
          présent. Dès qu'une codification est insérée dans une catégorie liée —{' '}
          <span className="font-mono">MA</span>, <span className="font-mono">CA</span>,{' '}
          <span className="font-mono">CE</span>, <span className="font-mono">A1</span>… — elle la
          <em> remplace automatiquement</em> dans le Journal de présence, le tableau de bord (calendrier et KPIs :
          jours présents ↑, absences ↓) et les vues liées.
        </p>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}

      <div className="card p-5">
        {loading ? (
          <p className="py-10 text-center text-sm text-slate-400">Chargement des départements…</p>
        ) : (data || []).length === 0 ? (
          <p className="rounded-lg bg-slate-50 px-4 py-8 text-center text-sm text-slate-500 ring-1 ring-slate-200">
            Aucun département renseigné sur les employés (colonne « Département » vide). Renseignez d'abord un
            département dans la rubrique Employés.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {(data || []).map((d) => (
              <label key={d.nom} className="flex cursor-pointer items-center gap-3 py-3">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-brand-600"
                  checked={!!choix[d.nom]}
                  onChange={(e) => { setChoix({ ...choix, [d.nom]: e.target.checked }); setSaved(false); }}
                />
                <span className="flex-1 text-sm font-semibold text-slate-800">{d.nom}</span>
                <span className="text-xs text-slate-400">{d.nb_employes} employé(s)</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-500">
          {nbEmployesAffectes > 0 ? (
            <>
              <span className="font-bold text-slate-700">{nbEmployesAffectes}</span> employé(s) concernés
              ({nbActifs} département{nbActifs > 1 ? 's' : ''} activé{nbActifs > 1 ? 's' : ''}).
            </>
          ) : (
            <>Aucun département activé — le mode « Présent par défaut » est désactivé ({nbActifs}).
              « Comptoir » est activé par défaut à la première installation.</>
          )}
        </p>
        <div className="flex items-center gap-2">
          {saved && (
            <span className="text-xs font-bold uppercase tracking-wide text-emerald-600">Enregistré</span>
          )}
          <button className="btn-primary" onClick={sauver} disabled={saving || loading}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}