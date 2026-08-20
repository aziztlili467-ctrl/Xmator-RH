import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { downloadFile, fmtDate } from '../utils';
import { IconUpload, IconDownload, IconTrash, IconEdit } from '../components/icons';

// "HH:mm:ss" -> "HH:mm" (colonnes compactes)
const short = (hms) => (hms ? hms.slice(0, 5) : '');

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

export default function Presence() {
  const { user } = useAuth();
  const [debut, setDebut] = useState('');
  const [fin, setFin] = useState('');
  const [matricule, setMatricule] = useState('');
  const [categorieId, setCategorieId] = useState('');
  const [categories, setCategories] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [importTexte, setImportTexte] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [importResult, setImportResult] = useState(null);
  const fileRef = useRef(null);
  const restoreFileRef = useRef(null);

  // --- Gestion des données de la période (super_admin) ---
  const [gDebut, setGDebut] = useState('');
  const [gFin, setGFin] = useState('');
  const [gMatricule, setGMatricule] = useState('');
  const [gestionMsg, setGestionMsg] = useState('');
  const [gestionErreur, setGestionErreur] = useState(false);
  const [suppressionOuverte, setSuppressionOuverte] = useState(false);
  const [suppression, setSuppression] = useState(false);

  // --- Édition manuelle d'un retard / d'une sortie anticipée ---
  const [edit, setEdit] = useState(null);
  const [editRetard, setEditRetard] = useState('');
  const [editSortie, setEditSortie] = useState('');
  const [editMotif, setEditMotif] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  useEffect(() => {
    api.categories()
      .then((r) => setCategories(r.categories || r || []))
      .catch(() => {});
  }, []);

  const load = (d, f, m, c) => {
    setLoading(true);
    setError('');
    api.presence({ debut: d, fin: f, matricule: m, categorie_id: c })
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

  // Total d'écart sur les lignes affichées
  const somme = (key) => (data ? data.lignes.reduce((s, l) => s + (l[key] || 0), 0) : 0);
  const fmtSomme = (sec) => {
    sec = Math.max(0, Math.round(sec || 0));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return [h, m, s].map((x) => String(x).padStart(2, '0')).join(':');
  };

  // Ramadan(s) intersectant la période affichée
  const ramadanActifs = () => {
    if (!data || !data.ramadan || !data.ramadan.length) return [];
    return data.ramadan.filter((r) => {
      const db = debut || '0000-00-00';
      const df = fin || '9999-12-31';
      return r.debut <= df && r.fin >= db;
    });
  };

  const exportCsv = () => {
    if (!data) return;
    const header = ['Matricule', 'Nom', 'Prénom', 'Catégorie', 'Date', 'Entrée régl.', 'Entrée réelle', 'Retard', 'Sortie régl.', 'Sortie réelle', 'Sortie anticipée', 'Statut'];
    const lines = data.lignes.map((l) => [
      l.matricule, l.nom, l.prenom, l.categorie, fmtDate(l.date),
      l.entree_regle || '', l.entree_reelle || '', l.retard || '',
      l.sortie_regle || '', l.sortie_reelle || '', l.sortie_anticipee || '', l.statut,
    ].join(';'));
    downloadFile(`pointages_${debut || 'tout'}_${fin || 'tout'}.csv`, [header, ...lines].join('\n'));
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
      const r = await api.importPresence(importTexte);
      setImportResult(r);
      load(debut, fin, matricule, categorieId);
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

  // --- Gestion des données de la période (TXT) ---
  const paramsGestion = () => ({ debut: gDebut, fin: gFin, matricule: gMatricule });

  const telechargerTxt = async () => {
    setGestionMsg('');
    setGestionErreur(false);
    try {
      await api.presenceExport(paramsGestion());
      setGestionErreur(false);
      setGestionMsg('Téléchargement du fichier TXT lancé.');
    } catch (e) {
      setGestionErreur(true);
      setGestionMsg(e.message);
    }
  };

  const restaurerTxt = (fichier) => {
    if (!fichier) return;
    const reader = new FileReader();
    reader.onload = async () => {
      setGestionMsg('');
      setGestionErreur(false);
      try {
        const r = await api.importPresence(String(reader.result || ''));
        setGestionMsg(`Restauration terminée : ${r.importes} pointage(s) créé(s), ${r.doublons} déjà présent(s) (ré-import ignoré).`);
        load(debut, fin, matricule, categorieId);
      } catch (e) {
        setGestionErreur(true);
        setGestionMsg(e.message);
      }
    };
    reader.readAsText(fichier);
  };

  const demanderSuppression = () => {
    setGestionMsg('');
    setGestionErreur(false);
    if (!gDebut && !gFin) {
      setGestionErreur(true);
      setGestionMsg('Indiquez au moins une date de début ou de fin avant de supprimer.');
      return;
    }
    setSuppressionOuverte(true);
  };

  const supprimerPeriode = async () => {
    setSuppression(true);
    setGestionMsg('');
    setGestionErreur(false);
    try {
      const r = await api.presenceDelete(paramsGestion());
      setSuppressionOuverte(false);
      setGestionMsg(`${r.supprimes} pointage(s) supprimé(s)${r.jours ? ` sur ${r.jours} jour(s)` : ''}. Les corrections de cette période ont été supprimées.`);
      load(debut, fin, matricule, categorieId);
    } catch (e) {
      setGestionErreur(true);
      setGestionMsg(e.message);
    } finally {
      setSuppression(false);
    }
  };

  // --- Édition manuelle d'une ligne ---
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Présences & pointages</h2>
          <p className="text-sm text-slate-500">
            Analyse des badgeages : entrée (min) / sortie (max) du jour, retards et sorties anticipées par rapport aux horaires réglementaires de la catégorie.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={exportCsv} disabled={!data || !data.lignes.length}>
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
            {data.totaux.lignes} ligne(s) de présence{data.totaux.pointages_uniques > 0 && ` — ${data.totaux.pointages_uniques} pointage(s) unique(s)`}
          </p>
        )}
      </div>

      {ramadanActifs().length > 0 && (
        <p className="rounded-lg bg-sky-50 px-4 py-3 text-sm text-sky-800 ring-1 ring-sky-200">
          Horaires réduits appliqués pendant le ramadan :{' '}
          {ramadanActifs().map((r) => `du ${fmtDate(r.debut)} au ${fmtDate(r.fin)}`).join(' ; ')}.
        </p>
      )}

      <p className="rounded-lg bg-indigo-50 px-4 py-3 text-sm text-indigo-800 ring-1 ring-indigo-200">
        Tolérance : un retard n'est comptabilisé que s'il dépasse 30 minutes ; une sortie anticipée n'est comptabilisée que si l'employé part 15 minutes avant l'heure réglementaire de sortie.
      </p>

      {data && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="card p-4">
              <p className="text-[11px] font-semibold uppercase text-slate-400">Lignes de présence</p>
              <p className="text-2xl font-bold text-slate-800">{data.totaux.lignes}</p>
            </div>
            <div className="card p-4">
              <p className="text-[11px] font-semibold uppercase text-slate-400">Conformes</p>
              <p className="text-2xl font-bold text-emerald-600">{data.totaux.conformes}</p>
            </div>
            <div className="card p-4">
              <p className="text-[11px] font-semibold uppercase text-slate-400">Retards (total)</p>
              <p className="text-2xl font-bold text-red-600">{data.totaux.retards}</p>
              <p className="font-mono text-xs text-slate-500">{fmtSomme(somme('retard_secondes'))}</p>
            </div>
            <div className="card p-4">
              <p className="text-[11px] font-semibold uppercase text-slate-400">Sorties anticipées</p>
              <p className="text-2xl font-bold text-amber-600">{data.totaux.depart_anticipe}</p>
              <p className="font-mono text-xs text-slate-500">{fmtSomme(somme('sortie_anticipee_secondes'))}</p>
            </div>
            <div className="card p-4">
              <p className="text-[11px] font-semibold uppercase text-slate-400">Pointages uniques</p>
              <p className="text-2xl font-bold text-violet-600">{data.totaux.pointages_uniques}</p>
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
                    <th className="px-3 py-3 text-center">Entrée réglementaire</th>
                    <th className="px-3 py-3 text-center">Entrée réelle</th>
                    <th className="px-3 py-3 text-center">Retard</th>
                    <th className="px-3 py-3 text-center">Sortie réglementaire</th>
                    <th className="px-3 py-3 text-center">Sortie réelle</th>
                    <th className="px-3 py-3 text-center">Sortie anticipée</th>
                    <th className="px-3 py-3 text-center">Statut / Anomalie</th>
                    {user?.role === 'super_admin' && <th className="px-3 py-3 text-center">Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={11 + (user?.role === 'super_admin' ? 1 : 0)} className="px-4 py-10 text-center text-slate-500">Chargement…</td></tr>
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
            {!loading && data.lignes.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-slate-500">
                Aucune présence pour cette période{matricule ? ` et ce matricule (${matricule})` : ''}{categorieId ? ' et cette catégorie' : ''}. Importez un fichier de pointages, ou élargissez le filtre.
              </p>
            )}
          </div>
        </>
      )}

      {user?.role === 'super_admin' && (
        <>
          <div className="card p-4">
            <div className="mb-3">
              <h3 className="text-sm font-bold text-slate-900">Gestion des données de la période</h3>
              <p className="mt-1 text-xs text-slate-500">
                Télécharger les pointages de la période en <span className="font-mono">.txt</span> (format d'import), les restaurer à partir d'un
                fichier téléchargé, ou supprimer les données d'une période. Une période vide couvre tout l'historique.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm font-semibold text-slate-600">Période :</label>
              <div className="flex items-center gap-2">
                <input type="date" className="input" value={gDebut} onChange={(e) => setGDebut(e.target.value)} />
                <span className="text-slate-400">→</span>
                <input type="date" className="input" value={gFin} onChange={(e) => setGFin(e.target.value)} />
              </div>
              <label className="text-sm font-semibold text-slate-600">Matricule :</label>
              <input
                type="text"
                className="input w-28 font-mono"
                placeholder="ex : 35"
                value={gMatricule}
                onChange={(e) => setGMatricule(e.target.value)}
              />
              {(gDebut || gFin || gMatricule) && (
                <button
                  className="text-xs font-semibold text-brand-600 hover:underline"
                  onClick={() => { setGDebut(''); setGFin(''); setGMatricule(''); setGestionMsg(''); setGestionErreur(false); }}
                >
                  Réinitialiser
                </button>
              )}
            </div>

            <input
              ref={restoreFileRef}
              type="file"
              accept=".txt,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files && e.target.files[0];
                if (f) restaurerTxt(f);
                e.target.value = '';
              }}
            />

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button className="btn-secondary" onClick={telechargerTxt} title="Télécharger les pointages de la période en TXT">
                <IconDownload /> Télécharger (TXT)
              </button>
              <button
                className="btn-secondary"
                onClick={() => restoreFileRef.current && restoreFileRef.current.click()}
                title="Restaurer les pointages depuis un fichier TXT téléchargé (ré-import idempotent)"
              >
                <IconUpload /> Restaurer (TXT)
              </button>
              <button
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={demanderSuppression}
                title="Supprimer les pointages (et leurs corrections) de la période"
              >
                <IconTrash /> Supprimer
              </button>
            </div>

            {gestionMsg && (
              <p className={`mt-3 rounded-lg px-4 py-3 text-sm ring-1 ${gestionErreur ? 'bg-red-50 text-red-700 ring-red-200' : 'bg-emerald-50 text-emerald-700 ring-emerald-200'}`}>
                {gestionMsg}
              </p>
            )}
          </div>

          <div className="card p-4">
            <div className="mb-3">
              <h3 className="text-sm font-bold text-slate-900">Importer les pointages</h3>
            <p className="mt-1 text-xs text-slate-500">
              Fichier de badgeuse <span className="font-mono">.csv</span> / <span className="font-mono">.txt</span> avec les colonnes{' '}
              <span className="font-mono">Matricule</span> + <span className="font-mono">Horodatage</span> (formats{' '}
              <span className="font-mono">AAAA-MM-JJ HH:mm:ss</span> ou <span className="font-mono">JJ/MM/AAAA HH:mm:ss</span>), ou{' '}
              <span className="font-mono">Matricule</span> + <span className="font-mono">Date</span> + <span className="font-mono">Heure</span>.
              Séparateur détecté automatiquement (tabulation, point-virgule ou virgule). Un ré-import du même horodatage est ignoré ;
              seuls les matricules présents en base sont importés.
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
              Import terminé : <strong>{importResult.importes}</strong> pointage(s) créé(s), <strong>{importResult.doublons}</strong> déjà présent(s)
              (ré-import ignoré){importResult.debut && <> — du {fmtDate(importResult.debut)} au {fmtDate(importResult.fin)}</>}.
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
        </>
      )}

      {suppressionOuverte && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-base font-bold text-slate-900">Supprimer les pointages ?</h3>
            <p className="mt-2 text-sm text-slate-600">
              Cette action supprimera définitivement les pointages{gDebut && <> du <span className="font-mono">{fmtDate(gDebut)}</span></>}
              {gFin && <> au <span className="font-mono">{fmtDate(gFin)}</span></>}
              {gMatricule && <> pour le matricule <span className="font-mono">{gMatricule}</span></>}
              {' '}ainsi que leurs corrections. Elle est consignée au mouchard. Continuer ?
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setSuppressionOuverte(false)} disabled={suppression}>
                Annuler
              </button>
              <button
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={supprimerPeriode}
                disabled={suppression}
              >
                <IconTrash /> {suppression ? 'Suppression…' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {edit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
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
    </div>
  );
}