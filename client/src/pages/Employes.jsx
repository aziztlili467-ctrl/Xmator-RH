import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api';
import { fmtJours, downloadFile } from '../utils';
import { IconUsers, IconDownload, IconUpload, IconAlert, IconUserCheck, IconTrash, IconCamera } from '../components/icons';
import { ouvrirFluxVideo, arreterFluxVideo, MESSAGES_CAMERA, listerCameras, construireContraintes } from '../utils/camera';

// Dossier public des modèles IA de reconnaissance faciale (téléchargés via `npm run models`)
const MODELS_URL = `${import.meta.env.BASE_URL || '/'}models`;

const CSV_TEMPLATE = 'matricule;nom;prenom;categorie;rubrique;grade;classe;echelon\n46;Tlili;Mohamed Aziz;Cadre administratif;DIRECTION;CASA;1;1';
const RH_CSV_TEMPLATE = 'matricule;date_naissance;date_embauche\n46;01/02/1980;02/03/2005';

// Valeurs identiques à celles de la fiche signalétique (FicheCreation) : la sauvegarde ici
// remplit automatiquement la case « Situation familiale » de la fiche de chaque employé.
const SITUATIONS_FAMILIALES = ['Célibataire', 'Marié(e)', 'Divorcé(e)', 'Veuf(ve)'];

// Salaire de base issu de la Grille de salaire (Rubrique / Grade / Classe / Echelon), saisi en DT
const fmtSalaireBase = (v) => {
  if (v == null || String(v).trim() === '') return '—';
  return Number(v).toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
};

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
  const [catSavingId, setCatSavingId] = useState(null);
  const [chefSavingId, setChefSavingId] = useState(null);
  const [enfantsSavingId, setEnfantsSavingId] = useState(null);
  const [sitSavingId, setSitSavingId] = useState(null);

  const [visageTarget, setVisageTarget] = useState(null);

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

  const saveCategorie = (e) => {
    const value = e.target.value;
    if (value === e.currentTarget.dataset.okval) return;
    setCatSavingId(e.currentTarget.dataset.id);
    api.updateEmploye(Number(e.currentTarget.dataset.id), { categorie_id: Number(value) })
      .then(() => { setSuccess('Catégorie mise à jour (synchronisée dans toutes les vues).'); load(); })
      .catch((err) => setError(err.message))
      .finally(() => setCatSavingId(null));
  };

  const saveChefFamille = (e) => {
    const value = e.target.value;
    if (value === e.currentTarget.dataset.okval) return;
    setChefSavingId(e.currentTarget.dataset.id);
    api.updateEmploye(Number(e.currentTarget.dataset.id), { chef_famille: value })
      .then(() => { setSuccess('Chef de famille mis à jour.'); load(); })
      .catch((err) => setError(err.message))
      .finally(() => setChefSavingId(null));
  };

  const saveEnfantsCharge = (e) => {
    const value = e.target.value;
    if (value === e.currentTarget.dataset.okval) return;
    setEnfantsSavingId(e.currentTarget.dataset.id);
    api.updateEmploye(Number(e.currentTarget.dataset.id), { enfants_a_charge: Number(value) })
      .then(() => { setSuccess("Enfants à charge mis à jour."); load(); })
      .catch((err) => setError(err.message))
      .finally(() => setEnfantsSavingId(null));
  };

  const saveSituationFamille = (e) => {
    const value = e.target.value;
    if (value === e.currentTarget.dataset.okval) return;
    setSitSavingId(e.currentTarget.dataset.id);
    api.updateEmploye(Number(e.currentTarget.dataset.id), { situation_familiale: value })
      .then(() => { setSuccess('Situation familiale mise à jour (synchronisée dans les fiches signalétiques).'); load(); })
      .catch((err) => setError(err.message))
      .finally(() => setSitSavingId(null));
  };

  // « Chef de famille » / « Enfants à charge » figés pour un(e) célibataire : aucune liste
  // déroulante, la colonne redevient active dès qu'une autre situation est sélectionnée.
  const celibataire = (e) => String(e.situation_familiale || '') === 'Célibataire';

  // Liste déroulante des catégories de la ligne : garantit que la catégorie actuelle reste
  // sélectionnable même si elle n'existe plus dans le paramétrage (repli « Inconnue »).
  const categorieOptions = (e) => {
    const opts = [...categories];
    if (e.categorie_id != null && !opts.some((c) => c.id === e.categorie_id)) {
      opts.push({ id: e.categorie_id, libelle: e.categorie || 'Inconnue' });
    }
    return opts;
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
      if (sortKey === 'salaire_base') { va = Number(a.salaire_base || 0); vb = Number(b.salaire_base || 0); }
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
          <h2 className="text-lg font-bold text-slate-900">EMPLOYÉS</h2>
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
                <Th label="Situation familiale" k="situation_familiale" />
                <Th label="Chef de famille" k="chef_famille" />
                <Th label="Enfants à charge" k="enfants_a_charge" />
                <Th label="Catégorie" k="categorie" />
                <Th label="Rubrique" k="rubrique" />
                <Th label="Grade" k="grade" />
                <Th label="Classe" k="classe" />
                <Th label="Echelon" k="echelon" />
                <Th label="Salaire de base" k="salaire_base" />
                <th className="px-3 py-3 font-semibold uppercase tracking-wide text-slate-500">Visage</th>
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
                  <td className="px-3 py-3 text-xs text-slate-600">
                    <select
                      data-id={e.id}
                      data-okval={e.situation_familiale || ''}
                      value={e.situation_familiale || ''}
                      onChange={saveSituationFamille}
                      disabled={sitSavingId === e.id}
                      className="input w-36 cursor-pointer px-2 py-1.5 text-xs"
                      title={`Situation familiale — ${e.nom} ${e.prenom} (enregistrée directement, synchronisée avec la fiche signalétique)`}
                    >
                      <option value="">—</option>
                      {SITUATIONS_FAMILIALES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-3 text-xs text-slate-600">
                    {celibataire(e) ? (
                      <span className="inline-block w-24 px-2 py-1.5 text-center font-medium text-slate-400" title="Colonne figée : situation civile Célibataire">
                        —
                      </span>
                    ) : (
                      <select
                        data-id={e.id}
                        data-okval={e.chef_famille || ''}
                        value={e.chef_famille || ''}
                        onChange={saveChefFamille}
                        disabled={chefSavingId === e.id}
                        className="input w-24 cursor-pointer px-2 py-1.5 text-xs"
                        title={`Chef de famille — ${e.nom} ${e.prenom} (enregistré directement)`}
                      >
                        <option value="">—</option>
                        <option value="OUI">OUI</option>
                        <option value="NON">NON</option>
                      </select>
                    )}
                  </td>
                  <td className="px-3 py-3 text-xs text-slate-600">
                    {celibataire(e) ? (
                      <span className="inline-block w-24 px-2 py-1.5 text-center font-medium text-slate-400" title="Colonne figée : situation civile Célibataire">
                        —
                      </span>
                    ) : (
                      <select
                        data-id={e.id}
                        data-okval={e.enfants_a_charge ?? ''}
                        value={e.enfants_a_charge ?? ''}
                        onChange={saveEnfantsCharge}
                        disabled={enfantsSavingId === e.id}
                        className="input w-24 cursor-pointer px-2 py-1.5 text-xs"
                        title={`Nombre d'enfants à charge — ${e.nom} ${e.prenom} (enregistré directement)`}
                      >
                        <option value="">—</option>
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <select
                      data-id={e.id}
                      data-okval={e.categorie_id}
                      value={e.categorie_id ?? ''}
                      onChange={saveCategorie}
                      disabled={catSavingId === e.id}
                      className="input w-44 cursor-pointer px-2 py-1.5 text-xs"
                      title={`Catégorie de ${e.nom} ${e.prenom} — enregistrée directement`}
                    >
                      {categorieOptions(e).map((c) => (
                        <option key={c.id} value={c.id}>{c.libelle}</option>
                      ))}
                    </select>
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
                  <td className="px-3 py-3 text-end font-mono text-xs tabular text-slate-700" title={`Salaire de base de ${e.nom} ${e.prenom} (grille de salaire)`}>
                    {fmtSalaireBase(e.salaire_base)}
                  </td>
                  <td className="px-3 py-3">
                    <button
                      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold hover:bg-brand-50 ${e.has_face ? 'text-emerald-700' : 'text-brand-700'}`}
                      onClick={() => { setError(''); setVisageTarget(e); }}
                      title={e.has_face ? 'Modifier la signature faciale enrôlée (Xmator-Eye)' : 'Enrôler la signature faciale (Xmator-Eye)'}
                    >
                      <span className={`h-2 w-2 shrink-0 rounded-full ${e.has_face ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                      <IconUserCheck />
                      {e.has_face ? 'Modifier' : 'Enrôler'} visage
                    </button>
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
                <tr><td colSpan={14} className="px-5 py-10 text-center text-slate-500">Aucun employé trouvé.</td></tr>
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
{visageTarget && (
        <EnrolerVisage
          emp={visageTarget}
          onClose={() => setVisageTarget(null)}
          onChangement={() => load()}
        />
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

// Seuils de la preuve de vie (liveness) : clignement des yeux (EAR) et/ou sourire (expression happy)
const SEUIL_OEIL_FERME = 0.22;
const SEUIL_SOURIRE = 0.4;

// Ratio d'aspect de l'œil (Eye Aspect Ratio) — modèle 68 points (face-api) : œil gauche 36-41,
// œil droit 42-47. EAR bas => paupières fermées ; un cycle fermé → ouvert compte un clignement.
function earOeil(p, debut) {
  const d = (i, j) => {
    const a = p[debut + i];
    const b = p[debut + j];
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  };
  const v1 = d(1, 5);
  const v2 = d(2, 4);
  const h = d(0, 3);
  if (h < 1e-6) return 1;
  return (v1 + v2) / (2 * h);
}

function earMoyen(landmarks) {
  return (earOeil(landmarks, 36) + earOeil(landmarks, 42)) / 2;
}

// Enrôlement facial (Xmator-Eye) : capture « Caméra en direct » en plein écran (object-fit: cover,
// sans bandes noires sur mobile) avec bascule frontale/arrière et preuve de vie (clignement/sourire),
// + import d'une photo. Jusqu'à 2 empreintes par employé : A « sans lunettes » et B « avec lunettes ».
function EnrolerVisage({ emp, onClose, onChangement }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const trameRef = useRef(null);
  const photoInputRef = useRef(null);
  const [mode, setMode] = useState('cam'); // cam | photo
  const [etape, setEtape] = useState('chargement'); // chargement | prêt | erreur
  const [message, setMessage] = useState('');
  const [erreur, setErreur] = useState('');
  const [detecte, setDetecte] = useState(false);
  const [vivant, setVivant] = useState(false);
  const [capture, setCapture] = useState(null); // { dataUrl, descriptor }
  const [photo, setPhoto] = useState(null); // { dataUrl, nom }
  const [photoResult, setPhotoResult] = useState(null); // { descriptor, detecte, score }
  const [analysePhoto, setAnalysePhoto] = useState(false);
  const [sauvegarde, setSauvegarde] = useState(false);
  const [confirmerRetrait, setConfirmerRetrait] = useState(false);
  const [camFace, setCamFace] = useState('user');
  const [etatFace, setEtatFace] = useState({ a: !!emp.has_face, aLe: null, b: false, bLe: null });

  const dejaEnrole = (etatFace.a || etatFace.b) || !!emp.has_face;

  const faceapiRef = useRef(null);
  const faceRef = useRef(null);
  const stopRef = useRef(false);
  const timerRef = useRef(null);
  const loopRef = useRef(null);
  const captureRef = useRef(null);
  const blinksRef = useRef(0);
  const paupiereFermeeRef = useRef(false);
  const sourireRef = useRef(false);
  const camsRef = useRef([]);
  const camIndexRef = useRef(0);

  // État facial existant (empreintes A / B) au chargement de la modale.
  useEffect(() => {
    let mort = false;
    api.faceEmploye(emp.id)
      .then((r) => {
        if (mort) return;
        setEtatFace({
          a: !!r.enrole,
          aLe: r.enrole_le || null,
          b: !!r.enrole_b,
          bLe: r.enrole_le_b || null,
        });
      })
      .catch(() => { /* offline : on garde `emp.has_face` comme indication */ });
    return () => { mort = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emp.id]);

  // === Fonctions partagées (mode « Caméra en direct ») ===
  const dessiner = (video, result, echelle = 1) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const b = result.detection.box;
    ctx.strokeStyle = '#22ff88';
    ctx.lineWidth = 3;
    ctx.strokeRect(b.x * echelle, b.y * echelle, b.width * echelle, b.height * echelle);
    ctx.fillStyle = 'rgba(34,255,136,0.85)';
    for (const p of result.landmarks.positions) ctx.fillRect(p.x * echelle - 1.5, p.y * echelle - 1.5, 3, 3);
  };

  const effacer = () => {
    const canvas = canvasRef.current;
    const ctx = canvas && canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const boucle = async () => {
    if (stopRef.current || captureRef.current) return;
    const fapi = faceapiRef.current;
    const video = videoRef.current;
    // Modèles pas encore prêts : on garde le flux live et on re-polle (la détection se
    // branche dès que les poids IA sont chargés — ne pas réarmer tuerait la boucle).
    if (!fapi || !video) {
      if (!stopRef.current) timerRef.current = setTimeout(boucle, 200);
      return;
    }
    try {
      const opts = new fapi.SsdMobilenetv1Options({ minConfidence: 0.5 });
      // Entrée de détection allégée (largeur max 480) : les nets internes (ssd 300,
      // recognition 112) n'ont pas besoin du 1280 p → la charge CPU chute et le fil
      // principal reste libre, c'est ce qui rend l'aperçu réellement LIVE.
      const vw = video.videoWidth || 0;
      if (!vw) {
        if (!stopRef.current) timerRef.current = setTimeout(boucle, 150);
        return;
      }
      const tc = trameRef.current || (trameRef.current = document.createElement('canvas'));
      const echelle = Math.min(1, 480 / vw);
      tc.width = Math.max(1, Math.round(vw * echelle));
      tc.height = Math.max(1, Math.round((video.videoHeight || 0) * echelle));
      tc.getContext('2d').drawImage(video, 0, 0, tc.width, tc.height);
      const r = await fapi.detectSingleFace(tc, opts)
        .withFaceLandmarks()
        .withFaceDescriptor()
        .withFaceExpressions();
      if (stopRef.current || captureRef.current) return;
      if (r) {
        // Liveness : clignement (EAR) et/ou sourire (expression happy).
        const ear = earMoyen(r.landmarks.positions);
        if (ear < SEUIL_OEIL_FERME) {
          paupiereFermeeRef.current = true;
        } else if (paupiereFermeeRef.current) {
          paupiereFermeeRef.current = false;
          blinksRef.current += 1;
        }
        const happy = (r.expressions && r.expressions.happy) || 0;
        sourireRef.current = happy >= SEUIL_SOURIRE;
        setVivant(blinksRef.current >= 1 || sourireRef.current);
        faceRef.current = Array.from(r.descriptor);
        setDetecte(true);
        dessiner(video, r, vw / tc.width);
      } else {
        blinksRef.current = 0;
        paupiereFermeeRef.current = false;
        sourireRef.current = false;
        setVivant(false);
        faceRef.current = null;
        setDetecte(false);
        effacer();
      }
    } catch {
      timerRef.current = setTimeout(boucle, 250);
      return;
    }
    timerRef.current = setTimeout(boucle, 100);
  };

  useEffect(() => {
    loopRef.current = boucle;
  });

  useEffect(() => {
    let annule = false;
    // StrictMode (dev) rejoue cet effet : on réarme l'état pour que la boucle de
    // détection démarre réellement sur l'instance montée.
    stopRef.current = false;
    captureRef.current = null;

    const chargerModeles = async () => {
      try {
        const mod = await import('@vladmandic/face-api');
        if (annule) return;
        faceapiRef.current = mod;
        // Initialise le backend tfjs (webgl si disponible, sinon wasm/cpu) AVANT tout
        // chargement de poids : sans `await tf.ready()`, tfjs lève
        // « The highest priority backend ... has not yet been initialized ».
        if (mod.tf && typeof mod.tf.ready === 'function') {
          try {
            await mod.tf.ready();
          } catch {
            try { await mod.tf.setBackend('cpu'); } catch {}
          }
        }
        await mod.nets.ssdMobilenetv1.loadFromUri(MODELS_URL);
        await mod.nets.faceLandmark68Net.loadFromUri(MODELS_URL);
        await mod.nets.faceRecognitionNet.loadFromUri(MODELS_URL);
        await mod.nets.faceExpressionNet.loadFromUri(MODELS_URL);
        if (annule) return;
        setEtape('prêt');
      } catch (e) {
        if (annule) return;
        stopRef.current = true;
        setEtape('erreur');
        setErreur(e && e.message ? e.message : String(e));
      }
    };

    chargerModeles();
    return () => { annule = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Démarrage / arrêt de la caméra selon l'onglet actif (mode 'cam' uniquement).
  // La caméra démarre IMMÉDIATEMENT, en parallèle du chargement des modèles IA (mode live réel) :
  // la détection s'active d'elle-même quand les poids sont prêts (voir boucle).
  useEffect(() => {
    if (mode !== 'cam') return;
    let annule = false;
    let stream = null;
    stopRef.current = false;
    captureRef.current = null;
    blinksRef.current = 0;
    paupiereFermeeRef.current = false;
    sourireRef.current = false;
    setVivant(false);

    const demarrerCamera = async () => {
      try {
        stream = await ouvrirFluxVideo(construireContraintes('user'));
        try { camsRef.current = await listerCameras(); } catch { camsRef.current = []; }
        if (annule) { if (stream) stream.getTracks().forEach((t) => t.stop()); return; }
        const video = videoRef.current;
        if (!video) { stream.getTracks().forEach((t) => t.stop()); return; }
        video.srcObject = stream;
        // Conduit en tâche de fond : le flux devient live aussitôt (element autoplay/muted),
        // on ne bloque plus la boucle de détection derrière video.play().
        const p = video.play();
        if (p && p.catch) p.catch(() => {});
        timerRef.current = setTimeout(boucle, 60);
      } catch (e) {
        if (annule) return;
        setErreur(e && e.code === 'permission'
          ? `${MESSAGES_CAMERA.permission} Vous pouvez aussi utiliser l'onglet « Importer une photo ».`
          : (e && e.code === 'aucune' ? `${MESSAGES_CAMERA.aucune} Vous pouvez aussi utiliser l'onglet « Importer une photo ».`
            : (e && e.message ? `${e.message} Vous pouvez aussi utiliser l'onglet « Importer une photo ».` : MESSAGES_CAMERA.indisponible)));
      }
    };

    demarrerCamera();
    return () => {
      annule = true;
      stopRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      effacer();
      arreterFluxVideo(videoRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Bascule de caméra (frontale / arrière / USB) — conçue pour fonctionner sur tous les
  // navigateurs mobiles et PC :
  //   1) Libère l'ancien flux AVANT de demander la nouvelle (indispensable sur iOS Safari,
  //      sinon getUserMedia renvoie la même caméra ou lève NotReadableError) ;
  //   2) Essaie le flip facingMode pur (sans résolution), puis avec résolution idéale (certains
  //      webviews Android jettent OverconstrainedError quand les deux sont combinés) ;
  //   3) En repli, cycle les caméras énumérées via enumerateDevices (PC webcam USB) ;
  //   4) Si tout échoue, restaure l'ancienne caméra et affiche un message clair.
  const basculerCam = async () => {
    if (captureRef.current) return;
    const video = videoRef.current;
    if (!video) return;
    const cams = Array.isArray(camsRef.current) ? camsRef.current : [];
    const faceFlip = camFace === 'user' ? 'environment' : 'user';
    const faceRegex = /back|rear|arri|post|backup|0$/i;

    // Attache un flux sur la balise <video> EN DIRECT, sans attendre play() ni rebuild de
    // pipeline (video.load() coûtait plusieurs secondes) : l'élément est autoplay/muted donc
    // le flux devient live immédiat, la détection suit dès les premières images.
    const attacherFlux = (stream) => {
      try {
        video.srcObject = stream;
        const p = video.play();
        if (p && p.catch) p.catch(() => {});
        return true;
      } catch {}
      try { if (stream && stream.getTracks) stream.getTracks().forEach((t) => t.stop()); } catch {}
      return false;
    };

    // Candidats par ordre de fiabilité croissante.
    const faceCandidateBase = { audio: false };
    const candidates = [
      { ...faceCandidateBase, video: { facingMode: faceFlip } },
      { ...faceCandidateBase, video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: faceFlip } },
    ];
    for (let k = 1; k <= Math.max(cams.length, 1); k += 1) {
      const cam = cams.length ? cams[(camIndexRef.current + k) % cams.length] : null;
      if (!cam || !cam.deviceId) continue;
      const face = faceRegex.test(cam.label || '') ? 'environment' : 'user';
      candidates.push({ ...faceCandidateBase, video: { facingMode: face, deviceId: { exact: cam.deviceId } } });
      candidates.push({ ...faceCandidateBase, video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: face, deviceId: { exact: cam.deviceId } } });
    }

    // Étape 1 : libère l'ancien flux d'abord (paramètre indispensable pour iOS Safari).
    const ancienFlux = video.srcObject;
    if (ancienFlux && typeof ancienFlux.getTracks === 'function') {
      ancienFlux.getTracks().forEach((t) => { try { t.stop(); } catch {} });
    }
    try { video.srcObject = null; } catch {}

    // Étapes 2→3 : essaie les candidats jusqu'au premier flux qui se monte.
    let applique = null;
    for (const contraintesVideo of candidates) {
      let flux;
      try { flux = await ouvrirFluxVideo(contraintesVideo); } catch { continue; }
      if (await attacherFlux(flux)) { applique = contraintesVideo.video.facingMode || faceFlip; break; }
    }

    // Étape 4 : échec total → restaure l'ancienne caméra pour ne pas laisser un écran noir.
    if (!applique) {
      try { await attacherFlux(await ouvrirFluxVideo({ video: { facingMode: camFace }, audio: false })); } catch {}
      setErreur('Impossible de basculer de caméra sur cet appareil. La caméra active est conservée.');
      return;
    }

    // Nouvelle caméra → on repart d'un état de détection propre.
    stopRef.current = false;
    blinksRef.current = 0;
    paupiereFermeeRef.current = false;
    sourireRef.current = false;
    setVivant(false);
    setDetecte(false);
    setErreur('');
    setCamFace(applique === 'environment' ? 'environment' : 'user');
    effacer();
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(loopRef.current, 60);
  };

  const capturer = () => {
    const d = faceRef.current;
    if (!d || d.length !== 128) {
      setMessage('');
      setErreur('Aucun visage détecté correctement. Restez face à la caméra dans de bonnes conditions de lumière.');
      return;
    }
    setErreur('');
    const video = videoRef.current;
    const cv = document.createElement('canvas');
    cv.width = video.videoWidth || 640;
    cv.height = video.videoHeight || 480;
    cv.getContext('2d').drawImage(video, 0, 0, cv.width, cv.height);
    const cap = { dataUrl: cv.toDataURL('image/jpeg', 0.85), descriptor: d };
    captureRef.current = cap;
    setCapture(cap);
  };

  const reprendre = () => {
    captureRef.current = null;
    setCapture(null);
    setErreur('');
    blinksRef.current = 0;
    paupiereFermeeRef.current = false;
    sourireRef.current = false;
    setVivant(false);
    timerRef.current = setTimeout(loopRef.current, 60);
  };

  // Enregistre l'empreinte A (sans lunettes) ou B (avec lunettes) du candidat courant.
  const enregistrer = async (repertoire = 'a') => {
    const d = capture ? capture.descriptor : (photoResult && photoResult.descriptor);
    if (!d || d.length !== 128) {
      setErreur('Aucun visage analysé. Capturez ou importez d\'abord un visage correctement.');
      return;
    }
    setSauvegarde(true);
    setErreur('');
    try {
      await api.sauvegarderFace(emp.id, d, repertoire);
      const horo = new Date().toISOString();
      setEtatFace((s) => (repertoire === 'b' ? { ...s, b: true, bLe: horo } : { ...s, a: true, aLe: horo }));
      setConfirmerRetrait(false);
      setMessage(`${repertoire === 'b' ? 'Empreinte B — avec lunettes' : 'Empreinte A — sans lunettes'} enregistrée pour la reconnaissance de pointage (Xmator-Eye).`);
      setCapture(null);
      captureRef.current = null;
      setPhotoResult(null);
      if (onChangement) onChangement();
    } catch (e) {
      setErreur(e.message);
    } finally {
      setSauvegarde(false);
    }
  };

  const analyserPhoto = async (dataUrl) => {
    const fapi = faceapiRef.current;
    if (!fapi) {
      setErreur('Modèles IA non chargés. Fermez puis rouvrez la modale.');
      return;
    }
    setAnalysePhoto(true);
    setMessage('');
    setErreur('');
    try {
      const img = new Image();
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = () => rej(new Error('Chargement de l’image impossible.'));
        img.src = dataUrl;
      });
      const opts = new fapi.SsdMobilenetv1Options({ minConfidence: 0.5 });
      const r = await fapi.detectSingleFace(img, opts).withFaceLandmarks().withFaceDescriptor();
      setPhotoResult(r
        ? { descriptor: Array.from(r.descriptor), detecte: true, score: r.detection.score }
        : { descriptor: null, detecte: false, score: 0 });
    } catch (e) {
      setPhotoResult({ descriptor: null, detecte: false, score: 0 });
      setErreur(e && e.message ? e.message : String(e));
    } finally {
      setAnalysePhoto(false);
    }
  };

  const importerPhoto = (e) => {
    const fichier = e.target && e.target.files && e.target.files[0];
    e.target.value = '';
    if (!fichier) return;
    if (!fichier.type || !fichier.type.startsWith('image/')) {
      setPhoto(null);
      setPhotoResult(null);
      setMessage('');
      setErreur('Format non pris en charge : importez une photo JPG ou PNG.');
      return;
    }
    const lecteur = new FileReader();
    lecteur.onerror = () => setErreur('Lecture du fichier impossible.');
    lecteur.onload = () => {
      const dataUrl = lecteur.result;
      setPhoto({ dataUrl, nom: fichier.name });
      setPhotoResult(null);
      analyserPhoto(dataUrl);
    };
    lecteur.readAsDataURL(fichier);
  };

  const retirer = async () => {
    setSauvegarde(true);
    setErreur('');
    try {
      await api.supprimerFace(emp.id);
      setEtatFace({ a: false, aLe: null, b: false, bLe: null });
      setConfirmerRetrait(false);
      setMessage('Enrôlement facial supprimé (Xmator-Eye).');
      if (onChangement) onChangement();
    } catch (e) {
      setErreur(e.message);
    } finally {
      setSauvegarde(false);
    }
  };

  const enSuspens = (mode === 'cam' && !!capture) || (mode === 'photo' && !!(photoResult && photoResult.detecte));

  // ---- CAMÉRA PLEIN ÉCRAN (mobile & desktop) : object-fit cover, aucune bande noire ----
  // S'affiche immédiatement (mode live réel) ; les modèles IA se chargent en arrière-plan.
  if (mode === 'cam' && etape !== 'erreur') {
    return (
      <div className="fixed inset-0 z-[70] overflow-hidden bg-black text-white">
        <video ref={videoRef} muted playsInline autoPlay className="absolute inset-0 h-full w-full object-cover opacity-95" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-black/70" />
        <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />

        {/* BARRE HAUTE — retour / flip caméra */}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <button
            type="button"
            onClick={() => setMode('photo')}
            className="rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-xs font-bold text-white/90 backdrop-blur-md transition hover:bg-black/60"
          >
            ◁ Importer une photo
          </button>
          <p className="rounded-full border border-white/15 bg-black/40 px-4 py-1.5 text-center text-[11px] font-black uppercase tracking-[0.2em] text-white/90 backdrop-blur-md">
            {camFace === 'environment' ? 'Caméra arrière' : 'Caméra frontale'} · Enrôlement
          </p>
          <button
            type="button"
            onClick={basculerCam}
            title="Changer de caméra (frontale / arrière / USB)"
            aria-label="Changer de caméra"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-black/40 text-white backdrop-blur-md transition hover:rotate-180 hover:bg-black/60"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 4v6h-6M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>
        </div>

        {/* JAUGE DU VIVANT + messages */}
        <div className="absolute left-1/2 top-[max(4.25rem,calc(env(safe-area-inset-top)+60px))] flex -translate-x-1/2 flex-col items-center gap-2 text-center">
          <span
            className={`rounded-full px-3.5 py-1.5 text-[11px] font-black uppercase tracking-widest backdrop-blur-md transition-all duration-300 ${
              vivant ? 'bg-emerald-500/95 text-emerald-950 shadow-[0_0_18px_rgba(34,255,136,0.9)]' : 'border border-white/15 bg-black/40 text-white/70'
            }`}
          >
            {vivant ? '✓ Preuve de vie détectée' : '👁 Clignez des yeux ou souriez'}
          </span>
          {etape !== 'prêt' && (
            <span className="rounded-full bg-amber-400/25 px-3.5 py-1.5 text-[11px] font-bold text-amber-200 ring-1 ring-amber-300/40 backdrop-blur-md">
              ⏳ Préparation de la détection IA…
            </span>
          )}
          {message && (
            <span className="rounded-full bg-emerald-500/25 px-3.5 py-1.5 text-[11px] font-bold text-emerald-200 ring-1 ring-emerald-300/40 backdrop-blur-md">
              {message}
            </span>
          )}
          {erreur && etape !== 'erreur' && (
            <span className="max-w-[90%] rounded-xl bg-red-600/30 px-3.5 py-1.5 text-[11px] font-bold text-red-100 ring-1 ring-red-400/40 backdrop-blur-md">
              {erreur}
            </span>
          )}
          {!capture && etatFace.a && !etatFace.b && (
            <span className="rounded-full bg-amber-400/25 px-3.5 py-1.5 text-[11px] font-bold text-amber-200 ring-1 ring-amber-300/40 backdrop-blur-md">
              💡 Ajoutez l'empreinte B — capturée avec lunettes — pour la reconnaissance avec/sans lunettes
            </span>
          )}
        </div>

        {/* CADRE OVALE DE GUIDAGE + coins lumineux (statique) */}
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
          style={{
            width: 'min(72vw, 420px)',
            height: 'min(46vh, 540px)',
            borderColor: vivant ? '#22ff8866' : (detecte ? '#fbbf2466' : '#ef44446b'),
            boxShadow: `0 0 40px ${vivant ? '#22ff8840' : detecte ? '#fbbf2440' : '#ef444430'}, inset 0 0 28px ${vivant ? '#22ff8822' : detecte ? '#fbbf2422' : '#ef444412'}`,
            transition: 'border-color .3s ease, box-shadow .3s ease',
          }}
        >
          {[
            { l: -4, t: -4, bt: true, bl: true, radius: 'border-tl' },
            { r: -4, t: -4, bt: true, br: true, radius: 'border-tr' },
            { l: -4, b: -4, bb: true, bl: true, radius: 'border-bl' },
            { r: -4, b: -4, bb: true, br: true, radius: 'border-br' },
          ].map((c, i) => (
            <span
              key={i}
              className={`absolute h-12 w-12 ${c.radius} rounded-full border-4 ${c.bt ? 'border-t' : ''} ${c.bl ? 'border-l' : ''} ${c.br ? 'border-r' : ''} ${c.bb ? 'border-b' : ''} border-white`}
              style={{
                left: c.l, top: c.t, right: c.r, bottom: c.b,
                borderColor: vivant ? '#22ff88' : (detecte ? '#fbbf24' : '#ef4444'),
                filter: `drop-shadow(0 0 8px ${vivant ? '#22ff88' : detecte ? '#fbbf24' : '#ef4444'})`,
              }}
            />
          ))}
        </div>

        {/* BADGES EMPREINTES A / B */}
        <div className="absolute left-1/2 top-[32%] flex -translate-x-1/2 gap-2">
          <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest backdrop-blur-md ${etatFace.a ? 'bg-emerald-500/90 text-emerald-950' : 'border border-white/20 bg-black/40 text-white/60'}`}>
            A · sans lunettes {etatFace.a ? '✔' : '—'}
          </span>
          <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest backdrop-blur-md ${etatFace.b ? 'bg-emerald-500/90 text-emerald-950' : 'border border-white/20 bg-black/40 text-white/60'}`}>
            B · avec lunettes {etatFace.b ? '✔' : '—'}
          </span>
        </div>

        {/* PANNEAU BAS — capture / vérification + enregistrement A/B */}
        <div className="absolute inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] px-4 pb-2">
          {capture && (
            <div className="mx-auto flex w-full max-w-xl items-center gap-3 rounded-2xl border border-white/15 bg-black/50 p-3 backdrop-blur-xl">
              <img src={capture.dataUrl} alt="Visage capturé" className="h-20 w-auto shrink-0 rounded-xl object-cover ring-1 ring-white/30" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-white">Signature prête à enregistrer</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button type="button" className="btn-primary !px-3 !py-1.5 text-xs" onClick={() => enregistrer('a')} disabled={sauvegarde}>
                    {sauvegarde ? '…' : '✚ A — sans lunettes'}
                  </button>
                  <button type="button" className="btn-secondary !px-3 !py-1.5 text-xs" onClick={() => enregistrer('b')} disabled={sauvegarde}>
                    {sauvegarde ? '…' : '✚ B — avec lunettes'}
                  </button>
                  <button type="button" className="rounded-xl px-2.5 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10" onClick={reprendre} disabled={sauvegarde}>
                    Reprendre
                  </button>
                  <button type="button" onClick={onClose} className="rounded-xl px-2.5 py-1.5 text-xs font-semibold text-white/50 hover:text-white">
                    ✕ Fermer sans enregistrer
                  </button>
                </div>
              </div>
            </div>
          )}

          {!capture && (
            <div className="mx-auto flex w-full max-w-xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="rounded-2xl border border-white/15 bg-black/50 px-4 py-3 text-left backdrop-blur-xl sm:flex-1">
                <p className="text-sm font-bold text-white">
                  {detecte ? (vivant ? 'Visage détecté + preuve de vie ✔' : 'Visage détecté — prouvez que vous êtes vivant') : 'Placez le visage dans le cadre ovale'}
                </p>
                <p className="mt-0.5 text-[11px] text-white/60">Clignez des yeux ou souriez, puis l'enrôlement se valide en quelques secondes.</p>
              </div>
              <button type="button" className="btn-primary shrink-0 !px-5 !py-3 text-sm" onClick={capturer} disabled={!detecte || !vivant || sauvegarde}>
                Capturer la signature
              </button>
            </div>
          )}

          {!capture && (
            <p className="mt-2 text-center text-[11px] text-white/50">
              mat. {emp.matricule} — {emp.nom} {emp.prenom}
              {confirmerRetrait ? (
                <span className="ml-1 inline-flex items-center gap-2">
                  Retirer toutes les signatures ?
                  <button className="rounded-lg bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white" onClick={retirer} disabled={sauvegarde}>Confirmer</button>
                  <button className="text-white/70 hover:text-white" onClick={() => setConfirmerRetrait(false)}>Annuler</button>
                </span>
              ) : dejaEnrole ? (
                <button className="ml-2 font-bold text-red-300 hover:text-red-200" onClick={() => setConfirmerRetrait(true)}>Retirer l'enrôlement</button>
              ) : null}
            </p>
          )}

          {!capture && (
            <p className="mt-1 text-center">
              <button type="button" onClick={onClose} className="text-xs font-semibold text-white/60 hover:text-white">✕ Fermer</button>
            </p>
          )}
        </div>
      </div>
    );
  }

  // ---- MODALE « CLASSIQUE » : chargement, erreur et import d'une photo ----
  return (
    <Modal onClose={onClose} title={`Signature faciale — mat. ${emp.matricule} — ${emp.nom} ${emp.prenom}`}>
      <div className="space-y-4">
        {etape === 'erreur' && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">
            <p className="font-semibold">Caméra ou modèles IA indisponibles.</p>
            <p className="mt-1">{erreur}</p>
            <p className="mt-2 text-xs text-red-500">
              Vérifiez que les modèles sont présents (<code className="rounded bg-red-100 px-1">npm run models</code>) et autorisez
              la caméra (HTTPS requis hors localhost).
            </p>
            <div className="mt-3 flex justify-end">
              <button type="button" className="btn-secondary" onClick={onClose}>Fermer</button>
            </div>
          </div>
        )}

        {etape === 'chargement' && (
          <div className="flex h-56 items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-500">
            Chargement des modèles IA…
          </div>
        )}

        {etape === 'prêt' && (
          <div className="flex rounded-lg bg-slate-100 p-1 text-sm font-medium text-slate-600">
            <button
              type="button"
              onClick={() => setMode('cam')}
              className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 transition-colors ${mode === 'cam' ? 'bg-white text-slate-900 shadow-sm' : 'hover:text-slate-900'}`}
            >
              <IconCamera className="h-4 w-4 shrink-0" />
              Caméra en direct
            </button>
            <button
              type="button"
              onClick={() => setMode('photo')}
              className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 transition-colors ${mode === 'photo' ? 'bg-white text-slate-900 shadow-sm' : 'hover:text-slate-900'}`}
            >
              <IconUpload className="h-4 w-4 shrink-0" />
              Importer une photo
            </button>
          </div>
        )}

        {etape === 'prêt' && mode === 'photo' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                <IconUpload className="h-4 w-4" />
                {photo ? 'Choisir une autre photo' : 'Choisir une photo'}
                <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={importerPhoto} />
              </label>
              {photo && <span className="max-w-[16rem] truncate text-xs text-slate-500">{photo.nom}</span>}
            </div>
            <p className="text-xs text-slate-500">
              Formats JPG/PNG. Le visage est détecté automatiquement, puis la signature faciale (128 valeurs) est extraite de la photo.
            </p>

            {photo && (
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <img src={photo.dataUrl} alt="Photo importée" className="mx-auto max-h-56" />
              </div>
            )}

            {analysePhoto && <p className="text-xs text-slate-500">Analyse de la photo…</p>}

            {photo && !analysePhoto && photoResult && (
              photoResult.detecte ? (
                <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                  Visage détecté avec succès (confiance {Math.round(photoResult.score * 100)} %). Vous pouvez enregistrer la signature.
                </p>
              ) : (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700 ring-1 ring-red-200">
                  Aucun visage détecté sur l’image. Importez une autre photo avec un visage net et bien éclairé.
                </p>
              )
            )}

            {photo && !analysePhoto && photoResult && photoResult.detecte && (
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button type="button" className="btn-primary" onClick={() => enregistrer('a')} disabled={sauvegarde}>
                  {sauvegarde ? 'Enregistrement…' : 'Enregistrer — sans lunettes (A)'}
                </button>
                <button type="button" className="btn-secondary" onClick={() => enregistrer('b')} disabled={sauvegarde}>
                  {sauvegarde ? '…' : 'Enregistrer — avec lunettes (B)'}
                </button>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 ring-1 ring-slate-100">
              <span className={`rounded-full px-2 py-0.5 font-bold ${etatFace.a ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                A · sans lunettes {etatFace.a ? '✔' : '—'}
              </span>
              <span className={`rounded-full px-2 py-0.5 font-bold ${etatFace.b ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                B · avec lunettes {etatFace.b ? '✔' : '—'}
              </span>
            </div>
          </div>
        )}

        {etape === 'prêt' && (
          <>
            {dejaEnrole && !enSuspens && !confirmerRetrait && (
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700 ring-1 ring-emerald-200">
                {etatFace.b
                  ? 'Deux empreintes sont enrôlées (avec et sans lunettes) pour cet employé.'
                  : 'Une empreinte est déjà enrôlée pour cet employé. Ajoutez l\'empreinte B (avec lunettes) pour fiabiliser la reconnaissance avec/sans lunettes, ou remplacez la signature existante.'}
              </p>
            )}
            {!enSuspens && (
              <div className="flex flex-wrap items-center justify-end gap-2">
                {confirmerRetrait ? (
                  <span className="flex items-center gap-2 text-xs text-red-700">
                    Retirer toutes les signatures ?
                    <button type="button" className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700" onClick={retirer} disabled={sauvegarde}>
                      Confirmer
                    </button>
                    <button type="button" className="rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100" onClick={() => setConfirmerRetrait(false)}>Annuler</button>
                  </span>
                ) : dejaEnrole ? (
                  <button type="button" className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50" onClick={() => setConfirmerRetrait(true)}>
                    <IconTrash /> Retirer l'enrôlement
                  </button>
                ) : null}
              </div>
            )}
          </>
        )}

        {message && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 ring-1 ring-emerald-200">{message}</p>}
        {erreur && etape !== 'erreur' && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">{erreur}</p>}
      </div>
    </Modal>
  );
}