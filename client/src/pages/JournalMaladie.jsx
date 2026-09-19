import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { fmtDate, fmtJours, downloadFile } from '../utils';
import BadgeType from '../components/BadgeType';
import ImprimerPdf from '../components/ImprimerPdf';
import { IconDownload, IconFilter } from '../components/icons';

export default function JournalMaladie() {
  const [data, setData] = useState(null);
  const [employes, setEmployes] = useState([]);
  const [filters, setFilters] = useState({ employe: '', type: '', annee: '', matricule: '', search: '' });
  const [orientation, setOrientation] = useState('portrait');
  const [loading, setLoading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.employes().then(setEmployes).catch(() => {});
  }, []);

  const set = (k, v) => setFilters((f) => ({ ...f, [k]: v }));

  // Les lignes ne sont chargées qu'après un clic sur « Exécuter » (page vide par défaut).
  const executer = () => {
    setLoading(true);
    setError('');
    api.journalMaladie(filters)
      .then(setData)
      .catch((e) => { setError(e.message); setData(null); })
      .finally(() => setLoading(false));
  };

  const reinitialiser = () => setFilters({ employe: '', type: '', annee: '', matricule: '', search: '' });

  const stats = useMemo(() => {
    const ops = (data && data.operations) || [];
    const valides = ops.filter((o) => o.type_operation === 'maladie');
    const absences = ops.filter((o) => o.type_operation === 'absence');
    const credits = ops.filter((o) => o.type_operation === 'solde_initial' || o.type_operation === 'ajout_annuel');
    return {
      valides,
      absences,
      credits,
      nbArrets: valides.length + absences.length,
      consoJours: valides.reduce((s, o) => s + o.jours, 0),
      absenceJours: absences.reduce((s, o) => s + o.jours, 0),
      creditsJours: credits.reduce((s, o) => s + o.jours, 0),
    };
  }, [data]);

  const exportCsv = () => {
    if (!data) return;
    const header = 'Date opération;N° arrêt;Matricule;Agent;Catégorie;Type;Bulletin;Certificat;Jours;Solde après';
    const lines = data.operations.map((m) =>
      [m.date_operation, m.arret_numero ? `N°${String(m.arret_numero).padStart(3, '0')}` : '', m.matricule, `${m.nom} ${m.prenom}`, m.categorie, m.type_operation, m.numero_bulletin || '', m.certificat || '', m.jours, m.solde_apres].join(';')
    );
    downloadFile('journal_arrêts_maladie.csv', [header, ...lines].join('\n'));
  };

  const imprimerPdf = async (o) => {
    if (!data) return;
    setPrinting(true);
    setError('');
    try {
      await api.journalMaladiePrint({ ...filters, orientation: o || orientation });
    } catch (e) {
      setError(e.message);
    } finally {
      setPrinting(false);
    }
  };

  const telechargerPdf = async (o) => {
    if (!data) return;
    setError('');
    try {
      await api.journalMaladiePdf({ ...filters, orientation: o || orientation });
    } catch (e) {
      setError(e.message);
    }
  };

  const selectCls = 'input bg-white';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">JOURNAL DES ARRÊTS MALADIE</h2>
          <p className="text-sm text-slate-500">
            {data
              ? `Toutes les opérations liées à la maladie (soldes, arrêts validés, absences) — ${data.operations.length} opération(s)`
              : 'Toutes les opérations liées à la maladie — cliquez sur Exécuter pour afficher les lignes.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button className="btn-secondary" onClick={exportCsv} disabled={!data || data.operations.length === 0}>
            <IconDownload /> Exporter CSV
          </button>
          <ImprimerPdf
            orientation={orientation}
            onOrientationChange={setOrientation}
            onPrint={imprimerPdf}
            onDownload={telechargerPdf}
            disabled={!data || data.operations.length === 0}
            busy={printing}
          />
        </div>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}

      {data && (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="card p-4">
          <p className="text-[11px] font-semibold uppercase text-slate-400">Arrêts traités</p>
          <p className="text-2xl font-bold text-slate-800">{stats.nbArrets}</p>
          <p className="text-xs text-slate-500">validés + rejetés</p>
        </div>
        <div className="card p-4">
          <p className="text-[11px] font-semibold uppercase text-slate-400">Jours maladie consommés</p>
          <p className="text-2xl font-bold text-rose-600">{fmtJours(stats.consoJours)} j</p>
          <p className="text-xs text-slate-500">arrêts validés</p>
        </div>
        <div className="card p-4">
          <p className="text-[11px] font-semibold uppercase text-slate-400">Jours d'absence</p>
          <p className="text-2xl font-bold text-slate-600">{fmtJours(stats.absenceJours)} j</p>
          <p className="text-xs text-slate-500">arrêts rejetés</p>
        </div>
        <div className="card p-4">
          <p className="text-[11px] font-semibold uppercase text-slate-400">Crédits maladie</p>
          <p className="text-2xl font-bold text-emerald-600">+{fmtJours(stats.creditsJours)} j</p>
          <p className="text-xs text-slate-500">soldes initiaux + ajouts annuels</p>
        </div>
      </div>
      )}

      <div className="card p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <input className="input" placeholder="Recherche (nom, bulletin…)" value={filters.search} onChange={(e) => set('search', e.target.value)} />
          <input type="text" className="input font-mono" placeholder="Matricule (ex : 35)" value={filters.matricule} onChange={(e) => set('matricule', e.target.value)} />
          <select className={selectCls} value={filters.employe} onChange={(e) => set('employe', e.target.value)}>
            <option value="">Tous les employés</option>
            {employes.map((e) => (
              <option key={e.id} value={e.id}>{e.matricule} — {e.nom} {e.prenom}</option>
            ))}
          </select>
          <select className={selectCls} value={filters.type} onChange={(e) => set('type', e.target.value)}>
            <option value="">Tous les types</option>
            <option value="solde_initial">Solde initial</option>
            <option value="ajout_annuel">Ajout annuel</option>
            <option value="maladie">Arrêt maladie validé</option>
            <option value="absence">Absence (rejet)</option>
          </select>
          <div className="flex items-center gap-2">
            <input type="number" className="input" placeholder="Année (ex. 2026)" value={filters.annee} onChange={(e) => set('annee', e.target.value)} />
            <button className="btn-secondary" onClick={reinitialiser}>Réinitialiser</button>
          </div>
          <button className="btn-primary" onClick={executer} disabled={loading}>
            <IconFilter /> {loading ? 'Chargement…' : 'Exécuter'}
          </button>
        </div>
      </div>

      {!data && !loading && (
        <div className="card flex flex-col items-center gap-2 p-8 text-center">
          <IconFilter className="h-8 w-8 text-slate-300" />
          <p className="text-sm font-semibold text-slate-700">Aucune ligne affichée</p>
          <p className="text-sm text-slate-500">
            Renseignez une année et/ou un matricule, puis cliquez sur <strong>Exécuter</strong> pour afficher le journal des arrêts maladie.
          </p>
        </div>
      )}

      {data && (
      <div className="card overflow-hidden">
        <div className="table-wrap">
          <table className="w-max-table text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-start text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3">N° arrêt</th>
                <th className="px-5 py-3">Date opération</th>
                <th className="px-5 py-3">Matricule</th>
                <th className="px-5 py-3">Agent</th>
                <th className="px-5 py-3">Catégorie</th>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3">Bulletin</th>
                <th className="px-5 py-3 text-end">Jours</th>
                <th className="px-5 py-3 text-end">Solde après</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="px-5 py-10 text-center text-slate-500">Chargement…</td></tr>
              ) : data.operations.length === 0 ? (
                <tr><td colSpan={9} className="px-5 py-10 text-center text-slate-500">Aucune opération liée à la maladie ne correspond aux filtres.</td></tr>
              ) : (
                data.operations.map((m) => (
                  <tr key={m.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-5 py-3">
                      {m.arret_numero ? (
                        <Link to={`/maladie/instance`} className="inline-flex items-center rounded-md bg-rose-50 px-2 py-0.5 font-mono text-xs font-bold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100">
                          {`N°${String(m.arret_numero).padStart(3, '0')}`}
                        </Link>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-slate-600">{fmtDate(m.date_operation)}</td>
                    <td className="px-5 py-3 font-mono font-semibold text-brand-700">{m.matricule}</td>
                    <td className="px-5 py-3">
                      <Link to={`/employes/${m.employe_id}`} className="font-semibold text-slate-800 hover:text-brand-700">
                        {m.nom} {m.prenom}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-slate-500">{m.categorie}</td>
                    <td className="px-5 py-3"><BadgeType type={m.type_operation} /></td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-500">{m.numero_bulletin || '—'}</td>
                    <td className={`px-5 py-3 text-end font-semibold ${
                      m.type_operation === 'maladie' ? 'text-rose-600' : m.type_operation === 'absence' ? 'text-slate-500' : 'text-emerald-600'
                    }`}>
                      {m.type_operation === 'solde_initial' || m.type_operation === 'ajout_annuel' ? '+' : '−'}{fmtJours(m.jours)}
                    </td>
                    <td className="px-5 py-3 text-end font-mono text-slate-700">{fmtJours(m.solde_apres)} j</td>
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