import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { fmtDate, fmtJours, downloadFile } from '../utils';
import BadgeType from '../components/BadgeType';
import { IconDownload } from '../components/icons';

export default function Journal() {
  const [mouvements, setMouvements] = useState([]);
  const [categories, setCategories] = useState([]);
  const [employes, setEmployes] = useState([]);
  const [filters, setFilters] = useState({ employe: '', categorie: '', type: '', debut: '', fin: '', search: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.categories().then(setCategories).catch(() => {});
    api.employes().then(setEmployes).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    api.mouvements(filters)
      .then(setMouvements)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [filters]);

  const set = (k, v) => setFilters((f) => ({ ...f, [k]: v }));

  const exportCsv = () => {
    const header = ['Date', 'Matricule', 'Agent', 'Catégorie', 'Type', 'Jours', 'Solde après', 'Motif'].join(';');
    const lines = mouvements.map((m) =>
      [m.date_operation, m.matricule, `${m.nom} ${m.prenom}`, m.categorie, m.type_operation, m.jours, m.solde_apres, m.motif || ''].join(';')
    );
    downloadFile('journal_mouvements.csv', [header, ...lines].join('\n'));
  };

  const selectCls = 'input bg-white';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Journal des mouvements</h2>
          <p className="text-sm text-slate-500">
            {`Historique horodaté de toutes les opérations — ${mouvements.length} opération(s) affichée(s)`}
          </p>
        </div>
        <button className="btn-secondary" onClick={exportCsv}>
          <IconDownload /> Exporter CSV
        </button>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}

      <div className="card p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <input className="input" placeholder="Recherche (matricule, nom, motif…)" value={filters.search} onChange={(e) => set('search', e.target.value)} />
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
          <button className="btn-secondary" onClick={() => setFilters({ employe: '', categorie: '', type: '', debut: '', fin: '', search: '' })}>
            {'Réinitialiser les filtres'}
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
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
                    <td className="max-w-[220px] truncate px-5 py-3 text-slate-500" title={m.motif}>{m.motif || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
