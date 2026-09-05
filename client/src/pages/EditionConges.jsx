import { useEffect, useState } from 'react';
import { api } from '../api';
import { fmtJours, downloadFile } from '../utils';
import { printHtml, printBrandHeader, printBrandHeaderStyle, printBrandFooter, printBrandFooterStyle, printHead } from '../utils/printBranding';
import { IconPrinter, IconDownload, IconSettings, IconFilter } from '../components/icons';

export default function EditionConges() {
  const [data, setData] = useState({ date_ref: '', employes: [] });
  const [categories, setCategories] = useState([]);
  const [employes, setEmployes] = useState([]);
  const [filters, setFilters] = useState({ employe: '', categorie: '', debut: '', fin: '', search: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.categories().then(setCategories).catch(() => {});
    api.employes().then(setEmployes).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    api.editionConges(filters)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [filters]);

  const set = (k, v) => setFilters((f) => ({ ...f, [k]: v }));

  const selectCls = 'input bg-white';

  const buildPrintHtml = () => {
    const rows = data.employes.map((e, i) => `
      <tr style="background:${i % 2 === 0 ? '#f8fafc' : '#fff'}">
        <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#1e293b;text-align:center">${e.matricule}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:13px;font-weight:700;color:#1e293b">${e.nom} ${e.prenom}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#475569">${e.categorie || ''}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:14px;font-weight:700;text-align:center;color:${e.solde_conge <= 0 ? '#dc2626' : e.solde_conge <= 5 ? '#d97706' : '#059669'}">${e.solde_conge} j</td>
      </tr>`).join('');

    const totalSolde = data.employes.reduce((s, e) => s + e.solde_conge, 0);
    const avgSolde = data.employes.length ? (totalSolde / data.employes.length).toFixed(1) : 0;

    return `<!DOCTYPE html><html><head>${printHead('Journal des Congés')}
<style>
  @page{size:A4 portrait;margin:0}
  *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
  body{margin:0;padding:9mm 10mm;font-family:'Inter',system-ui,sans-serif;color:#1e293b;background:#fff}
  ${printBrandHeaderStyle()}
  ${printBrandFooterStyle()}
  .journal-title{font-size:18px;font-weight:800;color:#0f172a;margin-bottom:4px}
  .journal-sub{font-size:12px;color:#64748b;margin-bottom:16px}
  table{width:100%;border-collapse:collapse}
  th{background:#1e3a5f;color:#fff;padding:8px 10px;font-size:12px;font-weight:700;text-align:left}
  th:last-child,td:last-child{text-align:center}
  td{padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:13px}
  .summary{margin-top:16px;padding:10px 14px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;font-size:12px;color:#475569}
  @media print{
    .no-print{display:none!important}
    body{padding:9mm 10mm}
  }
</style>
</head><body>
  ${printBrandHeader('Journal des Congés')}
  <div class="journal-title">Journal des Congés</div>
  <div class="journal-sub">Référence : ${data.date_ref} — ${data.employes.length} employé(s)</div>
  <table>
    <thead><tr>
      <th style="width:70px;text-align:center">Matricule</th>
      <th>Nom & Prénom</th>
      <th style="width:120px">Catégorie</th>
      <th style="width:80px">Solde congé</th>
    </tr></thead>
    <tbody>${rows || '<tr><td colspan="4" style="text-align:center;padding:20px;color:#94a3b8">Aucun employé</td></tr>'}</tbody>
  </table>
  <div class="summary">
    <strong>Total :</strong> ${data.employes.length} employé(s) — <strong>Solde moyen :</strong> ${avgSolde} j — <strong>Solde total :</strong> ${fmtJours(totalSolde)} j
  </div>
  ${printBrandFooter()}
</body></html>`;
  };

  const handlePrint = () => { printHtml(buildPrintHtml()); };

  const handlePdf = () => {
    const qs = new URLSearchParams();
    if (filters.employe) qs.set('employe', filters.employe);
    if (filters.categorie) qs.set('categorie', filters.categorie);
    if (filters.debut) qs.set('debut', filters.debut);
    if (filters.fin) qs.set('fin', filters.fin);
    if (filters.search) qs.set('search', filters.search);
    api.editionCongesPdf(Object.fromEntries(qs));
  };

  const handleExportCsv = () => {
    const header = ['Matricule', 'Nom', 'Prénom', 'Catégorie', 'Solde congé (j)'].join(';');
    const lines = data.employes.map((e) =>
      [e.matricule, e.nom, e.prenom, e.categorie || '', e.solde_conge].join(';')
    );
    downloadFile(`journal-conges_${data.date_ref}.csv`, [header, ...lines].join('\n'));
  };

  const totalSolde = data.employes.reduce((s, e) => s + e.solde_conge, 0);
  const avgSolde = data.employes.length ? (totalSolde / data.employes.length).toFixed(1) : 0;
  const soldeNul = data.employes.filter((e) => e.solde_conge <= 0).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Journal des Congés</h2>
          <p className="text-sm text-slate-500">
            {`Édition et impression — Réf. ${data.date_ref || '—'} — ${data.employes.length} employé(s)`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={handlePrint} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-700 transition">
            <IconPrinter /> Imprimer
          </button>
          <button onClick={handlePdf} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 transition">
            <IconDownload /> Télécharger PDF
          </button>
          <button onClick={handleExportCsv} className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200 transition">
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
          <div className="flex items-center gap-2">
            <input type="date" className="input" value={filters.debut} onChange={(e) => set('debut', e.target.value)} />
            <span className="text-slate-400">→</span>
            <input type="date" className="input" value={filters.fin} onChange={(e) => set('fin', e.target.value)} />
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <button onClick={() => setFilters({ employe: '', categorie: '', debut: '', fin: '', search: '' })} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 transition">
            <IconSettings /> Réinitialiser
          </button>
        </div>
      </div>

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
    </div>
  );
}
