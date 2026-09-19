import { Fragment, useEffect, useState } from 'react';
import { api } from '../api';
import { IconBanknotes, IconPlus, IconEdit, IconTrash, IconSettings } from '../components/icons';
import BulletinDePaie from '../components/BulletinDePaie';
import GrilleSalaire from './GrilleSalaire';
import CycleCalcul from './CycleCalcul';

const RUBRIQUES = [
  { id: 'grilles', label: 'Grilles de salaire' },
  { id: 'cycle', label: 'Cycle de Calcul' },
  { id: 'primes', label: 'Primes et indemnités' },
  { id: 'retenues', label: 'Retenues et avances' },
  { id: 'regles', label: 'Règles de calcul de la paie' },
  { id: 'bulletin', label: 'Bulletin de Paie' },
];

function estTotal(libelle) {
  return /total|sous-total|net à payer/i.test(libelle || '');
}

export default function ReferentielParametreSalaire() {
  const [onglet, setOnglet] = useState('regles');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // { id, code, libelle, isNouveau }
  const [confirmeSuppression, setConfirmeSuppression] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const charger = () => {
    setLoading(true);
    setError('');
    api.reglesCalculPaie()
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(charger, []);

  const reordonner = (liste) => liste.map((r, i) => ({ ...r, position: i + 1 }));

  const insererApres = async (apresId) => {
    setSaving(true);
    setMessage(null);
    setConfirmeSuppression(null);
    try {
      const nv = await api.ajouterRegleCalculPaie({ libelle: '', apresId });
      setRows((liste) => {
        const idx = apresId === null ? -1 : liste.findIndex((r) => r.id === apresId);
        const copie = [...liste];
        copie.splice(idx + 1, 0, nv);
        return reordonner(copie);
      });
      setEditing({ ...nv, isNouveau: true });
    } catch (e) {
      setMessage({ type: 'err', texte: e.message });
    } finally {
      setSaving(false);
    }
  };

  const editer = (r) => setEditing({ id: r.id, code: r.code, libelle: r.libelle, isNouveau: false });

  const validerEdition = async () => {
    if (!editing) return;
    if (!String(editing.libelle || '').trim()) {
      setMessage({ type: 'err', texte: 'Le libellé est obligatoire.' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const misAJour = await api.modifierRegleCalculPaie(editing.id, { code: editing.code, libelle: editing.libelle.trim() });
      setRows((liste) => reordonner(liste.map((r) => (r.id === misAJour.id ? misAJour : r))));
      setEditing(null);
      setMessage({ type: 'ok', texte: 'Rubrique enregistrée.' });
    } catch (e) {
      setMessage({ type: 'err', texte: e.message });
    } finally {
      setSaving(false);
    }
  };

  const annulerEdition = async () => {
    if (editing && editing.isNouveau) {
      try {
        await api.supprimerRegleCalculPaie(editing.id);
        setRows((liste) => reordonner(liste.filter((r) => r.id !== editing.id)));
      } catch {}
    }
    setEditing(null);
  };

  const supprimer = async (id) => {
    setSaving(true);
    setMessage(null);
    try {
      await api.supprimerRegleCalculPaie(id);
      setRows((liste) => reordonner(liste.filter((r) => r.id !== id)));
      setConfirmeSuppression(null);
      setMessage({ type: 'ok', texte: 'Rubrique supprimée.' });
    } catch (e) {
      setMessage({ type: 'err', texte: e.message });
    } finally {
      setSaving(false);
    }
  };

  const Rubrique = RUBRIQUES.find((r) => r.id === onglet);

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <h2 className="text-lg font-bold text-slate-900">PARAMÈTRE DE SALAIRE</h2>
        <p className="text-sm text-slate-500">
          Référentiel des éléments de salaire : grilles, barèmes, primes, indices et paramètres de calcul de la paie.
        </p>
      </div>

      {/* Onglets des rubriques */}
      <div className="print:hidden flex flex-wrap gap-1.5">
        {RUBRIQUES.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setOnglet(r.id)}
            className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
              onglet === r.id
                ? 'bg-brand-700 text-white shadow-sm'
                : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${onglet === r.id ? 'bg-white' : 'bg-slate-300'}`} />
            {r.label}
          </button>
        ))}
      </div>

      {error && <p className="print:hidden rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}

      {onglet === 'grilles' ? (
        <GrilleSalaire />
      ) : onglet === 'cycle' ? (
        <CycleCalcul />
      ) : onglet === 'regles' ? (
        <>
          <div className="card p-4 text-xs text-slate-600 ring-1 ring-slate-200">
            <p className="flex items-center gap-2 font-semibold text-slate-700">
              <IconSettings /> Nomenclature des rubriques du bulletin de paie
            </p>
            <p className="mt-1 text-slate-500">
              Entre chaque deux lignes, un bouton <b>Insérer</b> crée une rubrique ( le <b>code est généré
              automatiquement</b> ). Vous pouvez ensuite <b>modifier</b> le code ou le libellé et <b>supprimer</b> une ligne.
            </p>
          </div>

          {message && (
            <p className={`rounded-lg px-4 py-3 text-sm font-semibold ring-1 ${message.type === 'ok' ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : 'bg-red-50 text-red-700 ring-red-200'}`}>
              {message.texte}
            </p>
          )}

          <div className="card p-3">
            {loading ? (
              <p className="py-10 text-center text-sm text-slate-400">Chargement de la nomenclature…</p>
            ) : rows.length === 0 ? (
              <p className="rounded-lg bg-slate-50 px-4 py-8 text-center text-sm text-slate-500 ring-1 ring-slate-200">
                Aucune rubrique. Utilisez « Insérer » pour créer la première ligne.
              </p>
            ) : (
              <div className="table-wrap">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      <th className="w-10 px-2 py-2">#</th>
                      <th className="w-28 px-2 py-2">Code</th>
                      <th className="px-2 py-2">Libellé de la rubrique</th>
                      <th className="w-44 px-2 py-2 text-end">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((r) => (
                      <Fragment key={r.id}>
                        {/* Séparateur « insérer entre deux lignes » */}
                        <tr className="insert-divider">
                          <td colSpan={4} className="px-2 py-1">
                            <div className="relative flex items-center">
                              <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 border-t border-dashed border-slate-200" />
                              <button
                                type="button"
                                onClick={() => insererApres(rows[Math.max(0, rows.indexOf(r) - 1)]?.id ?? null)}
                                disabled={saving}
                                className="relative z-10 mx-auto flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-brand-700 hover:bg-brand-100 disabled:opacity-50"
                              >
                                <IconPlus className="h-3 w-3" /> Insérer
                              </button>
                            </div>
                          </td>
                        </tr>

                        {editing && editing.id === r.id ? (
                          <tr className="bg-brand-50/40">
                            <td className="px-2 py-1.5 text-xs text-slate-400">{r.position}</td>
                            <td className="px-2 py-1.5">
                              <input
                                className="input w-24 font-mono"
                                value={editing.code}
                                onChange={(e) => setEditing({ ...editing, code: e.target.value })}
                                placeholder="Code auto"
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                className="input w-full"
                                value={editing.libelle}
                                onChange={(e) => setEditing({ ...editing, libelle: e.target.value })}
                                placeholder="Libellé de la rubrique…"
                                autoFocus={editing.isNouveau}
                              />
                            </td>
                            <td className="px-2 py-1.5 text-end">
                              <button type="button" className="btn-primary mr-1 h-8 px-3 text-xs" onClick={validerEdition} disabled={saving}>
                                Valider
                              </button>
                              <button type="button" className="btn-secondary h-8 px-3 text-xs" onClick={annulerEdition} disabled={saving}>
                                Annuler
                              </button>
                            </td>
                          </tr>
                        ) : (
                          <tr className={estTotal(r.libelle) ? 'bg-slate-50 font-bold text-slate-800' : 'hover:bg-slate-50/60'}>
                            <td className="px-2 py-2 text-xs text-slate-400">{r.position}</td>
                            <td className="px-2 py-2 font-mono text-[13px] text-slate-600">{r.code}</td>
                            <td className={`px-2 py-2 text-slate-700 ${estTotal(r.libelle) ? 'text-[13px] uppercase' : ''}`}>{r.libelle}</td>
                            <td className="px-2 py-2">
                              <div className="flex items-center justify-end gap-1">
                                {confirmeSuppression === r.id ? (
                                  <>
                                    <span className="mr-1 text-[11px] font-bold uppercase tracking-wide text-red-600">Supprimer ?</span>
                                    <button
                                      type="button"
                                      className="btn-primary h-8 bg-red-600 px-2.5 text-xs hover:bg-red-700"
                                      onClick={() => supprimer(r.id)}
                                      disabled={saving}
                                    >
                                      Oui
                                    </button>
                                    <button
                                      type="button"
                                      className="btn-secondary h-8 px-2.5 text-xs"
                                      onClick={() => setConfirmeSuppression(null)}
                                    >
                                      Non
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      title="Insérer après"
                                      aria-label="Insérer après"
                                      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-brand-50 hover:text-brand-700"
                                      onClick={() => insererApres(r.id)}
                                      disabled={saving}
                                    >
                                      <IconPlus />
                                    </button>
                                    <button
                                      type="button"
                                      title="Modifier"
                                      aria-label="Modifier"
                                      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                      onClick={() => editer(r)}
                                    >
                                      <IconEdit />
                                    </button>
                                    <button
                                      type="button"
                                      title="Supprimer"
                                      aria-label="Supprimer"
                                      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                                      onClick={() => setConfirmeSuppression(r.id)}
                                    >
                                      <IconTrash />
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                    {/* Ligne d'insertion après la dernière ligne */}
                    <tr className="insert-divider">
                      <td colSpan={4} className="px-2 py-1">
                        <div className="relative flex items-center">
                          <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 border-t border-dashed border-slate-200" />
                          <button
                            type="button"
                            onClick={() => insererApres(rows[rows.length - 1]?.id ?? null)}
                            disabled={saving}
                            className="relative z-10 mx-auto flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-brand-700 hover:bg-brand-100 disabled:opacity-50"
                          >
                            <IconPlus className="h-3 w-3" /> Insérer
                          </button>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : onglet === 'bulletin' ? (
        <BulletinDePaie peutSauver />
      ) : (
        <div className="card p-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <IconBanknotes />
          </div>
          <p className="mt-3 text-sm font-bold uppercase tracking-wide text-slate-700">{Rubrique.label}</p>
          <p className="mt-1 text-sm text-slate-500">Rubrique à construire — sera active dans une prochaine version.</p>
        </div>
      )}
    </div>
  );
}