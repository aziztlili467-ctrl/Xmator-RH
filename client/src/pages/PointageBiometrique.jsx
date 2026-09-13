import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { fmtDate } from '../utils';
import { IconDownload, IconPrinter } from '../components/icons';

// Couleur / libellé du statut
function statutBadge(statut) {
  switch (statut) {
    case 'Conforme':
      return { cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500' };
    case 'Retard':
      return { cls: 'bg-red-50 text-red-700 ring-red-200', dot: 'bg-red-500' };
    case 'Départ anticipé':
      return { cls: 'bg-amber-50 text-amber-700 ring-amber-200', dot: 'bg-amber-500' };
    case 'Retard + départ anticipé':
      return { cls: 'bg-red-50 text-red-700 ring-red-200', dot: 'bg-red-500' };
    case 'Pointage unique':
      return { cls: 'bg-violet-50 text-violet-700 ring-violet-200', dot: 'bg-violet-500' };
    default:
      return { cls: 'bg-slate-100 text-slate-600 ring-slate-200', dot: 'bg-slate-400' };
  }
}

export default function PointageBiometrique() {
  const [debut, setDebut] = useState('');
  const [fin, setFin] = useState('');
  const [matricule, setMatricule] = useState('');
  const [categorieId, setCategorieId] = useState('');
  const [categories, setCategories] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.categories()
      .then((r) => setCategories(r.categories || r || []))
      .catch(() => {});
  }, []);

  const load = (d, f, m, c) => {
    setLoading(true);
    setError('');
    api.presenceBiometrique({ debut: d, fin: f, matricule: m, categorie_id: c })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load(debut, fin, matricule, categorieId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeDebut = (v) => { setDebut(v); load(v, fin, matricule, categorieId); };
  const changeFin = (v) => { setFin(v); load(debut, v, matricule, categorieId); };
  const changeMatricule = (v) => { setMatricule(v); load(debut, fin, v, categorieId); };
  const changeCategorie = (v) => { setCategorieId(v); load(debut, fin, matricule, v); };

  const somme = (key) => (data ? data.lignes.reduce((s, l) => s + (l[key] || 0), 0) : 0);
  const fmtSomme = (sec) => {
    sec = Math.max(0, Math.round(sec || 0));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return [h, m, s].map((x) => String(x).padStart(2, '0')).join(':');
  };

  const exporterXls = async () => {
    try { await api.presenceBiometriqueXls({ debut, fin, matricule, categorie_id }); }
    catch (e) { setError(e.message); }
  };
  const imprimerPdf = async () => {
    try { await api.presenceBiometriquePdf({ debut, fin, matricule, categorie_id }); }
    catch (e) { setError(e.message); }
  };
  const exporterCsv = () => {
    if (!data) return;
    const header = ['Matricule', 'Nom', 'Prénom', 'Catégorie', 'Date', 'Entrée régl.', 'Entrée réelle', 'Retard', 'Sortie régl.', 'Sortie réelle', 'Sortie anticipée', 'Statut'];
    const lines = data.lignes.map((l) => [
      l.matricule, l.nom, l.prenom, l.categorie, fmtDate(l.date),
      l.entree_regle || '', l.entree_reelle || '', l.retard || '',
      l.sortie_regle || '', l.sortie_reelle || '', l.sortie_anticipee || '', l.statut,
    ].join(';'));
    const blob = new Blob(['\uFEFF' + [header, ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pointages-biometriques_${debut || 'tout'}_${fin || 'tout'}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const kpi = useMemo(() => {
    if (!data || !data.totaux) return null;
    return data.totaux;
  }, [data]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Pointage biométrique (Xmator-Eye)</h2>
          <p className="text-sm text-slate-500">
            Analyse des badgeages enregistrés via la borne biométrique : entrée (min) / sortie (max) du jour, retards et sorties
            anticipées par rapport aux horaires réglementaires de la catégorie.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={exporterCsv} disabled={!data || !data.lignes.length}>
            <IconDownload /> CSV
          </button>
          <button className="btn-secondary" onClick={exporterXls} disabled={!data || !data.lignes.length}>
            <IconDownload /> Excel
          </button>
          <button className="btn-secondary" onClick={imprimerPdf} disabled={!data || !data.lignes.length}>
            <IconPrinter /> PDF
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
          <label className="text-sm font-semibold text-slate-600">Catégorie :</label>
          <select className="input" value={categorieId} onChange={(e) => changeCategorie(e.target.value)}>
            <option value="">Toutes</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.libelle}</option>
            ))}
          </select>
          {(matricule || categorieId) && (
            <button
              className="text-xs font-semibold text-brand-600 hover:underline"
              onClick={() => { setMatricule(''); setCategorieId(''); load(debut, fin, '', ''); }}
            >
              Effacer les filtres
            </button>
          )}
        </div>
        {data && (
          <p className="text-xs text-slate-400">
            {data.totaux.lignes} ligne(s) de présence biométrique{data.totaux.biometriques > 0 && ` — ${data.totaux.biometriques} via la borne biométrique`}
          </p>
        )}
      </div>

      <p className="rounded-lg bg-cyan-50 px-4 py-3 text-sm text-cyan-800 ring-1 ring-cyan-200">
        Seuls les pointages horodatés sur la borne biométrique (source « biometrique ») sont comptabilisés ici. Détail des contrôles :
        un retard n'est comptabilisé que s'il dépasse 30 minutes ; une sortie anticipée que si elle précède de plus de 15 minutes
        l'heure réglementaire.
      </p>

      {data && kpi && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="card p-4">
              <p className="text-[11px] font-semibold uppercase text-slate-400">Lignes</p>
              <p className="text-2xl font-bold text-slate-800">{kpi.lignes}</p>
            </div>
            <div className="card p-4">
              <p className="text-[11px] font-semibold uppercase text-slate-400">Conformités</p>
              <p className="text-2xl font-bold text-emerald-600">{kpi.conformes}</p>
            </div>
            <div className="card p-4">
              <p className="text-[11px] font-semibold uppercase text-slate-400">Retards (total)</p>
              <p className="text-2xl font-bold text-red-600">{kpi.retards}</p>
              <p className="font-mono text-xs text-slate-500">{fmtSomme(somme('retard_secondes'))}</p>
            </div>
            <div className="card p-4">
              <p className="text-[11px] font-semibold uppercase text-slate-400">Sorties anticipées</p>
              <p className="text-2xl font-bold text-amber-600">{kpi.depart_anticipe}</p>
              <p className="font-mono text-xs text-slate-500">{fmtSomme(somme('sortie_anticipee_secondes'))}</p>
            </div>
            <div className="card p-4">
              <p className="text-[11px] font-semibold uppercase text-slate-400">Pointages uniques</p>
              <p className="text-2xl font-bold text-violet-600">{kpi.pointages_uniques}</p>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="table-wrap">
              <table className="w-max-table text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-start text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-3">Matricule</th>
                    <th className="px-3 py-3">Employé</th>
                    <th className="px-3 py-3">Catégorie</th>
                    <th className="px-3 py-3 text-center">Date</th>
                    <th className="px-3 py-3 text-center">Entrée régl.</th>
                    <th className="px-3 py-3 text-center">Entrée réelle</th>
                    <th className="px-3 py-3 text-center">Retard</th>
                    <th className="px-3 py-3 text-center">Sortie régl.</th>
                    <th className="px-3 py-3 text-center">Sortie réelle</th>
                    <th className="px-3 py-3 text-center">Sortie anticipée</th>
                    <th className="px-3 py-3 text-center">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={11} className="px-4 py-10 text-center text-slate-500">Chargement…</td></tr>
                  ) : data.lignes.length === 0 ? (
                    <tr><td colSpan={11} className="px-4 py-10 text-center text-slate-500">Aucun pointage biométrique sur cette période.</td></tr>
                  ) : (
                    data.lignes.map((l) => {
                      const b = statutBadge(l.statut);
                      return (
                        <tr key={`${l.employe_id}-${l.date}`} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="px-3 py-2 font-mono text-xs font-bold text-brand-600">{l.matricule}</td>
                          <td className="px-3 py-2">
                            <span className="block text-xs font-bold text-slate-800">{l.nom} {l.prenom}</span>
                          </td>
                          <td className="px-3 py-2 text-xs text-slate-500">{l.categorie}</td>
                          <td className="px-3 py-2 text-center font-mono text-xs text-slate-700">{fmtDate(l.date)}</td>
                          <td className="px-3 py-2 text-center font-mono text-xs text-slate-600">{l.entree_regle || '—'}</td>
                          <td className="px-3 py-2 text-center font-mono text-xs font-bold text-slate-800">{l.entree_reelle || '—'}</td>
                          <td className={`px-3 py-2 text-center font-mono text-xs font-bold ${(l.retard_secondes || 0) > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                            {l.retard !== null ? (l.retard === '00:00:00' ? '—' : l.retard) : '—'}
                          </td>
                          <td className="px-3 py-2 text-center font-mono text-xs text-slate-600">{l.sortie_regle || '—'}</td>
                          <td className="px-3 py-2 text-center font-mono text-xs font-bold text-slate-800">
                            {l.sortie_reelle !== null ? l.sortie_reelle : <span className="text-violet-500" title="Un seul pointage détecté">n/a</span>}
                          </td>
                          <td className={`px-3 py-2 text-center font-mono text-xs font-bold ${(l.sortie_anticipee_secondes || 0) > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                            {l.sortie_anticipee !== null ? (l.sortie_anticipee === '00:00:00' ? '—' : l.sortie_anticipee) : '—'}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${b.cls}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${b.dot}`} />
                              {l.statut}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {data && kpi && kpi.lignes > 0 && (
        <p className="text-center text-xs text-slate-400">
          Exportez en <button className="font-semibold text-brand-600 hover:underline" onClick={exporterCsv}>CSV</button>,{' '}
          <button className="font-semibold text-brand-600 hover:underline" onClick={exporterXls}>Excel</button> ou{' '}
          <button className="font-semibold text-brand-600 hover:underline" onClick={imprimerPdf}>PDF</button> pour la période affichée.
        </p>
      )}
    </div>
  );
}