import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { fmtDate, fmtJours, downloadFile } from '../utils';
import BadgeType from '../components/BadgeType';
import ImprimerPdf from '../components/ImprimerPdf';
import { IconDownload, IconFilter } from '../components/icons';

export default function Journal() {
  const [mouvements, setMouvements] = useState(null);
  const [categories, setCategories] = useState([]);
  const [employes, setEmployes] = useState([]);
  const [filters, setFilters] = useState({ employe: '', categorie: '', type: '', debut: '', fin: '', matricule: '', search: '' });
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
    api.mouvements(filters)
      .then(setMouvements)
      .catch((e) => { setError(e.message); setMouvements(null); })
      .finally(() => setLoading(false));
  };

  const reinitialiser = () => setFilters({ employe: '', categorie: '', type: '', debut: '', fin: '', matricule: '', search: '' });

  const exportCsv = () => {
    if (!mouvements) return;
    const header = ['Date', 'Matricule', 'Agent', 'Catégorie', 'Type', 'Jours', 'Solde après', 'Motif'].join(';');
    const lines = mouvements.map((m) =>
      [m.date_operation, m.matricule, `${m.nom} ${m.prenom}`, m.categorie, m.type_operation, m.jours, m.solde_apres, m.motif || ''].join(';')
    );
    downloadFile('journal_mouvements.csv', [header, ...lines].join('\n'));
  };

  const imprimerPdf = async (o) => {
    if (!mouvements) return;
    setPrinting(true);
    setError('');
    try {
      await api.mouvementsPrint({ ...filters, orientation: o || orientation });
    } catch (e) {
      setError(e.message);
    } finally {
      setPrinting(false);
    }
  };

  const telechargerPdf = async (o) => {
    if (!mouvements) return;
    setError('');
    try {
      await api.mouvementsPdf({ ...filters, orientation: o || orientation });
    } catch (e) {
      setError(e.message);
    }
  };

  const selectCls = 'input bg-white';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">JOURNAL DES MOUVEMENTS</h2>
          <p className="text-sm text-slate-500">
            {mouvements
              ? `Historique horodaté de toutes les opérations — ${mouvements.length} opération(s) affichée(s)`
              : 'Historique horodaté des opérations — choisissez une période et/ou un matricule puis cliquez sur Exécuter.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button className="btn-secondary" onClick={exportCsv} disabled={!mouvements || mouvements.length === 0}>
            <IconDownload /> Exporter CSV
          </button>
          <ImprimerPdf
            orientation={orientation}
            onOrientationChange={setOrientation}
            onPrint={imprimerPdf}
            onDownload={telechargerPdf}
            disabled={!mouvements || mouvements.length === 0}
            busy={printing}
          />
        </div>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}

      <div className="card p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <input className="input" placeholder="Recherche (nom, motif…)" value={filters.search} onChange={(e) => set('search', e.target.value)} />
          <input type="text" className="input font-mono" placeholder="Matricule (ex : 35)" value={filters.matricule} onChange={(e) => set('matricule', e.target.value)} />
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
          <select className={selectCls} value={filters.type} onChange={(e) => set('type', e.target.value)}>
            <option value="">Tous les types</option>
            <option value="solde_initial">Solde initial</option>
            <option value="ajout_annuel">Ajout annuel</option>
            <option value="prelevement">Prélèvement</option>
            <option value="maladie">Maladie</option>
            <option value="absence">Absence</option>
          </select>
          <div className="flex items-center gap-2">
            <input type="date" className="input" value={filters.debut} onChange={(e) => set('debut', e.target.value)} />
            <span className="text-slate-400">→</span>
            <input type="date" className="input" value={filters.fin} onChange={(e) => set('fin', e.target.value)} />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <button className="btn-secondary" onClick={reinitialiser}>Réinitialiser les filtres</button>
          <button className="btn-primary" onClick={executer} disabled={loading}>
            <IconFilter /> {loading ? 'Chargement…' : 'Exécuter'}
          </button>
        </div>
      </div>

      {!mouvements && !loading && (
        <div className="card flex flex-col items-center gap-2 p-8 text-center">
          <IconFilter className="h-8 w-8 text-slate-300" />
          <p className="text-sm font-semibold text-slate-700">Aucune ligne affichée</p>
          <p className="text-sm text-slate-500">
            Renseignez une période et/ou un matricule, puis cliquez sur <strong>Exécuter</strong> pour afficher les mouvements.
          </p>
        </div>
      )}

      {mouvements && (
        <div className="card overflow-hidden">
          <div className="table-wrap">
            <table className="w-max-table text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-start text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-3">Date opération</th>
                  <th className="px-5 py-3">Matricule</th>
                  <th className="px-5 py-3">Agent</th>
                  <th className="px-5 py-3">Catégorie</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3 text-end">Jours</th>
                  <th className="px-5 py-3 text-end">Solde après</th>
                  <th className="px-5 py-3">Motif</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} className="px-5 py-10 text-center text-slate-500">Chargement…</td></tr>
                ) : mouvements.length === 0 ? (
                  <tr><td colSpan={8} className="px-5 py-10 text-center text-slate-500">Aucune opération ne correspond aux filtres.</td></tr>
                ) : (
                  mouvements.map((m) => (
                    <tr key={m.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                      <td className="px-5 py-3 text-slate-600">{fmtDate(m.date_operation)}</td>
                      <td className="px-5 py-3 font-mono font-semibold text-brand-700">{m.matricule}</td>
                      <td className="px-5 py-3">
                        <Link to={`/employes/${m.employe_id}`} className="font-semibold text-slate-800 hover:text-brand-700">
                          {m.nom} {m.prenom}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-slate-500">{m.categorie}</td>
                      <td className="px-5 py-3"><BadgeType type={m.type_operation} /></td>
                      <td className={`px-5 py-3 text-end font-semibold ${
                        m.type_operation === 'prelevement' || m.type_operation === 'maladie' ? 'text-amber-600' : m.type_operation === 'absence' ? 'text-slate-500' : 'text-emerald-600'
                      }`}>
                        {m.type_operation === 'prelevement' || m.type_operation === 'maladie' ? '−' : m.type_operation === 'absence' ? '·' : '+'}{fmtJours(m.jours)}
                      </td>
                      <td className="px-5 py-3 text-end font-mono text-slate-700">{fmtJours(m.solde_apres)} j</td>
                      <td className="max-w-full sm:w-[220px] truncate px-5 py-3 text-slate-500" title={m.motif}>{m.motif || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
