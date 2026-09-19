import { useState } from 'react';
import { api } from '../api';
import { today, debutMois, downloadFile } from '../utils';
import ImprimerPdf from '../components/ImprimerPdf';
import { IconDownload, IconFilter } from '../components/icons';

const isWeekend = (iso) => {
  const wd = new Date(iso + 'T00:00:00').getDay();
  return wd === 0 || wd === 6;
};

const fmtDate = (iso) => {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
};

const fmtFR = (iso) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

export default function StatsJournal() {
  const [debut, setDebut] = useState(debutMois());
  const [fin, setFin] = useState(today());
  const [matricule, setMatricule] = useState('');
  const [orientation, setOrientation] = useState('landscape');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState('');

  // Métadonnées des codes (couleur + libellé) renvoyées par l'API — visibles par tous les rôles en lecture
  const metaCodes = {};
  if (data && Array.isArray(data.codes)) {
    for (const c of data.codes) metaCodes[c.code] = c;
  }

  // Une case peut cumuler plusieurs codes (ex. « P1/CA ») — couleur du premier code, noir si CA demi-journée
  const badgeStyle = (cellule, isDemiCA) => {
    if (isDemiCA) return { backgroundColor: '#00000014', color: '#000000', boxShadow: 'inset 0 0 0 1px #00000033' };
    const meta = metaCodes[String(cellule || '').split('/')[0]];
    if (!meta || !meta.couleur) return undefined;
    return { backgroundColor: meta.couleur + '1f', color: meta.couleur, boxShadow: 'inset 0 0 0 1px ' + meta.couleur + '55' };
  };

  const load = (d, f, m) => {
    if (!d || !f) return;
    if (f < d) return setError('La date de fin doit être postérieure ou égale à la date de début.');
    if (new Date(f) - new Date(d) > 370 * 86400000) return setError('Période trop longue (maximum 12 mois) — resserrez le filtre.');
    setLoading(true);
    setError('');
    api.statsJournal({ debut: d, fin: f, matricule: m })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  // Les lignes ne sont chargées qu'après un clic sur « Exécuter » (page vide par défaut).
  const executer = () => load(debut, fin, matricule);

  const changeDebut = (v) => setDebut(v);
  const changeFin = (v) => setFin(v);

  const totalJours = (id) => {
    const j = data.jours[id];
    if (!j) return 0;
    return Object.values(j).reduce((s, code) => s + String(code).split('/').length, 0);
  };

  const countDate = (iso) => {
    return data.employes.reduce((s, e) => s + (data.jours[e.id] && data.jours[e.id][iso] ? 1 : 0), 0);
  };

  const exportCsv = () => {
    if (!data) return;
    const header = ['Employé', 'Matricule', ...data.dates.map(fmtFR)].join(';');
    const lines = data.employes.map((e) =>
      [e.nom + ' ' + e.prenom, e.matricule, ...data.dates.map((iso) => (data.jours[e.id] ? data.jours[e.id][iso] || '' : ''))].join(';')
    );
    const totalLine = ['Total employés', '', ...data.dates.map(countDate)].join(';');
    downloadFile(`journal-paie_${debut}_${fin}.csv`, [header, ...lines, totalLine].join('\n'));
  };

  const exportPdf = async (o) => {
    if (!data) return;
    setError('');
    try {
      await api.statsJournalPdf({ debut, fin, matricule, orientation: o || orientation });
    } catch (e) {
      setError(e.message);
    }
  };

  const imprimer = async (o) => {
    if (!data) return;
    setPrinting(true);
    setError('');
    try {
      await api.statsJournalPrint({ debut, fin, matricule, orientation: o || orientation });
    } catch (e) {
      setError(e.message);
    } finally {
      setPrinting(false);
    }
  };

  const exportXls = async () => {
    if (!data) return;
    setError('');
    try {
      await api.statsJournalXls({ debut, fin, matricule });
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">JOURNAL DE PRÉSENCE</h2>
          <p className="text-sm text-slate-500">
            Matrice quotidienne : chaque ligne est un employé, chaque colonne une date. P1 = journée présente (pointage badgeuse),
            complétée par les codifications importées du Journal RMA (A1, CA, MA, R3, RP…).
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <ImprimerPdf
            orientation={orientation}
            onOrientationChange={setOrientation}
            onPrint={imprimer}
            onDownload={exportPdf}
            disabled={!data}
            busy={printing}
          />
          <button className="btn-secondary" onClick={exportXls} disabled={!data}>
            <IconDownload /> Exporter XLS
          </button>
          <button className="btn-secondary" onClick={exportCsv} disabled={!data}>
            <IconDownload /> Exporter CSV
          </button>
        </div>
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
          <label className="text-sm font-semibold text-slate-600">Matricule :</label>
          <input
            type="text"
            className="input w-28 font-mono"
            placeholder="ex : 35"
            value={matricule}
            onChange={(e) => setMatricule(e.target.value)}
          />
          <button className="btn-primary" onClick={executer} disabled={loading}>
            <IconFilter /> {loading ? 'Chargement…' : 'Exécuter'}
          </button>
        </div>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
          {Object.values(metaCodes).map((c) => (
            <span key={c.code} className="inline-flex items-center gap-1">
              <span className="inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[11px] font-bold" style={{ backgroundColor: (c.couleur || '#64748b') + '1f', color: c.couleur || '#64748b' }}>{c.code}</span>
              = {c.libelle}
            </span>
          ))}
        </p>
      </div>

      {!data && !loading && (
        <div className="card flex flex-col items-center gap-2 p-8 text-center">
          <IconFilter className="h-8 w-8 text-slate-300" />
          <p className="text-sm font-semibold text-slate-700">Aucune ligne affichée</p>
          <p className="text-sm text-slate-500">
            Choisissez une période (12 mois maximum) et, si besoin, un matricule, puis cliquez sur <strong>Exécuter</strong> pour afficher la matrice.
          </p>
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Object.keys(data.totaux.par_code || {}).sort().map((code) => {
              const meta = metaCodes[code] || {};
              return (
                <div key={code} className="card p-4">
                  <p className="text-[11px] font-semibold uppercase text-slate-400">{code} — {meta.libelle || ''}</p>
                  <p className="text-2xl font-bold" style={{ color: meta.couleur || '#334155' }}>{data.totaux.par_code[code]} j</p>
                </div>
              );
            })}
            <div className="card p-4">
              <p className="text-[11px] font-semibold uppercase text-slate-400">Total période</p>
              <p className="text-2xl font-bold text-slate-800">{data.totaux.total} j</p>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="table-wrap">
              <table className="w-max-table text-sm">
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
                      <tr key={e.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="sticky start-0 z-10 bg-white px-4 py-2" title={`${e.nom} ${e.prenom} — ${e.categorie}`}>
                          <span className="block text-xs font-bold text-slate-800">{e.nom} {e.prenom}</span>
                          <span className="block font-mono text-[10px] text-brand-600">{e.matricule}</span>
                        </td>
                        {data.dates.map((iso) => {
                          const code = data.jours[e.id] ? data.jours[e.id][iso] : null;
                          const we = isWeekend(iso);
                          const isDemiCA = !!(data.joursDemi && data.joursDemi[e.id] && data.joursDemi[e.id][iso]);
                          return (
                            <td key={iso} className={`px-2 py-2 text-center ${we ? 'bg-slate-100/70' : ''}`}>
                              {code && (
                                <span className="inline-flex items-center rounded-md px-1.5 py-0.5 font-mono text-[11px] font-bold" style={badgeStyle(code, isDemiCA) || { backgroundColor: '#dbeafe', color: '#1d4ed8' }}>
                                  {code}
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
                {!loading && (
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
        </>
      )}
    </div>
  );
}
