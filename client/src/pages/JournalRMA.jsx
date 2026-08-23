import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { today, debutMois, fmtDate } from '../utils';
import { IconUpload, IconTrash } from '../components/icons';

const isWeekend = (iso) => {
  const wd = new Date(iso + 'T00:00:00').getDay();
  return wd === 0 || wd === 6;
};

const fmtDateShort = (iso) => {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
};

export default function JournalRMA() {
  const { user } = useAuth();
  const [debut, setDebut] = useState(debutMois());
  const [fin, setFin] = useState(today());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // --- Import des codifications (super_admin) ---
  const [importTexte, setImportTexte] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [importResult, setImportResult] = useState(null);
  const fileRef = useRef(null);

  // --- Suppression des données de la période (super_admin) ---
  const [suppressionOuverte, setSuppressionOuverte] = useState(false);
  const [suppression, setSuppression] = useState(false);

  // Métadonnées des codes (couleur/libellé) renvoyées par l'API — visibles par tous les rôles
  const metaCodes = {};
  if (data && Array.isArray(data.codes)) {
    for (const c of data.codes) metaCodes[c.code] = c;
  }

  const badgeStyle = (cellule, isDemiCA) => {
    if (isDemiCA) return { backgroundColor: '#00000014', color: '#000000', boxShadow: 'inset 0 0 0 1px #00000033' };
    const premier = String(cellule || '').split('/')[0];
    const meta = metaCodes[premier];
    if (!meta || !meta.couleur) return undefined;
    return { backgroundColor: meta.couleur + '1f', color: meta.couleur, boxShadow: 'inset 0 0 0 1px ' + meta.couleur + '55' };
  };

  const load = (d, f) => {
    if (!d || !f) return;
    if (f < d) return setError('La date de fin doit être postérieure ou égale à la date de début.');
    if (new Date(f) - new Date(d) > 370 * 86400000) return setError('Période trop longue (maximum 12 mois) — resserrez le filtre.');
    setLoading(true);
    setError('');
    api.journalRma({ debut: d, fin: f })
      .then((r) => { setData(r); setImportResult(null); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load(debut, fin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeDebut = (v) => { setDebut(v); load(v, fin); };
  const changeFin = (v) => { setFin(v); load(debut, v); };

  const lireFichier = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImportTexte(String(reader.result || ''));
      setImportResult(null);
      setImportError('');
    };
    reader.readAsText(f);
    e.target.value = '';
  };

  const doImport = async () => {
    setImporting(true);
    setImportError('');
    try {
      const r = await api.importCodesRma(importTexte, { debut, fin });
      setImportResult(r);
      setImportTexte('');
      load(debut, fin);
    } catch (e) {
      setImportError(e.message);
    } finally {
      setImporting(false);
    }
  };

  const supprimerPeriode = async () => {
    setSuppression(true);
    setError('');
    try {
      await api.deleteCodesRma({ debut, fin });
      setSuppressionOuverte(false);
      load(debut, fin);
    } catch (e) {
      setError(e.message);
      setSuppressionOuverte(false);
    } finally {
      setSuppression(false);
    }
  };

  const totalJours = (id) => {
    const j = data.jours[id];
    if (!j) return 0;
    return Object.values(j).reduce((s, code) => s + String(code).split('/').length, 0);
  };

  const countDate = (iso) => data.employes.reduce((s, e) => s + (data.jours[e.id] && data.jours[e.id][iso] ? 1 : 0), 0);

  const codesUtilises = data ? Object.keys(data.totaux.par_code || {}).sort() : [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Journal RMA (Repos · Maladie · Absence)</h2>
        <p className="text-sm text-slate-500">
          Codifications complémentaires (A1, CA, MA, R3, RP…) importées par matricule et date. Elles sont fusionnées avec P1
          dans le Journal de paie ; les couleurs sont celles configurées dans « Paramètres & Codification ».
        </p>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}

      <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-semibold text-slate-600">Période :</label>
          <div className="flex items-center gap-2">
            <input type="date" className="input" value={debut} onChange={(e) => changeDebut(e.target.value)} />
            <span className="text-slate-400">→</span>
            <input type="date" className="input" value={fin} onChange={(e) => changeFin(e.target.value)} />
          </div>
        </div>
        {data && (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
            {(data.codes || []).map((c) => (
              <span key={c.code} className="inline-flex items-center gap-1">
                <span className="inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[11px] font-bold" style={{ backgroundColor: (c.couleur || '#64748b') + '1f', color: c.couleur || '#64748b' }}>{c.code}</span>
                = {c.libelle}
              </span>
            ))}
          </p>
        )}
      </div>

      {user?.role === 'super_admin' && (
        <div className="card p-4">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Importer des codifications</h3>
              <p className="mt-1 text-xs text-slate-500">
                Fichier <span className="font-mono">.txt</span> / <span className="font-mono">.csv</span> — deux formats acceptés, séparateur détecté
                automatiquement : <strong>format liste</strong> (colonnes <span className="font-mono">Matricule</span>,{' '}
                <span className="font-mono">Date</span> [<span className="font-mono">AAAA-MM-JJ</span> ou{' '}
                <span className="font-mono">JJ/MM/AAAA</span>], <span className="font-mono">Code</span>, ordre libre) ou{' '}
                <strong>format matrice</strong> (une colonne par date en en-tête, codes A1/CA/MA/R3/RP dans les cellules — type « Présentiel-Paie »).
                Codes reconnus : {(data?.codes || []).map((c) => c.code).join(' - ') || 'A1 - CA - MA - R3 - RP'}.
                Les journées hors période sélectionnée sont ignorées.
              </p>
            </div>
            <button
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-100"
              onClick={() => setSuppressionOuverte(true)}
              title="Supprimer les codifications importées de la période"
            >
              <IconTrash /> Vider la période
            </button>
          </div>

          <div className="flex flex-col gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.csv"
              onChange={lireFichier}
              className="block w-full text-sm text-slate-600 file:me-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-brand-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white file:transition hover:file:bg-brand-700"
            />
            <textarea
              className="input w-full resize-y font-mono text-xs"
              rows={6}
              placeholder={'Collez ici le contenu du fichier…\n35;2026-07-21;CA\n35;22/07/2026;MA'}
              value={importTexte}
              onChange={(e) => { setImportTexte(e.target.value); setImportResult(null); setImportError(''); }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <button className="btn-primary" onClick={doImport} disabled={importing || !importTexte.trim()}>
                <IconUpload /> {importing ? 'Import en cours…' : 'Importer'}
              </button>
              <span className="text-xs text-slate-400">Période cible : {fmtDate(debut)} → {fmtDate(fin)}</span>
            </div>
          </div>

          {importError && <p className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{importError}</p>}

          {importResult && (importResult.importes === 0 && importResult.doublons === 0 ? (
            <p className="mt-3 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
              <strong>Aucune codification importée.</strong>
              {importResult.invalides > 0 && <> {importResult.invalides} ligne(s)/cellule(s) illisible(s) — vérifiez que le fichier contient des codes connus (A1, CA, MA, R3, RP…) et des dates lisibles.</>}
              {importResult.nonReconnus.length > 0 && <> Matricules absents de la base : {importResult.nonReconnus.join(', ')}.</>}
              {' '}Formats acceptés : liste (« Matricule ; Date ; Code ») ou matrice (colonnes de dates en en-tête).
            </p>
          ) : (
            <p className="mt-3 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700 ring-1 ring-emerald-200">
              Import terminé ({importResult.format === 'matrice' ? 'format matrice' : 'format liste'}) : <strong>{importResult.importes}</strong> codification(s) ajoutée(s), <strong>{importResult.doublons}</strong> déjà présente(s)
              (ré-import ignoré), <strong>{importResult.hors_periode}</strong> hors période.
              {importResult.invalides > 0 && <> <span className="text-amber-700">{importResult.invalides} ligne(s)/cellule(s) illisible(s).</span></>}
              {importResult.nonReconnus.length > 0 && (
                <>
                  <br />
                  <span className="text-amber-700">Matricules absents de la base (non importés) : {importResult.nonReconnus.join(', ')}</span>
                </>
              )}
            </p>
          ))}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {codesUtilises.map((code) => {
              const meta = metaCodes[code] || {};
              return (
                <div key={code} className="card p-4">
                  <p className="text-[11px] font-semibold uppercase text-slate-400">
                    {code} — {meta.libelle || ''}
                  </p>
                  <p className="text-2xl font-bold" style={{ color: meta.couleur || '#334155' }}>
                    {data.totaux.par_code[code]} j
                  </p>
                </div>
              );
            })}
            <div className="card p-4">
              <p className="text-[11px] font-semibold uppercase text-slate-400">Total période</p>
              <p className="text-2xl font-bold text-slate-800">{data.totaux.total} j</p>
            </div>
          </div>

          {codesUtilises.length === 0 ? (
            <p className="rounded-lg bg-slate-50 px-4 py-8 text-center text-sm text-slate-500 ring-1 ring-slate-200">
              Aucune codification importée sur cette période{user?.role === 'super_admin' ? ' — utilisez le bouton d\'import ci-dessus.' : '.'}
            </p>
          ) : (
            <div className="card overflow-hidden">
              <div className="table-wrap">
                <table className="w-max-table text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-start text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="sticky start-0 z-10 bg-slate-50 px-4 py-3">Employé</th>
                      {data.dates.map((iso) => (
                        <th key={iso} className={`whitespace-nowrap px-2 py-3 text-center ${isWeekend(iso) ? 'bg-slate-100 text-slate-400' : ''}`}>
                          <span className="block font-mono text-[11px] font-bold">{fmtDateShort(iso)}</span>
                        </th>
                      ))}
                      <th className="px-3 py-3 text-center text-slate-600">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={data.dates.length + 2} className="px-4 py-10 text-center text-slate-500">Chargement…</td></tr>
                    ) : (
                      data.employes.filter((e) => data.jours[e.id]).map((e) => (
                        <tr key={e.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="sticky start-0 z-10 bg-white px-4 py-2" title={`${e.nom} ${e.prenom} — ${e.categorie}`}>
                            <span className="block text-xs font-bold text-slate-800">{e.nom} {e.prenom}</span>
                            <span className="block font-mono text-[10px] text-brand-600">{e.matricule}</span>
                          </td>
                          {data.dates.map((iso) => {
                            const cellule = data.jours[e.id] ? data.jours[e.id][iso] : null;
                            const we = isWeekend(iso);
                            const isDemiCA = !!(data.joursDemi && data.joursDemi[e.id] && data.joursDemi[e.id][iso]);
                            return (
                              <td key={iso} className={`px-2 py-2 text-center ${we ? 'bg-slate-100/70' : ''}`}>
                                {cellule && (
                                  <span className="inline-flex items-center rounded-md px-1.5 py-0.5 font-mono text-[11px] font-bold" style={badgeStyle(cellule, isDemiCA)}>
                                    {cellule}
                                  </span>
                                )}
                              </td>
                            );
                          })}
                          <td className="px-3 py-2 text-center font-bold text-slate-800">{totalJours(e.id)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {!loading && codesUtilises.length > 0 && (
                    <tfoot>
                      <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold">
                        <td className="sticky start-0 z-10 bg-slate-50 px-4 py-3 text-xs uppercase text-slate-600">Total employés</td>
                        {data.dates.map((iso) => (
                          <td key={iso} className={`px-2 py-3 text-center text-sm text-slate-800 ${isWeekend(iso) ? 'text-slate-400' : ''}`}>{countDate(iso)}</td>
                        ))}
                        <td className="px-3 py-3 text-center text-sm text-slate-800">{data.totaux.total}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {suppressionOuverte && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-base font-bold text-slate-900">Vider les codifications importées ?</h3>
            <p className="mt-2 text-sm text-slate-600">
              Cette action supprimera définitivement toutes les codifications importées du{' '}
              <span className="font-mono">{fmtDate(debut)}</span> au <span className="font-mono">{fmtDate(fin)}</span>.
              Le Journal de paie redeviendra basé uniquement sur les pointages badgeuse (P1).
              Elle est consignée au mouchard. Continuer ?
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setSuppressionOuverte(false)} disabled={suppression}>
                Annuler
              </button>
              <button
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={supprimerPeriode}
                disabled={suppression}
              >
                <IconTrash /> {suppression ? 'Suppression…' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
