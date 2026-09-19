import { useEffect, useState } from 'react';
import { api } from '../api';
import { IconUserClock, IconActivity } from '../components/icons';

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export default function ReferentielParametresPointage() {
  const [lignes, setLignes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => api.tolerances().then(setLignes).catch((e) => setError(e.message)).finally(() => setLoading(false));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const setCell = (categorieId, champ, valeur) => {
    const v = valeur.toUpperCase();
    setLignes((prev) => prev.map((l) => (l.categorie_id === categorieId ? { ...l, [champ]: v } : l)));
  };

  const completer = (categorieId) => {
    setLignes((prev) => prev.map((l) => {
      if (l.categorie_id !== categorieId) return l;
      return {
        ...l,
        entree_reglementaire: l.entree_reglementaire ? l.entree_reglementaire : '08:00',
        sortie_reglementaire: l.sortie_reglementaire ? l.sortie_reglementaire : '16:00',
      };
    }));
  };

  const effacer = (categorieId) => {
    setLignes((prev) => prev.map((l) => (l.categorie_id === categorieId
      ? { ...l, entree_reglementaire: '', sortie_reglementaire: '' }
      : l)));
  };

  const invalides = lignes.filter((l) => {
    const e = l.entree_reglementaire.trim();
    const s = l.sortie_reglementaire.trim();
    return (e && !HHMM.test(e)) || (s && !HHMM.test(s));
  });

  const nbConfigurees = lignes.filter((l) => l.entree_reglementaire.trim() && l.sortie_reglementaire.trim()).length;

  const sauver = async () => {
    setError('');
    setSuccess('');
    if (invalides.length) {
      setError('Certaines heures sont invalides : format attendu HH:mm (ex. 08:00).');
      return;
    }
    setSaving(true);
    try {
      await api.sauverTolerances(lignes.map((l) => ({
        categorie_id: l.categorie_id,
        entree_reglementaire: l.entree_reglementaire.trim(),
        sortie_reglementaire: l.sortie_reglementaire.trim(),
      })));
      setSuccess('Tolérances de retard et de sortie enregistrées.');
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-700/10 text-brand-700"><IconUserClock /></span>
          <div>
            <h2 className="text-lg font-bold text-slate-900">PARAMÈTRES DE POINTAGE</h2>
            <p className="text-sm text-slate-500">
              Règles de pointage et de contrôle des présences : plages horaires, tolérances, appareils et types de journées.
            </p>
          </div>
        </div>
      </div>

      {success && <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700 ring-1 ring-emerald-200">{success}</p>}
      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}

      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">Tolérance de retard et de sortie</h3>
            <p className="mt-1 max-w-2xl text-xs text-slate-500">
              Pour chaque catégorie professionnelle, définissez les horaires réglementaires d'entrée et de sortie
              (format <span className="font-mono">HH:mm</span>). Ces valeurs remplacent la grille par défaut dans{' '}
              <strong>Présences & pointages</strong> et <strong>Pointage biométrique</strong> pour les employés de la
              catégorie — le retard et la sortie anticipée sont alors calculés par rapport à ces heures. Une cellule
              vide conserve l'horaire par défaut de la catégorie.
            </p>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={sauver} disabled={saving || loading}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>

        {nbConfigurees > 0 && (
          <p className="mt-4 rounded-lg bg-sky-50 px-4 py-3 text-xs text-sky-800 ring-1 ring-sky-200">
            {nbConfigurees} catégorie(s) disposent d'un horaire réglementaire personnalisé — appliqué aux pointages des
            employés concernés.
          </p>
        )}

        <div className="mt-4">
          {loading ? (
            <p className="py-8 text-center text-sm text-slate-400">Chargement des catégories…</p>
          ) : lignes.length === 0 ? (
            <p className="rounded-lg bg-slate-50 px-4 py-8 text-center text-sm text-slate-500 ring-1 ring-slate-200">
              Aucune catégorie professionnelle définie. Créez d'abord des catégories dans la rubrique « Catégories ».
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-start text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Catégorie</th>
                  <th className="px-4 py-3">Entrée réglementaire</th>
                  <th className="px-4 py-3">Sortie réglementaire</th>
                  <th className="px-4 py-3 text-end">Actions</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((l) => {
                  const e = l.entree_reglementaire.trim();
                  const s = l.sortie_reglementaire.trim();
                  const actif = !!(e && s);
                  return (
                    <tr key={l.categorie_id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-800">{l.libelle}</span>
                          {actif && (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-600 ring-1 ring-emerald-200">
                              Personnalisé
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          className={`input w-24 font-mono ${e && !HHMM.test(e) ? 'ring-2 ring-red-300' : ''}`}
                          placeholder="--:--"
                          maxLength={5}
                          value={l.entree_reglementaire}
                          onChange={(ev) => setCell(l.categorie_id, 'entree_reglementaire', ev.target.value)}
                          onKeyDown={(ev) => ev.key === 'Enter' && ev.preventDefault()}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          className={`input w-24 font-mono ${s && !HHMM.test(s) ? 'ring-2 ring-red-300' : ''}`}
                          placeholder="--:--"
                          maxLength={5}
                          value={l.sortie_reglementaire}
                          onChange={(ev) => setCell(l.categorie_id, 'sortie_reglementaire', ev.target.value)}
                          onKeyDown={(ev) => ev.key === 'Enter' && ev.preventDefault()}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <button className="rounded-md px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50" onClick={() => completer(l.categorie_id)} title="Renseigner 08:00 / 16:00 par défaut">
                            Défaut
                          </button>
                          <button className="rounded-md px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100" onClick={() => effacer(l.categorie_id)} title="Vider → horaire par défaut de la catégorie">
                            Effacer
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 p-8 text-center">
        <div className="flex justify-center text-slate-400"><IconActivity /></div>
        <p className="mt-2 text-sm text-slate-500">Autres rubriques prévues : plages horaires et temps de travail, appareils de pointage, types de journée, jours fériés et week-ends.</p>
      </div>
    </div>
  );
}