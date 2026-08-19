import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { downloadFile } from '../utils';
import { IconUpload, IconDownload } from '../components/icons';

const fmtDate = (iso) => {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
};

const fmtFR = (iso) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

const isWeekend = (iso) => {
  const wd = new Date(iso + 'T00:00:00').getDay();
  return wd === 0 || wd === 6;
};

// "HH:MM:SS" -> "HH:MM" (colonne compacte)
const short = (hms) => (hms ? hms.slice(0, 5) : '');

export default function Horaires() {
  const { user } = useAuth();
  const [debut, setDebut] = useState('');
  const [fin, setFin] = useState('');
  const [matricule, setMatricule] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [importTexte, setImportTexte] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [importResult, setImportResult] = useState(null);
  const fileRef = useRef(null);

  const load = (d, f, m) => {
    setLoading(true);
    setError('');
    api.horaires({ debut: d, fin: f, matricule: m })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load(debut, fin, matricule);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeDebut = (v) => { setDebut(v); load(v, fin, matricule); };
  const changeFin = (v) => { setFin(v); load(debut, v, matricule); };
  const changeMatricule = (v) => { setMatricule(v); load(debut, fin, v); };

  const totalDate = (iso) => {
    return data.employes.reduce((s, e) => {
      const cell = e.heures[iso];
      if (!cell) return s;
      const [h, m, sec] = cell.split(':').map(Number);
      return s + h * 3600 + m * 60 + sec;
    }, 0);
  };

  const fmtSecondes = (sec) => {
    sec = Math.max(0, Math.round(sec || 0));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return [h, m, s].map((x) => String(x).padStart(2, '0')).join(':');
  };

  const exportCsv = () => {
    if (!data) return;
    const header = ['Employé', 'Matricule', ...data.dates.map(fmtFR)].join(';');
    const lines = data.employes.map((e) =>
      [e.nom + ' ' + e.prenom, e.matricule, ...data.dates.map((iso) => e.heures[iso] || '')].join(';')
    );
    const totalLine = ['Total (h)', '', ...data.dates.map((iso) => fmtSecondes(totalDate(iso)))].join(';');
    downloadFile(`horaires_${debut || 'tout'}_${fin || 'tout'}.csv`, [header, ...lines, totalLine].join('\n'));
  };

  const lireFichier = (e) => {
    const fichier = e.target.files && e.target.files[0];
    if (!fichier) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImportTexte(String(reader.result || ''));
      setImportResult(null);
      setImportError('');
    };
    reader.readAsText(fichier);
    e.target.value = '';
  };

  const doImport = async () => {
    if (!importTexte.trim()) return;
    setImporting(true);
    setImportError('');
    setImportResult(null);
    try {
      const r = await api.importHoraires(importTexte);
      setImportResult(r);
      load(debut, fin, matricule);
    } catch (err) {
      setImportError(err.message);
    } finally {
      setImporting(false);
    }
  };

  const effacerImport = () => {
    setImportTexte('');
    setImportResult(null);
    setImportError('');
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Horaires de travail</h2>
          <p className="text-sm text-slate-500">
            Heures travaillées par employé et par date : pour chaque jour et chaque matricule, la durée = <strong>dernier badgeage − premier badgeage</strong> de la journée. Filtrez par calendrier et par matricule.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={exportCsv} disabled={!data || !data.employes.length}>
            <IconDownload /> Exporter CSV
          </button>
        </div>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}

      <div className="card flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-semibold text-slate-600">Période :</label>
          <div className="flex items-center gap-2">
            <input type="date" className="input" value={debut} onChange={(e) => changeDebut(e.target.value)} />
            <span className="text-slate-400">→</span>
            <input type="date" className="input" value={fin} onChange={(e) => changeFin(e.target.value)} />
          </div>
          <label className="text-sm font-semibold text-slate-600">Matricule :</label>
          <input
            type="text"
            className="input w-28 font-mono"
            placeholder="ex : 35"
            value={matricule}
            onChange={(e) => changeMatricule(e.target.value)}
          />
          {matricule && (
            <button className="text-xs font-semibold text-brand-600 hover:underline" onClick={() => changeMatricule('')}>Effacer</button>
          )}
        </div>
        <p className="text-xs text-slate-400">
          {data && (
            <>
              {data.totaux.jours} jour(s) — {data.totaux.employes} employé(s) — total {data.totaux.heures_total}
            </>
          )}
        </p>
      </div>

      {data && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="card p-4">
              <p className="text-[11px] font-semibold uppercase text-slate-400">Jours affichés</p>
              <p className="text-2xl font-bold text-slate-800">{data.totaux.jours}</p>
            </div>
            <div className="card p-4">
              <p className="text-[11px] font-semibold uppercase text-slate-400">Employés affichés</p>
              <p className="text-2xl font-bold text-slate-800">{data.totaux.employes}</p>
            </div>
            <div className="card p-4">
              <p className="text-[11px] font-semibold uppercase text-slate-400">Heures totales</p>
              <p className="text-2xl font-bold text-slate-800">{data.totaux.heures_total}</p>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-start text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="sticky start-0 z-10 bg-slate-50 px-4 py-3">Employé</th>
                    {data.dates.map((iso) => (
                      <th key={iso} className={`whitespace-nowrap px-2 py-3 text-center ${isWeekend(iso) ? 'bg-slate-100 text-slate-400' : ''}`}>
                        <span className="block font-mono text-[11px] font-bold">{fmtDate(iso)}</span>
                      </th>
                    ))}
                    <th className="px-3 py-3 text-center text-slate-600">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={data.dates.length + 2} className="px-4 py-10 text-center text-slate-500">Chargement…</td></tr>
                  ) : (
                    data.employes.map((e) => (
                      <tr key={e.employe_id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="sticky start-0 z-10 bg-white px-4 py-2" title={`${e.nom} ${e.prenom} — matricule ${e.matricule}`}>
                          <span className="block text-xs font-bold text-slate-800">{e.nom} {e.prenom}</span>
                          <span className="block font-mono text-[10px] text-brand-600">{e.matricule}</span>
                        </td>
                        {data.dates.map((iso) => {
                          const cell = e.heures[iso];
                          const det = e.details && e.details[iso];
                          const we = isWeekend(iso);
                          return (
                            <td key={iso} className={`px-2 py-2 text-center ${we ? 'bg-slate-100/70' : ''}`}>
                              {cell && (
                                <span
                                  className={`inline-flex items-center rounded-md px-1.5 py-0.5 font-mono text-[11px] font-bold ring-1 ${we ? 'bg-slate-100 text-slate-400' : 'bg-brand-50 text-brand-700 ring-brand-200'}`}
                                  title={det ? `Entrée ${det.debut || '—'} → Sortie ${det.fin || '—'} (durée ${det.heures})` : `Durée ${cell}`}
                                >
                                  {short(cell)}
                                </span>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-3 py-2 text-center font-mono font-bold text-slate-800">{fmtSecondes(e.total_secondes)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                {!loading && data.dates.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold">
                      <td className="sticky start-0 z-10 bg-slate-50 px-4 py-3 text-xs uppercase text-slate-600">Total heures</td>
                      {data.dates.map((iso) => (
                        <td key={iso} className={`px-2 py-3 text-center font-mono text-xs text-slate-800 ${isWeekend(iso) ? 'text-slate-400' : ''}`}>{fmtSecondes(totalDate(iso))}</td>
                      ))}
                      <td className="px-3 py-3 text-center font-mono text-sm text-slate-800">{data.totaux.heures_total}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            {!loading && data.employes.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-slate-500">
                Aucune donnée pour cette période{matricule ? ` et ce matricule (${matricule})` : ''}. Importez un fichier de pointages, ou élargissez le filtre.
              </p>
            )}
          </div>
        </>
      )}

      {user?.role === 'super_admin' && (
        <div className="card p-4">
          <div className="mb-3">
            <h3 className="text-sm font-bold text-slate-900">Importer les heures de travail</h3>
            <p className="mt-1 text-xs text-slate-500">
              Fichier de badgeuse <span className="font-mono">.csv</span> / <span className="font-mono">.txt</span> — norme identique au journal des
              pointages — avec les colonnes <span className="font-mono">Matricule</span> + <span className="font-mono">Horodatage</span> (formats{' '}
              <span className="font-mono">AAAA-MM-JJ HH:mm:ss</span> ou <span className="font-mono">JJ/MM/AAAA HH:mm:ss</span>), ou{' '}
              <span className="font-mono">Matricule</span> + <span className="font-mono">Date</span> + <span className="font-mono">Heure</span>.
              Séparateur détecté automatiquement (tabulation, point-virgule ou virgule). Un ré-import du même horodatage est ignoré ; seuls les
              matricules présents en base sont importés. Pour chaque jour, la durée affichée = <strong>dernier badgeage − premier badgeage</strong> du matricule.
            </p>
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
              placeholder="Collez ici le contenu du fichier (Matricule;Horodatage)…"
              value={importTexte}
              onChange={(e) => {
                setImportTexte(e.target.value);
                setImportResult(null);
                setImportError('');
              }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <button className="btn-primary" onClick={doImport} disabled={importing || !importTexte.trim()}>
                <IconUpload /> {importing ? 'Import en cours…' : 'Importer'}
              </button>
              <button className="btn-secondary" onClick={effacerImport} disabled={!importTexte && !importResult}>
                Effacer
              </button>
            </div>
          </div>

          {importError && <p className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{importError}</p>}

          {importResult && (
            <p className="mt-3 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700 ring-1 ring-emerald-200">
              Import terminé : <strong>{importResult.importes}</strong> badgeage(s) créé(s) sur <strong>{importResult.jours}</strong> jour(s){' '}
              (durée quotidienne recalculée = dernier badgeage − premier badgeage), <strong>{importResult.doublons}</strong> déjà présent(s)
              (ré-import ignoré){importResult.debut && <> — du {fmtFR(importResult.debut)} au {fmtFR(importResult.fin)}</>}.
              {importResult.invalides > 0 && <> <span className="text-amber-700">{importResult.invalides} horodatage(s) illisible(s).</span></>}
              {importResult.nonReconnus.length > 0 && (
                <>
                  <br />
                  <span className="text-amber-700">Matricules absents de la base (non importés) : {importResult.nonReconnus.join(', ')}</span>
                </>
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}