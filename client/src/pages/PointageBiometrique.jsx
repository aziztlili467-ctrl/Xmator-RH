import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { fmtDate } from '../utils';
import { IconDownload, IconPrinter, IconTrash, IconEdit } from '../components/icons';

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
  const { user } = useAuth();
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

  // ----- Suppression de l'historique biométrique -----
  const [suppression, setSuppression] = useState(false);

  const periodeLibelle = () => {
    if (debut && fin && debut === fin) return fmtDate(debut);
    if (debut && fin) return `du ${fmtDate(debut)} au ${fmtDate(fin)}`;
    if (debut) return `à partir du ${fmtDate(debut)}`;
    if (fin) return `jusqu'au ${fmtDate(fin)}`;
    return 'toute la période';
  };

  const supprimerHistorique = async () => {
    setSuppression(true);
    setError('');
    try {
      await api.presenceBiometriqueDelete({ debut, fin, matricule, categorie_id: categorieId });
      setData(null);
      load(debut, fin, '', '');
      setMatricule('');
      setCategorieId('');
    } catch (e) {
      setError(e.message);
    } finally {
      setSuppression(false);
    }
  };

  // ----- Exports -----
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
    const header = ['Matricule', 'Nom', 'Prénom', 'Catégorie', 'Date', 'Entrée réglementaire', 'Entrée réelle', 'Retard', 'Sortie réglementaire', 'Sortie réelle', 'Sortie anticipée', 'Statut / Anomalie'];
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

  // ----- Filtres de colonnes (style Excel) : identiques à « Présences & pointages » -----
  const COLONNES = [
    { key: 'matricule', label: 'Matricule', get: (l) => l.matricule || '' },
    { key: 'employe', label: 'Employé', get: (l) => `${l.nom || ''} ${l.prenom || ''}`.trim() },
    { key: 'categorie', label: 'Catégorie', get: (l) => l.categorie || '' },
    { key: 'date', label: 'Date', get: (l) => fmtDate(l.date) },
    { key: 'entree_regle', label: 'Entrée réglementaire', get: (l) => l.entree_regle || '—' },
    { key: 'entree_reelle', label: 'Entrée réelle', get: (l) => l.entree_reelle || '—' },
    { key: 'retard', label: 'Retard', get: (l) => (l.retard !== null && l.retard !== undefined && l.retard !== '00:00:00' ? l.retard : '—') },
    { key: 'sortie_regle', label: 'Sortie réglementaire', get: (l) => l.sortie_regle || '—' },
    { key: 'sortie_reelle', label: 'Sortie réelle', get: (l) => (l.sortie_reelle !== null && l.sortie_reelle !== undefined ? l.sortie_reelle : 'n/a') },
    { key: 'sortie_anticipee', label: 'Sortie anticipée', get: (l) => (l.sortie_anticipee !== null && l.sortie_anticipee !== undefined && l.sortie_anticipee !== '00:00:00' ? l.sortie_anticipee : '—') },
    { key: 'statut', label: 'Statut / Anomalie', get: (l) => l.statut || '' },
  ];

  const [filtres, setFiltres] = useState({});
  const [colFiltreOuverte, setColFiltreOuverte] = useState(null);
  const [rechercheFiltre, setRechercheFiltre] = useState('');
  const [filtrePos, setFiltrePos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (colFiltreOuverte === null) return;
    const onDoc = (e) => {
      if (!e.target || !e.target.closest || !e.target.closest('[data-colfiltre]')) {
        setColFiltreOuverte(null);
        setRechercheFiltre('');
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [colFiltreOuverte]);

  const filtreActifCount = Object.values(filtres).filter((s) => s && s.size > 0).length;

  const colOptions = useMemo(() => {
    const map = {};
    COLONNES.forEach((col) => {
      const counts = new Map();
      (data?.lignes || []).forEach((l) => {
        const v = col.get(l) || '';
        counts.set(v, (counts.get(v) || 0) + 1);
      });
      const arr = [...counts.entries()]
        .filter(([v]) => v !== '')
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => String(a.value).localeCompare(String(b.value), 'fr', { numeric: true }));
      if (counts.has('')) arr.push({ value: '', count: counts.get('') });
      map[col.key] = arr;
    });
    return map;
  }, [data]);

  const valeursDistinctes = (col) => (colOptions[col.key] || []).map((o) => o.value);

  const toggleFiltre = (colKey, valeur) => {
    setFiltres((prev) => {
      const cur = new Set(prev[colKey] || []);
      if (cur.has(valeur)) cur.delete(valeur); else cur.add(valeur);
      const next = { ...prev };
      if (cur.size === 0) delete next[colKey]; else next[colKey] = cur;
      return next;
    });
  };

  const effacerFiltres = () => setFiltres({});

  const ouvrirFiltreCol = (colKey, evt) => {
    setRechercheFiltre('');
    if (colFiltreOuverte === colKey) { setColFiltreOuverte(null); return; }
    const rect = evt?.currentTarget?.getBoundingClientRect?.();
    if (rect) {
      const estimeMaxH = Math.min(320, window.innerHeight - 70);
      const top = (rect.bottom + 6 + estimeMaxH <= window.innerHeight)
        ? rect.bottom + 6
        : Math.max(8, rect.top - estimeMaxH - 6);
      setFiltrePos({ top, left: Math.min(rect.left, window.innerWidth - 262) });
    } else {
      setFiltrePos({ top: 60, left: 12 });
    }
    setColFiltreOuverte(colKey);
  };

  const valeursMenu = (col) => {
    const options = colOptions[col.key] || [];
    const q = String(rechercheFiltre || '').trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => String(o.value).toLowerCase().includes(q));
  };

  const lignesFiltrees = (() => {
    if (!data) return [];
    if (filtreActifCount === 0) return data.lignes || [];
    return (data.lignes || []).filter((l) => {
      for (const [colKey, setVal] of Object.entries(filtres)) {
        if (!setVal || setVal.size === 0) continue;
        const col = COLONNES.find((c) => c.key === colKey);
        const val = col ? (col.get(l) || '') : '';
        if (!setVal.has(val)) return false;
      }
      return true;
    });
  })();

  // ----- Correction manuelle d'une ligne (même logique que « Présences & pointages ») -----
  const [edit, setEdit] = useState(null);
  const [editRetard, setEditRetard] = useState('');
  const [editSortie, setEditSortie] = useState('');
  const [editMotif, setEditMotif] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const minutesVers = (sec) => (sec === null || sec === undefined ? '' : String((sec / 60).toFixed(1).replace(/\.0$/, '')));

  const ouvrirEdit = (l) => {
    setEdit(l);
    setEditRetard(l.correction && l.correction.retard_secondes !== null ? minutesVers(l.correction.retard_secondes) : '');
    setEditSortie(l.correction && l.correction.sortie_anticipee_secondes !== null ? minutesVers(l.correction.sortie_anticipee_secondes) : '');
    setEditMotif(l.correction?.motif || '');
    setEditError('');
  };

  const secVers = (v) => {
    const t = String(v).trim().replace(',', '.');
    if (t === '') return null;
    const n = Number(t);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 60) : null;
  };

  const enregistrerCorrection = async () => {
    if (!edit) return;
    setEditSaving(true);
    setEditError('');
    try {
      await api.presenceCorrection({
        employe_id: edit.employe_id,
        date: edit.date,
        retard_secondes: secVers(editRetard),
        sortie_anticipee_secondes: secVers(editSortie),
        motif: editMotif,
      });
      setEdit(null);
      load(debut, fin, matricule, categorieId);
    } catch (e) {
      setEditError(e.message);
    } finally {
      setEditSaving(false);
    }
  };

  const retablirAuto = async () => {
    if (!edit) return;
    setEditSaving(true);
    setEditError('');
    try {
      await api.supprimerCorrectionPresence({ employe_id: edit.employe_id, date: edit.date });
      setEdit(null);
      load(debut, fin, matricule, categorieId);
    } catch (e) {
      setEditError(e.message);
    } finally {
      setEditSaving(false);
    }
  };

  const kpi = useMemo(() => {
    if (!data || !data.totaux) return null;
    return data.totaux;
  }, [data]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">POINTAGE BIOMÉTRIQUE (XMATOR-EYE)</h2>
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
          <button
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => document.getElementById('dialog-suppr-historique').showModal()}
            title="Supprime tous les pointages biométriques de la période filtrée"
          >
            <IconTrash /> Supprimer l'historique
          </button>
        </div>
      </div>

      <dialog id="dialog-suppr-historique" className="w-[min(92vw,440px)] rounded-2xl border border-slate-200 p-6 shadow-2xl backdrop:bg-slate-900/50">
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
              <IconTrash />
            </span>
            <div>
              <h3 className="text-base font-bold text-slate-900">Supprimer l'historique biométrique</h3>
              <p className="mt-1 text-sm text-slate-600">
                Êtes-vous sûr de vouloir supprimer définitivement les pointages biométriques{' '}
                <b>{periodeLibelle()}</b>
                {matricule && <> pour le matricule <b>{matricule}</b></>}
                {categorieId && <> de la catégorie concernée</>} ?
              </p>
              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
                Cette action est irréversible et ne peut pas être annulée.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              className="btn-secondary"
              onClick={() => document.getElementById('dialog-suppr-historique').close()}
            >
              Annuler
            </button>
            <button
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={suppression}
              onClick={() => {
                document.getElementById('dialog-suppr-historique').close();
                supprimerHistorique();
              }}
            >
              <IconTrash /> {suppression ? 'Suppression…' : 'Supprimer définitivement'}
            </button>
          </div>
        </div>
      </dialog>

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
        Seuls les pointages horodatés sur la borne biométrique (source « biometrique ») sont comptabilisés ici. Les
        horaires réglementaires (entrée / sortie) sont définis par catégorie dans{' '}
        <strong>Paramètres de Pointage → Tolérance de retard et de sortie</strong>. Un retard n'est comptabilisé que
        s'il dépasse 30 minutes ; une sortie anticipée que si elle précède de plus de 15 minutes l'heure réglementaire.
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
            {filtreActifCount > 0 && (
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2" style={{ background: '#fef9ec' }}>
                <span className="text-xs font-semibold text-amber-700">Filtres actifs : {filtreActifCount} colonne(s) · {lignesFiltrees.length} ligne(s) affichée(s) sur {data.totaux.lignes}</span>
                <button type="button" className="btn-secondary px-2.5 py-1 text-xs" onClick={effacerFiltres}>✕ Effacer tous les filtres</button>
              </div>
            )}
            <div className="table-wrap">
              <table className="w-max-table text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-start text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {COLONNES.map((col) => {
                      const actif = (filtres[col.key]?.size || 0) > 0;
                      return (
                        <th key={col.key} className={`px-3 py-3 ${col.key === 'date' || col.key.startsWith('entree') || col.key.startsWith('sortie') || col.key === 'retard' ? 'text-center' : ''}`}>
                          <div className="inline-flex items-center gap-1.5">
                            <span>{col.label}</span>
                            <button
                              type="button"
                              data-colfiltre
                              onClick={(e) => ouvrirFiltreCol(col.key, e)}
                              className="flex h-5 w-5 items-center justify-center rounded border text-[10px] font-bold transition"
                              title={`Filtrer par ${col.label}`}
                              style={
                                actif
                                  ? { background: '#f59e0b', borderColor: '#f59e0b', color: '#fff' }
                                  : { background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }
                              }
                            >
                              ⌄
                            </button>
                          </div>
                        </th>
                      );
                    })}
                    {user?.role === 'super_admin' && <th className="px-3 py-3 text-center">Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={11 + (user?.role === 'super_admin' ? 1 : 0)} className="px-4 py-10 text-center text-slate-500">Chargement…</td></tr>
                  ) : lignesFiltrees.length === 0 ? (
                    <tr><td colSpan={11 + (user?.role === 'super_admin' ? 1 : 0)} className="px-4 py-10 text-center text-slate-500">Aucun pointage biométrique sur cette période.</td></tr>
                  ) : (
                    lignesFiltrees.map((l) => {
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
                            {l.retard_manuel && (
                              <span className="ms-1 rounded bg-sky-100 px-1 py-0.5 text-[10px] font-semibold text-sky-700" title={l.correction?.motif || 'Valeur corrigée manuellement'}>man.</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center font-mono text-xs text-slate-600">{l.sortie_regle || '—'}</td>
                          <td className="px-3 py-2 text-center font-mono text-xs font-bold text-slate-800">
                            {l.sortie_reelle !== null ? l.sortie_reelle : <span className="text-violet-500" title="Un seul pointage détecté">n/a</span>}
                          </td>
                          <td className={`px-3 py-2 text-center font-mono text-xs font-bold ${(l.sortie_anticipee_secondes || 0) > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                            {l.sortie_anticipee !== null ? (l.sortie_anticipee === '00:00:00' ? '—' : l.sortie_anticipee) : '—'}
                            {l.sortie_anticipee_manuelle && (
                              <span className="ms-1 rounded bg-sky-100 px-1 py-0.5 text-[10px] font-semibold text-sky-700" title={l.correction?.motif || 'Valeur corrigée manuellement'}>man.</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${b.cls}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${b.dot}`} />
                              {l.statut}
                            </span>
                          </td>
                          {user?.role === 'super_admin' && (
                            <td className="px-3 py-2 text-center">
                              <button
                                className="btn-secondary px-2.5 py-1.5 text-xs"
                                title="Corriger manuellement le retard / la sortie anticipée"
                                onClick={() => ouvrirEdit(l)}
                              >
                                <IconEdit /> Éditer
                              </button>
                            </td>
                          )}
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

      {edit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overscroll-contain bg-slate-900/50 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:p-4">
          <div className="modal-shell w-full max-w-lg rounded-xl bg-white p-4 shadow-xl sm:p-6">
            <h3 className="text-base font-bold text-slate-900">Corriger la ligne</h3>
            <p className="mt-1 text-sm text-slate-600">
              <span className="font-mono text-xs font-bold text-brand-600">{edit.matricule}</span> — {edit.nom} {edit.prenom} —{' '}
              <span className="font-mono text-xs">{fmtDate(edit.date)}</span>
              {' '}(<span className="text-xs text-slate-500">{edit.statut}</span>)
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Valeurs automatiques : retard <strong>{edit.retard || 'aucun'}</strong>, sortie anticipée{' '}
              <strong>{edit.sortie_anticipee || 'aucune'}</strong>. Laissez un champ vide pour conserver la valeur automatique.
            </p>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Retard (minutes)</label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  className="input"
                  placeholder={edit.retard_manuel ? 'vide = conserver' : 'auto'}
                  value={editRetard}
                  onChange={(e) => setEditRetard(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Sortie anticipée (minutes)</label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  className="input"
                  placeholder={edit.sortie_anticipee_manuelle ? 'vide = conserver' : 'auto'}
                  value={editSortie}
                  onChange={(e) => setEditSortie(e.target.value)}
                />
              </div>
            </div>

            <div className="mt-3">
              <label className="label">Motif (optionnel)</label>
              <input
                type="text"
                className="input"
                placeholder="ex : erreur de saisie badgeuse"
                value={editMotif}
                onChange={(e) => setEditMotif(e.target.value)}
              />
            </div>

            {editError && <p className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{editError}</p>}

            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              {(edit.retard_manuel || edit.sortie_anticipee_manuelle) && (
                <button className="btn-secondary" onClick={retablirAuto} disabled={editSaving}>
                  Rétablir l'auto
                </button>
              )}
              <button className="btn-secondary" onClick={() => setEdit(null)} disabled={editSaving}>
                Annuler
              </button>
              <button className="btn-primary" onClick={enregistrerCorrection} disabled={editSaving}>
                {editSaving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Menu de filtre de colonne (position fixe vue fenêtre, clampée dans l'écran) */}
      {colFiltreOuverte && (() => {
        const col = COLONNES.find((c) => c.key === colFiltreOuverte);
        if (!col) return null;
        const opts = valeursMenu(col);
        return (
          <div
            data-colfiltre
            onMouseDown={(e) => e.stopPropagation()}
            className="fixed z-50 w-64 rounded-xl border bg-white p-2 shadow-2xl"
            style={{ top: filtrePos.top, left: filtrePos.left, borderColor: 'var(--border)' }}
          >
            <div className="mb-1.5">
              <input
                className="input w-full px-2 py-1 text-xs"
                placeholder="Rechercher…"
                value={rechercheFiltre}
                onChange={(e) => setRechercheFiltre(e.target.value)}
                autoFocus
              />
            </div>
            <div className="max-h-60 overflow-auto">
              {opts.map((o) => {
                const v = o.value;
                const sel = (filtres[col.key] || new Set()).has(v);
                return (
                  <label key={String(v)} className="flex cursor-pointer select-none items-center gap-2 rounded px-1.5 py-1.5 text-xs hover:bg-amber-50">
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0"
                      style={{ accentColor: '#f59e0b' }}
                      checked={sel}
                      onChange={() => toggleFiltre(col.key, v)}
                    />
                    <span className="truncate font-mono text-slate-700">{v === '' ? <span className="italic text-slate-400">(vide)</span> : v}</span>
                    <span className="ms-auto shrink-0 text-[10px] text-slate-400">{o.count}</span>
                  </label>
                );
              })}
              {opts.length === 0 && <p className="px-1.5 py-2 text-xs text-slate-400">Aucune valeur.</p>}
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
              <button
                type="button"
                className="text-xs font-semibold text-slate-500 hover:underline"
                onClick={() => {
                  const toutes = valeursDistinctes(col);
                  const cur = filtres[col.key];
                  const checked = !(cur && cur.size === toutes.length && toutes.every((v) => cur.has(v)));
                  setFiltres((prev) => {
                    const next = { ...prev };
                    if (checked) next[col.key] = new Set(toutes);
                    else delete next[col.key];
                    return next;
                  });
                }}
              >
                Tout sélectionner
              </button>
              <button type="button" className="btn-primary px-2.5 py-1 text-xs" style={{ background: '#f59e0b' }} onClick={() => { setColFiltreOuverte(null); setRechercheFiltre(''); }}>
                OK
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}