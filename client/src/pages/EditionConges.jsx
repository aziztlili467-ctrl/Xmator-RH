import { useEffect, useState } from 'react';
import { api } from '../api';
import { fmtJours, downloadFile } from '../utils';
import ImprimerPdf from '../components/ImprimerPdf';
import { IconDownload, IconSettings, IconFilter } from '../components/icons';

export default function EditionConges() {
  const [data, setData] = useState(null);
  const [categories, setCategories] = useState([]);
  const [employes, setEmployes] = useState([]);
  const [filters, setFilters] = useState({ employe: '', categorie: '', debut: '', fin: '', matricule: '', search: '' });
  const [orientation, setOrientation] = useState('portrait');
  const [loading, setLoading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.categories().then(setCategories).catch(() => {});
    api.employes().then(setEmployes).catch(() => {});
  }, []);

  const set = (k, v) => setFilters((f) => ({ ...f, [k]: v }));

  // Les lignes ne sont chargées qu'après un clic sur « Exécuter » (page vide par défaut).
  const executer = () => {
    setLoading(true);
    setError('');
    api.editionConges(filters)
      .then(setData)
      .catch((e) => { setError(e.message); setData(null); })
      .finally(() => setLoading(false));
  };

  const reinitialiser = () => setFilters({ employe: '', categorie: '', debut: '', fin: '', matricule: '', search: '' });

  const selectCls = 'input bg-white';

  const handlePrint = async (o) => {
    if (!data) return;
    setPrinting(true);
    setError('');
    try {
      await api.editionCongesPrint({ ...filters, orientation: o || orientation });
    } catch (e) {
      setError(e.message);
    } finally {
      setPrinting(false);
    }
  };

  const handlePdf = async (o) => {
    if (!data) return;
    setError('');
    try {
      await api.editionCongesPdf({ ...filters, orientation: o || orientation });
    } catch (e) {
      setError(e.message);
    }
  };

  const handleXls = () => {
    api.editionCongesXls(filters);
  };

  const handleExportCsv = () => {
    if (!data) return;
    const header = ['Matricule', 'Nom', 'Prénom', 'Catégorie', 'Département', 'Solde congé (j)'].join(';');
    const lines = data.employes.map((e) =>
      [e.matricule, e.nom, e.prenom, e.categorie || '', e.departement || '', e.solde_conge].join(';')
    );
    downloadFile(`journal-conges_${data.date_ref}.csv`, [header, ...lines].join('\n'));
  };

  const totalSolde = data ? data.employes.reduce((s, e) => s + e.solde_conge, 0) : 0;
  const avgSolde = data && data.employes.length ? (totalSolde / data.employes.length).toFixed(1) : 0;
  const soldeNul = data ? data.employes.filter((e) => e.solde_conge <= 0).length : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">JOURNAL DES CONGÉS</h2>
          <p className="text-sm text-slate-500">
            {data
              ? `Édition et impression — Réf. ${data.date_ref || '—'} — ${data.employes.length} employé(s)`
              : 'Édition et impression des soldes de congé — cliquez sur Exécuter pour afficher les lignes.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <ImprimerPdf
            orientation={orientation}
            onOrientationChange={setOrientation}
            onPrint={handlePrint}
            onDownload={handlePdf}
            disabled={!data}
            busy={printing}
          />
          <button onClick={handleXls} disabled={!data} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-indigo-700 transition disabled:opacity-50">
            <IconDownload /> XLS
          </button>
          <button onClick={handleExportCsv} disabled={!data} className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200 transition disabled:opacity-50">
            <IconDownload /> CSV
          </button>
        </div>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}

      <div className="card p-4">
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <IconFilter /> Filtres
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <input className="input" placeholder="Recherche (matricule, nom…)" value={filters.search} onChange={(e) => set('search', e.target.value)} />
          <select className={selectCls} value={filters.employe} onChange={(e) => set('employe', e.target.value)}>
            <option value="">Tous les employés</option>
            {employes.map((e) => (
              <option key={e.id} value={e.id}>{e.matricule} — {e.nom} {e.prenom}</option>
            ))}
          </select>
          <select className={selectCls} value={filters.categorie} onChange={(e) => set('categorie', e.target.value)}>
            <option value="">Toutes les catégories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.libelle}</option>)}
          </select>
          <input type="text" className="input font-mono" placeholder="Matricule (ex : 35)" value={filters.matricule} onChange={(e) => set('matricule', e.target.value)} />
          <div className="flex items-center gap-2">
            <input type="date" className="input" value={filters.debut} onChange={(e) => set('debut', e.target.value)} />
            <span className="text-slate-400">→</span>
            <input type="date" className="input" value={filters.fin} onChange={(e) => set('fin', e.target.value)} />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <button onClick={reinitialiser} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 transition">
            <IconSettings /> Réinitialiser
          </button>
          <button onClick={executer} disabled={loading} className="btn-primary">
            <IconFilter /> {loading ? 'Chargement…' : 'Exécuter'}
          </button>
        </div>
      </div>

      {!data && !loading && (
        <div className="card flex flex-col items-center gap-2 p-8 text-center">
          <IconFilter className="h-8 w-8 text-slate-300" />
          <p className="text-sm font-semibold text-slate-700">Aucune ligne affichée</p>
          <p className="text-sm text-slate-500">
            Renseignez une période et/ou un matricule, puis cliquez sur <strong>Exécuter</strong> pour afficher le journal des congés.
          </p>
        </div>
      )}

      {data && (
      <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card p-4 text-center">
          <p className="text-2xl font-extrabold text-slate-900">{data.employes.length}</p>
          <p className="text-xs font-semibold text-slate-500">Employé(s)</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-extrabold text-emerald-600">{avgSolde} j</p>
          <p className="text-xs font-semibold text-slate-500">Solde moyen</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-extrabold text-blue-600">{fmtJours(totalSolde)} j</p>
          <p className="text-xs font-semibold text-slate-500">Solde total</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-extrabold text-red-600">{soldeNul}</p>
          <p className="text-xs font-semibold text-slate-500">Solde épuisé</p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="table-wrap">
          <table className="w-max-table text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-start text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3">Matricule</th>
                <th className="px-5 py-3">Agent</th>
                <th className="px-5 py-3">Catégorie</th>
                <th className="px-5 py-3">Département</th>
                <th className="px-5 py-3 text-end">Solde congé</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-500">Chargement…</td></tr>
              ) : data.employes.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-500">Aucun employé ne correspond aux filtres.</td></tr>
              ) : (
                data.employes.map((e) => (
                  <tr key={e.employe_id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-5 py-3 font-mono font-semibold text-brand-700">{e.matricule}</td>
                    <td className="px-5 py-3 font-semibold text-slate-800">{e.nom} {e.prenom}</td>
                    <td className="px-5 py-3 text-slate-500">{e.categorie || '—'}</td>
                    <td className="px-5 py-3 text-slate-500">{e.departement || '—'}</td>
                    <td className={`px-5 py-3 text-end font-mono text-lg font-bold ${
                      e.solde_conge <= 0 ? 'text-red-600' : e.solde_conge <= 5 ? 'text-amber-600' : 'text-emerald-600'
                    }`}>
                      {fmtJours(e.solde_conge)} j
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}
    </div>
  );
}
