import { useEffect, useState } from 'react';
import { api } from '../api';
import { today, downloadFile } from '../utils';
import { IconDownload, IconFileText } from '../components/icons';

const COLS = [
  { key: 'ca', abbr: 'CA', label: 'Congé légal' },
  { key: 'ce', abbr: 'CE', label: 'Congé exceptionnel' },
  { key: 'ma', abbr: 'MA', label: 'Arrêt maladie' },
  { key: 'abs', abbr: 'ABS', label: 'Absence injustifiée' },
];

const CODE_STYLE = {
  CA: 'bg-sky-100 text-sky-700 ring-sky-200',
  CE: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
  MA: 'bg-rose-100 text-rose-700 ring-rose-200',
  ABS: 'bg-slate-200 text-slate-600 ring-slate-300',
};

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
  const [debut, setDebut] = useState('2026-01-01');
  const [fin, setFin] = useState(today());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = (d, f) => {
    if (!d || !f) return;
    if (f < d) return setError('La date de fin doit être postérieure ou égale à la date de début.');
    setLoading(true);
    setError('');
    api.statsJournal({ debut: d, fin: f })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load(debut, fin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeDebut = (v) => { setDebut(v); load(v, fin); };
  const changeFin = (v) => { setFin(v); load(debut, v); };

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
    downloadFile(`journal-statistiques_${debut}_${fin}.csv`, [header, ...lines, totalLine].join('\n'));
  };

  const exportPdf = async () => {
    if (!data) return;
    setError('');
    try {
      await api.statsJournalPdf({ debut, fin });
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Journal de statistiques</h2>
          <p className="text-sm text-slate-500">Matrice quotidienne : chaque ligne est un employé, chaque colonne une date, chaque case un code (CA / CE / MA / ABS).</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={exportCsv} disabled={!data}>
            <IconDownload /> Exporter CSV
          </button>
          <button className="btn-primary" onClick={exportPdf} disabled={!data}>
            <IconFileText /> Exporter PDF
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
        </div>
        <p className="text-xs text-slate-400">
          {COLS.map((c) => (
            <span key={c.key} className="me-3 inline-flex items-center gap-1">
              <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-bold ring-1 ${CODE_STYLE[c.abbr]}`}>{c.abbr}</span>
              = {c.label}
            </span>
          ))}
        </p>
      </div>

      {data && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {COLS.map((c) => (
              <div key={c.key} className="card p-4">
                <p className="text-[11px] font-semibold uppercase text-slate-400">{c.abbr} — {c.label}</p>
                <p className={`text-2xl font-bold ${c.abbr === 'CA' ? 'text-sky-700' : c.abbr === 'CE' ? 'text-emerald-700' : c.abbr === 'MA' ? 'text-rose-700' : 'text-slate-600'}`}>
                  {data.totaux[c.key]} j
                </p>
              </div>
            ))}
            <div className="card p-4">
              <p className="text-[11px] font-semibold uppercase text-slate-400">Total période</p>
              <p className="text-2xl font-bold text-slate-800">{data.totaux.total} j</p>
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
                      <tr key={e.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="sticky start-0 z-10 bg-white px-4 py-2" title={`${e.nom} ${e.prenom} — ${e.categorie}`}>
                          <span className="block text-xs font-bold text-slate-800">{e.nom} {e.prenom}</span>
                          <span className="block font-mono text-[10px] text-brand-600">{e.matricule}</span>
                        </td>
                        {data.dates.map((iso) => {
                          const code = data.jours[e.id] ? data.jours[e.id][iso] : null;
                          const we = isWeekend(iso);
                          return (
                            <td key={iso} className={`px-2 py-2 text-center ${we ? 'bg-slate-100/70' : ''}`}>
                              {code && (
                                <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-bold ring-1 ${CODE_STYLE[code.split('/')[0]] || 'bg-slate-100 text-slate-600'}`}>
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
