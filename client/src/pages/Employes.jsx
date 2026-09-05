import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api';
import { fmtJours, downloadFile } from '../utils';
import SoldeJauge from '../components/SoldeJauge';
import { IconUsers, IconDownload, IconUpload, IconAlert } from '../components/icons';

const CSV_TEMPLATE = 'matricule;nom;prenom;categorie;rubrique;grade;classe;echelon\n46;Tlili;Mohamed Aziz;Cadre administratif;DIRECTION;CASA;1;1';
const RH_CSV_TEMPLATE = 'matricule;date_naissance;date_embauche\n46;01/02/1980;02/03/2005';

export default function Employes() {
  const location = useLocation();
  const [employes, setEmployes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [grille, setGrille] = useState([]);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [sortKey, setSortKey] = useState('matricule');
  const [sortDir, setSortDir] = useState('asc');
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showImportRh, setShowImportRh] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(location.state?.msg || '');

  const [form, setForm] = useState({ matricule: '', nom: '', prenom: '', categorie_id: '', rubrique: '', grade: '', classe: '', echelon: '', actif: true, departement: '' });
  const [csvText, setCsvText] = useState('');
  const [importResult, setImportResult] = useState(null);
  const [importing, setImporting] = useState(false);

  const [rhText, setRhText] = useState('');
  const [rhResult, setRhResult] = useState(null);
  const [rhImporting, setRhImporting] = useState(false);

  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editError, setEditError] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const [delTarget, setDelTarget] = useState(null);
  const [delError, setDelError] = useState('');
  const [delSaving, setDelSaving] = useState(false);

  const [deptSavingId, setDeptSavingId] = useState(null);

  const DEPT_OPTIONS = ['', 'Siège', 'Comptoir'];

  // Options des listes déroulantes Rubrique / Grade / Classe / Echelon :
  // valeurs distinctes des lignes enregistrées dans la « Grille de salaire », filtrées en cascade
  // (grade selon rubrique, classe selon rubrique+grade, échelon selon rubrique+grade+classe).
  const GRID_OPT = { rubrique: 'Rubrique', grade: 'Grade', classe: 'Classe', echelon: 'Echelon' };
  const grilleDistinct = useMemo(() => (rows, k) =>
    [...new Set(rows.map((l) => String(l[k] ?? '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr')), []);
  const grilleOptions = (e, field) => {
    let rows = grille;
    if (e.rubrique) rows = rows.filter((l) => String(l.rubrique ?? '').trim() === String(e.rubrique).trim());
    if (field !== 'grade' && e.grade) rows = rows.filter((l) => String(l.grade ?? '').trim() === String(e.grade).trim());
    if ((field === 'classe' || field === 'echelon') && e.classe) rows = rows.filter((l) => String(l.classe ?? '').trim() === String(e.classe).trim());
    const list = grilleDistinct(rows, field);
    const cur = String(e[field] ?? '').trim();
    if (cur && !list.includes(cur)) list.push(cur);
    return list;
  };

  const [grilleDrafts, setGrilleDrafts] = useState({});

  const saveGrilleField = (id, field, value) => {
    setGrilleDrafts((p) => ({ ...p, [id]: { ...(p[id] || {}), [field]: value } }));
    api.updateEmploye(id, { [field]: value })
      .then(() => {
        const emp = employes.find((x) => x.id === id);
        setSuccess(`${GRID_OPT[field]} de ${emp ? `${emp.nom} ${emp.prenom}` : 'l\'employé'} mis à jour.`);
        load();
      })
      .catch((err) => setError(err.message))
      .finally(() => setGrilleDrafts((p) => {
        const n = { ...p };
        if (n[id]) {
          const rest = { ...n[id] };
          delete rest[field];
          if (Object.keys(rest).length === 0) delete n[id]; else n[id] = rest;
        }
        return n;
      }));
  };

  const grilleValue = (e, field) => (grilleDrafts[e.id]?.[field] ?? e[field] ?? '');

  const saveDepartement = (e) => {
    const value = e.target.value;
    if (value === e.currentTarget.dataset.okval) return;
    setDeptSavingId(e.currentTarget.dataset.id);
    api.updateEmploye(Number(e.currentTarget.dataset.id), { departement: value })
      .then(() => { setSuccess(`Département mis à jour.`); load(); })
      .catch((err) => setError(err.message))
      .finally(() => setDeptSavingId(null));
  };

  const load = () => {
    api.employes({ search, categorie: catFilter }).then(setEmployes).catch((e) => setError(e.message));
  };

  useEffect(() => {
    api.categories().then(setCategories).catch(() => {});
    api.grilleSalaire().then(setGrille).catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, catFilter]);

  const sorted = useMemo(() => {
    const arr = [...employes];
    arr.sort((a, b) => {
      let va = a[sortKey];
      let vb = b[sortKey];
      if (sortKey === 'matricule') { va = Number(a.matricule); vb = Number(b.matricule); }
      if (sortKey === 'nom') { va = `${a.nom} ${a.prenom}`; vb = `${b.nom} ${b.prenom}`; }
      if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortDir === 'asc' ? va - vb : vb - va;
    });
    return arr;
  }, [employes, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const sortIcon = (key) => (sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '');

  const submitCreate = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.createEmploye({ ...form, categorie_id: Number(form.categorie_id) });
      setForm({ matricule: '', nom: '', prenom: '', categorie_id: '', rubrique: '', grade: '', classe: '', echelon: '', actif: true, departement: '' });
      setShowCreate(false);
      setSuccess('Employé créé avec succès.');
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleFile = (file) => {
    const reader = new FileReader();
    reader.onload = () => setCsvText(String(reader.result));
    reader.readAsText(file);
  };

  const submitImport = async (e) => {
    e.preventDefault();
    setError('');
    setImporting(true);
    setImportResult(null);
    try {
      const r = await api.importCsv(csvText);
      setImportResult(r);
      setSuccess(`${r.imports} employé(s) importé(s).`);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  };

  const exportCsv = () => {
    const header = 'Matricule;Nom;Prénom;Catégorie;Rubrique;Grade;Classe;Echelon;Date naissance;Date embauche;Solde courant';
    const lines = sorted.map((e) => [e.matricule, e.nom, e.prenom, e.categorie, e.rubrique || '', e.grade || '', e.classe || '', e.echelon || '', e.date_naissance || '', e.date_embauche || '', fmtJours(e.solde)].join(';'));
    downloadFile('employes.csv', [header, ...lines].join('\n'), 'text/csv;charset=utf-8');
  };

  const handleRhFile = (file) => {
    const reader = new FileReader();
    reader.onload = () => setRhText(String(reader.result));
    reader.readAsText(file);
  };

  const submitImportRh = async (e) => {
    e.preventDefault();
    setError('');
    setRhImporting(true);
    setRhResult(null);
    try {
      const r = await api.importRh(rhText);
      setRhResult(r);
      setSuccess(`${r.importes} fiche(s) complétée(s) (naissance / embauche).`);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setRhImporting(false);
    }
  };

  const openEdit = (e) => {
    setEditTarget(e);
    setEditForm({ matricule: e.matricule, nom: e.nom, prenom: e.prenom, categorie_id: e.categorie_id, rubrique: e.rubrique || '', grade: e.grade || '', classe: e.classe || '', echelon: e.echelon || '', actif: !!e.actif, departement: e.departement || '' });
    setEditError('');
  };

  const submitEdit = async (ev) => {
    ev.preventDefault();
    setEditError('');
    setEditSaving(true);
    try {
      await api.updateEmploye(editTarget.id, {
        matricule: editForm.matricule,
        nom: editForm.nom,
        prenom: editForm.prenom,
        categorie_id: Number(editForm.categorie_id),
        rubrique: editForm.rubrique,
        grade: editForm.grade,
        classe: editForm.classe,
        echelon: editForm.echelon,
        actif: editForm.actif,
        departement: editForm.departement,
      });
      setEditTarget(null);
      setSuccess(`Fiche de ${editForm.nom} ${editForm.prenom} modifiée.`);
      load();
    } catch (err) {
      setEditError(err.message);
    } finally {
      setEditSaving(false);
    }
  };

  const submitDelete = async () => {
    setDelError('');
    setDelSaving(true);
    try {
      await api.deleteEmploye(delTarget.id);
      setDelTarget(null);
      setSuccess(`L'employé ${delTarget.nom} ${delTarget.prenom} et son historique ont été supprimés.`);
      load();
    } catch (err) {
      setDelError(err.message);
    } finally {
      setDelSaving(false);
    }
  };

  const Th = ({ label, k }) => (
    <th
      onClick={() => toggleSort(k)}
      className="cursor-pointer select-none px-3 py-3 font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-800"
    >
      {label}{sortIcon(k)}
    </th>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Employés</h2>
          <p className="text-sm text-slate-500">{employes.length} fiche(s) · catégories paramétrables</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={() => { setShowImport(true); setError(''); }}>
            <IconDownload /> Importer CSV
          </button>
          <button className="btn-secondary" onClick={() => { setShowImportRh(true); setError(''); setRhResult(null); setRhText(''); }}>
            <IconUpload /> Dates RH (naissance / embauche)
          </button>
          <button className="btn-primary" onClick={() => { setShowCreate(true); setError(''); }}>
            <IconUsers /> Nouvel employé
          </button>
        </div>
      </div>

      {success && <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700 ring-1 ring-emerald-200">{success}</p>}
      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}

      <div className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center">
          <input
            className="input sm:max-w-xs"
            placeholder="Rechercher (matricule, nom…)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className="input sm:max-w-xs" value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
            <option value="">Toutes les catégories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.libelle}</option>
            ))}
          </select>
          <div className="sm:ms-auto">
            <button className="btn-secondary" onClick={exportCsv}>Exporter CSV</button>
          </div>
        </div>

        <div className="table-wrap">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-start">
                <Th label="DEPT" k="departement" />
                <Th label="Matricule" k="matricule" />
                <Th label="Nom et prénom" k="nom" />
                <Th label="Catégorie" k="categorie" />
                <Th label="Rubrique" k="rubrique" />
                <Th label="Grade" k="grade" />
                <Th label="Classe" k="classe" />
                <Th label="Echelon" k="echelon" />
                <Th label="Solde restant" k="solde" />
                <th className="px-3 py-3 font-semibold uppercase tracking-wide text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((e) => (
                <tr key={e.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-3 py-3">
                    <select
                      data-id={e.id}
                      data-okval={e.departement || ''}
                      value={e.departement || ''}
                      onChange={saveDepartement}
                      disabled={deptSavingId === e.id}
                      className="input w-32 cursor-pointer px-2 py-1.5 text-xs"
                      title={`Département de ${e.nom} ${e.prenom}`}
                    >
                      <option value="">—</option>
                      {DEPT_OPTIONS.filter((d) => d !== '').map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-3 font-mono font-semibold text-brand-700">{e.matricule}</td>
                  <td className="px-3 py-3">
                    <Link to={`/employes/${e.id}`} className="font-semibold text-slate-800 hover:text-brand-700">
                      {e.nom} {e.prenom}
                    </Link>
                  </td>
                  <td className="px-3 py-3">
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">{e.categorie}</span>
                  </td>
                  <td className="px-3 py-3 text-xs text-slate-600">
                    <select
                      value={grilleValue(e, 'rubrique')}
                      disabled={grilleDrafts[e.id] !== undefined}
                      onChange={(ev) => saveGrilleField(e.id, 'rubrique', ev.target.value)}
                      className="input w-28 cursor-pointer px-2 py-1.5 text-xs"
                      title={`Rubrique de ${e.nom} ${e.prenom}`}
                    >
                      <option value="">—</option>
                      {grilleOptions(e, 'rubrique').map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-3 text-xs text-slate-600">
                    <select
                      value={grilleValue(e, 'grade')}
                      disabled={grilleDrafts[e.id] !== undefined}
                      onChange={(ev) => saveGrilleField(e.id, 'grade', ev.target.value)}
                      className="input w-28 cursor-pointer px-2 py-1.5 text-xs"
                      title={`Grade de ${e.nom} ${e.prenom}`}
                    >
                      <option value="">—</option>
                      {grilleOptions(e, 'grade').map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-3 text-xs text-slate-600">
                    <select
                      value={grilleValue(e, 'classe')}
                      disabled={grilleDrafts[e.id] !== undefined}
                      onChange={(ev) => saveGrilleField(e.id, 'classe', ev.target.value)}
                      className="input w-28 cursor-pointer px-2 py-1.5 text-xs"
                      title={`Classe de ${e.nom} ${e.prenom}`}
                    >
                      <option value="">—</option>
                      {grilleOptions(e, 'classe').map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-3 text-xs text-slate-600">
                    <select
                      value={grilleValue(e, 'echelon')}
                      disabled={grilleDrafts[e.id] !== undefined}
                      onChange={(ev) => saveGrilleField(e.id, 'echelon', ev.target.value)}
                      className="input w-28 cursor-pointer px-2 py-1.5 text-xs"
                      title={`Echelon de ${e.nom} ${e.prenom}`}
                    >
                      <option value="">—</option>
                      {grilleOptions(e, 'echelon').map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-3">
                      <span className={`w-14 shrink-0 text-end font-bold ${e.solde < 0 ? 'text-red-600' : e.solde < 5 ? 'text-amber-600' : 'text-slate-700'}`}>
                        {fmtJours(e.solde)} j
                      </span>
                      {e.solde < 5 && <IconAlert />}
                      <div className="w-28 shrink-0"><SoldeJauge solde={e.solde} reference={30} showLabel={false} /></div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1.5">
                      <button
                        className="rounded-md px-2.5 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50"
                        onClick={() => openEdit(e)}
                      >
                        Modifier
                      </button>
                      <button
                        className="rounded-md px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                        onClick={() => { setDelError(''); setDelTarget(e); }}
                      >
                        Supprimer
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr><td colSpan={10} className="px-5 py-10 text-center text-slate-500">Aucun employé trouvé.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showCreate && (
        <Modal onClose={() => setShowCreate(false)} title="Nouvel employé">
          <form onSubmit={submitCreate} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="label">Matricule *</label>
                <input className="input" value={form.matricule} onChange={(e) => setForm({ ...form, matricule: e.target.value })} required />
              </div>
              <div>
                <label className="label">Nom *</label>
                <input className="input" value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} required />
              </div>
              <div>
                <label className="label">Prénom *</label>
                <input className="input" value={form.prenom} onChange={(e) => setForm({ ...form, prenom: e.target.value })} required />
              </div>
            </div>
            <div>
              <label className="label">Catégorie professionnelle *</label>
              <select className="input" value={form.categorie_id} onChange={(e) => setForm({ ...form, categorie_id: e.target.value })} required>
                <option value="">Sélectionner…</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.libelle}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Département</label>
              <select className="input" value={form.departement} onChange={(e) => setForm({ ...form, departement: e.target.value })}>
                <option value="">—</option>
                <option value="Siège">Siège</option>
                <option value="Comptoir">Comptoir</option>
              </select>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <div>
                <label className="label">Rubrique</label>
                <input className="input" value={form.rubrique} onChange={(e) => setForm({ ...form, rubrique: e.target.value })} placeholder="ex. DIRECTION" />
              </div>
              <div>
                <label className="label">Grade</label>
                <input className="input" value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} placeholder="ex. CASA" />
              </div>
              <div>
                <label className="label">Classe</label>
                <input className="input" value={form.classe} onChange={(e) => setForm({ ...form, classe: e.target.value })} placeholder="ex. 1" />
              </div>
              <div>
                <label className="label">Echelon</label>
                <input className="input" value={form.echelon} onChange={(e) => setForm({ ...form, echelon: e.target.value })} placeholder="ex. 1" />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={form.actif} onChange={(e) => setForm({ ...form, actif: e.target.checked })} />
              Employé actif
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setShowCreate(false)}>Annuler</button>
              <button className="btn-primary">Enregistrer</button>
            </div>
          </form>
        </Modal>
      )}

      {showImport && (
        <Modal onClose={() => setShowImport(false)} title="Importer des employés (CSV)">
          <form onSubmit={submitImport} className="space-y-4">
            <p className="text-sm text-slate-500">
              Format attendu (colonnes : matricule;nom;prenom;categorie).
              <br />
              Séparez par{' '}
              <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">;</code>{' '}
              ou{' '}
              <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">,</code>.
              <br />
              Les catégories inexistantes sont créées automatiquement.
            </p>
            <div>
              <label className="label">Fichier ou collage du texte</label>
              <input
                type="file"
                accept=".csv,.txt"
                className="mb-2 block w-full text-sm text-slate-600 file:me-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-700"
                onChange={(e) => e.target.files[0] && handleFile(e.target.files[0])}
              />
              <textarea
                className="input min-h-[160px] font-mono text-xs"
                placeholder={CSV_TEMPLATE}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
              />
            </div>
            {importResult && (
              <div className="rounded-lg bg-slate-50 p-3 text-xs">
                <p className="font-bold text-slate-700">{importResult.imports} importé(s) sur {importResult.total} ligne(s)</p>
                <ul className="mt-1 max-h-32 space-y-0.5 overflow-auto text-slate-500">
                  {importResult.resultats.filter((r) => r.statut !== 'ok').map((r, i) => (
                    <li key={i}>Ligne {r.ligne} : {r.statut} — {r.message}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setShowImport(false)}>Fermer</button>
              <button className="btn-primary" disabled={importing || !csvText.trim()}>
                {importing ? 'Importation…' : 'Importer'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {showImportRh && (
        <Modal onClose={() => setShowImportRh(false)} title="Importer les dates RH (CSV)">
          <form onSubmit={submitImportRh} className="space-y-4">
            <p className="text-sm text-slate-500">
              Format attendu (colonnes : <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">matricule;date_naissance;date_embauche</code>).
              <br />
              Séparez par{' '}
              <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">;</code>{' '}
              ou{' '}
              <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">,</code>.
              <br />
              Dates acceptées : <strong>JJ/MM/AAAA</strong>, <strong>JJ/MM/AA</strong> ou <strong>AAAA-MM-JJ</strong> — années à <strong>2 ou 4 chiffres</strong> (ex. <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">12/11/68</code> → 1968).
            </p>
            <ul className="list-inside list-disc space-y-1 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
              <li>Les fiches existantes sont <strong>complétées par matricule</strong> (aucune création d'employé).</li>
              <li>Un matricule absent de la base est signalé dans le résultat.</li>
              <li>Une cellule de date <strong>vide</strong> efface la valeur (NULL).</li>
            </ul>
            <div>
              <label className="label">Fichier ou collage du texte</label>
              <input
                type="file"
                accept=".csv,.txt"
                className="mb-2 block w-full text-sm text-slate-600 file:me-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-700"
                onChange={(e) => e.target.files[0] && handleRhFile(e.target.files[0])}
              />
              <textarea
                className="input min-h-[140px] font-mono text-xs"
                placeholder={RH_CSV_TEMPLATE}
                value={rhText}
                onChange={(e) => setRhText(e.target.value)}
              />
            </div>
            {rhResult && (
              <div className="rounded-lg bg-slate-50 p-3 text-xs">
                <p className="font-bold text-slate-700">
                  {rhResult.importes} fiche(s) complétée(s) sur {rhResult.total} ligne(s)
                </p>
                {rhResult.nonReconnus && rhResult.nonReconnus.length > 0 && (
                  <p className="mt-1 text-amber-700">
                    Matricules absents de la base ({rhResult.nonReconnus.length}) : {rhResult.nonReconnus.join(', ')}
                  </p>
                )}
                <ul className="mt-1 max-h-32 space-y-0.5 overflow-auto text-slate-500">
                  {rhResult.resultats.filter((r) => r.statut !== 'ok').map((r, i) => (
                    <li key={i}>Ligne {r.ligne} : {r.statut} — {r.message}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setShowImportRh(false)}>Fermer</button>
              <button className="btn-primary" disabled={rhImporting || !rhText.trim()}>
                {rhImporting ? 'Importation…' : 'Importer'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {editTarget && editForm && (
        <Modal onClose={() => setEditTarget(null)} title={`Modifier l'employé — mat. ${editTarget.matricule}`}>
          <form onSubmit={submitEdit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="label">Matricule *</label>
                <input className="input" value={editForm.matricule} onChange={(e) => setEditForm({ ...editForm, matricule: e.target.value })} required />
              </div>
              <div>
                <label className="label">Nom *</label>
                <input className="input" value={editForm.nom} onChange={(e) => setEditForm({ ...editForm, nom: e.target.value })} required />
              </div>
              <div>
                <label className="label">Prénom *</label>
                <input className="input" value={editForm.prenom} onChange={(e) => setEditForm({ ...editForm, prenom: e.target.value })} required />
              </div>
            </div>
            <div>
              <label className="label">Catégorie professionnelle *</label>
              <select className="input" value={editForm.categorie_id} onChange={(e) => setEditForm({ ...editForm, categorie_id: e.target.value })} required>
                <option value="">Sélectionner…</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.libelle}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Département</label>
              <select className="input" value={editForm.departement} onChange={(e) => setEditForm({ ...editForm, departement: e.target.value })}>
                <option value="">—</option>
                <option value="Siège">Siège</option>
                <option value="Comptoir">Comptoir</option>
              </select>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <div>
                <label className="label">Rubrique</label>
                <input className="input" value={editForm.rubrique} onChange={(e) => setEditForm({ ...editForm, rubrique: e.target.value })} placeholder="ex. DIRECTION" />
              </div>
              <div>
                <label className="label">Grade</label>
                <input className="input" value={editForm.grade} onChange={(e) => setEditForm({ ...editForm, grade: e.target.value })} placeholder="ex. CASA" />
              </div>
              <div>
                <label className="label">Classe</label>
                <input className="input" value={editForm.classe} onChange={(e) => setEditForm({ ...editForm, classe: e.target.value })} placeholder="ex. 1" />
              </div>
              <div>
                <label className="label">Echelon</label>
                <input className="input" value={editForm.echelon} onChange={(e) => setEditForm({ ...editForm, echelon: e.target.value })} placeholder="ex. 1" />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={editForm.actif} onChange={(e) => setEditForm({ ...editForm, actif: e.target.checked })} />
              Employé actif (changement de statut)
            </label>
            {editError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{editError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setEditTarget(null)}>Annuler</button>
              <button className="btn-primary" disabled={editSaving}>{editSaving ? 'Enregistrement…' : 'Enregistrer'}</button>
            </div>
          </form>
        </Modal>
      )}

      {delTarget && (
        <Modal onClose={() => setDelTarget(null)} title="Supprimer l'employé" danger>
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              <span className="mt-0.5 shrink-0"><IconAlert /></span>
              <p>
                Vous êtes sur le point de supprimer <strong>{delTarget.nom} {delTarget.prenom}</strong> (mat. {delTarget.matricule}).
                <br />
                <strong>Cette action est irréversible</strong>
                : l'employé et tout son historique seront définitivement supprimés.
              </p>
            </div>
            {delError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{delError}</p>}
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setDelTarget(null)}>Annuler</button>
              <button className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700" disabled={delSaving} onClick={submitDelete}>
                {delSaving ? 'Suppression…' : 'Confirmer la suppression'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, children, onClose, danger }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overscroll-contain bg-slate-900/40 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:p-4" onMouseDown={onClose}>
      <div className="card modal-shell w-full max-w-lg p-4 sm:p-6" onMouseDown={(e) => e.stopPropagation()}>
        <div className={`mb-4 flex items-center justify-between ${danger ? 'text-red-700' : 'text-slate-900'}`}>
          <h3 className="text-base font-bold">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}