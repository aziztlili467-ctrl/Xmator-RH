import { useEffect, useState } from 'react';
import { api } from '../api';
import { fmtDate } from '../utils';
import { IconDownload, IconUpload } from '../components/icons';

const ROLES = [
  { value: 'super_admin', label: 'Super Admin', cls: 'bg-purple-50 text-purple-700 ring-purple-200' },
  { value: 'consultation', label: 'Consultation', cls: 'bg-sky-50 text-sky-700 ring-sky-200' },
  { value: 'moderateur', label: 'Modérateur', cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
  { value: 'employe', label: 'Employé', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
];

const roleMeta = (r) => ROLES.find((x) => x.value === r) || ROLES[0];

const ROLE_LABELS = { super_admin: 'Super Admin', consultation: 'Consultation', moderateur: 'Modérateur', employe: 'Employé' };

const MODULES = [
  { key: 'employes', label: 'Employés' },
  { key: 'categories', label: 'Catégories' },
  { key: 'soldes', label: 'Soldes & opérations' },
  { key: 'demandes', label: 'Demandes de congé' },
  { key: 'maladie', label: 'Arrêts maladie' },
];

const ACTIONS = [
  { key: 'lire', label: 'Lire' },
  { key: 'ajouter', label: 'Ajouter' },
  { key: 'modifier', label: 'Modifier' },
];

const PERMISSIONS_VIDE = Object.fromEntries(MODULES.map((m) => [m.key, { lire: true, ajouter: true, modifier: true }]));
const clonePerms = () => JSON.parse(JSON.stringify(PERMISSIONS_VIDE));

const FORM_VIDE = { id: null, login: '', password: '', role: 'employe', employe_id: '', actif: 1, permissions: null };

// Résumé des rubriques autorisées d'un modérateur (colonne « Droits »)
const droitsLabel = (perms) => {
  if (!perms) return 'Tous les modules';
  let obj;
  try {
    obj = JSON.parse(perms);
  } catch {
    return 'Tous les modules';
  }
  const granted = MODULES.filter((m) => {
    const p = obj[m.key];
    return p && (p.lire || p.ajouter || p.modifier);
  });
  if (granted.length === MODULES.length) return 'Tous les modules';
  if (!granted.length) return 'Aucun module';
  return granted.map((m) => m.label).join(', ');
};

export default function GestionComptes() {
  const [comptes, setComptes] = useState([]);
  const [employes, setEmployes] = useState([]);
  const [form, setForm] = useState(FORM_VIDE);
  const [showForm, setShowForm] = useState(false);
  const [showGen, setShowGen] = useState(false);
  const [genMode, setGenMode] = useState('tous');
  const [genEmpId, setGenEmpId] = useState('');
  const [genResult, setGenResult] = useState([]);
  const [genMsg, setGenMsg] = useState('');
  const [photoEmpId, setPhotoEmpId] = useState('');
  const [photoFile, setPhotoFile] = useState(null);
  const [photoMsg, setPhotoMsg] = useState('');
  const [photosZip, setPhotosZip] = useState(null);
  const [photosMsg, setPhotosMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    Promise.all([api.comptes(), api.employes()])
      .then(([c, e]) => { setComptes(c); setEmployes(e); })
      .catch((e) => setError(e.message));
  };

  useEffect(() => { load(); }, []);

  const employeBy = (id) => employes.find((e) => e.id === Number(id));

  const openCreate = () => { setForm({ ...FORM_VIDE, role: 'employe', permissions: null }); setShowForm(true); };
  const openCreateModerateur = () => { setForm({ ...FORM_VIDE, role: 'moderateur', permissions: clonePerms() }); setShowForm(true); };
  const openEdit = (c) => {
    let perms = null;
    if (c.role === 'moderateur') {
      try {
        perms = c.permissions ? JSON.parse(c.permissions) : clonePerms();
      } catch {
        perms = clonePerms();
      }
    }
    setForm({ id: c.id, login: c.login, password: '', role: c.role, employe_id: c.employe_id || '', actif: c.actif, permissions: perms });
    setShowForm(true);
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const body = {
        login: form.login,
        role: form.role,
        actif: form.actif,
        employe_id: form.employe_id || null,
      };
      if (form.role === 'moderateur') body.permissions = form.permissions || PERMISSIONS_VIDE;
      if (form.password) body.password = form.password;
      if (form.id) await api.updateCompte(form.id, body);
      else await api.createCompte(body);
      setShowForm(false);
      load();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const supprimer = async (c) => {
    if (!window.confirm(`Supprimer le compte « ${c.login} » ?`)) return;
    try { await api.deleteCompte(c.id); load(); } catch (err) { setError(err.message); }
  };

  const generer = async () => {
    setBusy(true); setError(''); setGenMsg(''); setGenResult([]);
    try {
      const body = genMode === 'tous' ? { tous: true } : { employe_ids: [Number(genEmpId)] };
      const r = await api.genererIdentifiants(body);
      setGenResult(r.generes || []);
      setGenMsg(r.generes && r.generes.length ? `${r.generes.length} identifiant(s) généré(s).` : 'Aucun identifiant généré.');
      load();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const copyOne = async (login, password) => {
    try { await navigator.clipboard.writeText(`Login : ${login}\nMot de passe : ${password}`); } catch {}
  };
  const copyAll = async () => {
    const txt = genResult.map((g) => `${g.matricule}\t${g.nom_prenom}\t${g.login}\t${g.password}`).join('\n');
    try { await navigator.clipboard.writeText(txt); } catch {}
  };
  const exportCsv = () => {
    const header = 'matricule;nom_prenom;login;password';
    const lines = genResult.map((g) => [g.matricule, g.nom_prenom, g.login, g.password].join(';'));
    const blob = new Blob([header + '\n' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'identifiants_generes.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const uploadPhoto = async (e) => {
    e.preventDefault();
    if (!photoEmpId || !photoFile) return setPhotoMsg('Choisissez un employé et un fichier image.');
    setBusy(true); setPhotoMsg('');
    try {
      const emp = employeBy(photoEmpId);
      await api.uploadPhoto(emp.matricule, photoFile);
      setPhotoMsg('Photo enregistrée (conversion webp automatique).');
      setPhotoFile(null);
      load();
    } catch (err) { setPhotoMsg(err.message); }
    finally { setBusy(false); }
  };

  const sauverPhotos = async () => {
    setBusy(true); setPhotosMsg('');
    try {
      await api.photosBackup();
      setPhotosMsg('Sauvegarde des photos effectuée : fichier ZIP téléchargé (photos à la dernière minute, mêmes noms que le dossier photos).');
    } catch (err) { setPhotosMsg(err.message); }
    finally { setBusy(false); }
  };

  const restaurerPhotos = async (e) => {
    e.preventDefault();
    if (!photosZip) return setPhotosMsg('Choisissez le fichier ZIP de sauvegarde des photos.');
    setBusy(true); setPhotosMsg('');
    try {
      const res = await api.photosRestaurer(photosZip);
      setPhotosMsg(`Photos restaurées avec succès (${res.restaurees} fichier(s) .webp remis en place).`);
      setPhotosZip(null);
      load();
    } catch (err) { setPhotosMsg(err.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Gestion des comptes</h2>
          <p className="text-sm text-slate-500">Création, rôles, réinitialisation de mot de passe et génération d'identifiants.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => setShowGen(true)}>Générer identifiants</button>
          <button className="btn-secondary" onClick={openCreateModerateur}>Nouveau modérateur</button>
          <button className="btn-primary" onClick={openCreate}>Nouveau compte</button>
        </div>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}

      <div className="card overflow-hidden">
        <div className="table-wrap">
          <table className="w-max-table text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-start text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Login</th>
                <th className="px-4 py-3">Rôle</th>
                <th className="px-4 py-3">Droits (modérateur)</th>
                <th className="px-4 py-3">Employé lié</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3">Dernière connexion</th>
                <th className="px-4 py-3 text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {comptes.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Aucun compte pour le moment.</td></tr>
              ) : comptes.map((c) => {
                const rm = roleMeta(c.role);
                const emp = c.employe_id ? employeBy(c.employe_id) : null;
                return (
                  <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-semibold text-slate-800">{c.login}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ${rm.cls}`}>{ROLE_LABELS[rm.value] || rm.value}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      {c.role === 'moderateur' ? (
                        <span className="text-xs text-slate-500">{droitsLabel(c.permissions)}</span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{emp ? `${emp.nom} ${emp.prenom} (${emp.matricule})` : '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${c.actif ? 'text-emerald-600' : 'text-red-500'}`}>
                        <span className={`h-2 w-2 rounded-full ${c.actif ? 'bg-emerald-500' : 'bg-red-500'}`} />
                        {c.actif ? 'Actif' : 'Inactif'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">{fmtDate(c.derniere_connexion)}</td>
                    <td className="px-4 py-2.5 text-end">
                      <button className="me-2 text-xs font-semibold text-brand-600 hover:underline" onClick={() => openEdit(c)}>Modifier</button>
                      <button className="text-xs font-semibold text-red-600 hover:underline" onClick={() => supprimer(c)}>Supprimer</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Formulaire création/modification */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overscroll-contain bg-slate-900/50 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:p-4">
          <form onSubmit={save} className="card modal-shell w-full max-w-md p-4 sm:p-6">
            <h3 className="mb-4 text-lg font-bold text-slate-900">{form.id ? 'Modifier le compte' : 'Nouveau compte'}</h3>
            <div className="space-y-4">
              <div>
                <label className="label">Login</label>
                <input className="input" value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} required />
              </div>
              <div>
                <label className="label">{form.id ? 'Nouveau mot de passe (vide = inchangé)' : 'Mot de passe'}</label>
                <input className="input" type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required={!form.id} autoComplete="off" />
              </div>
              <div>
                <label className="label">Rôle</label>
                <select className="input" value={form.role} onChange={(e) => {
                  const r = e.target.value;
                  setForm({
                    ...form,
                    role: r,
                    permissions: r === 'moderateur' && !form.permissions ? clonePerms() : form.permissions,
                  });
                }}>
                  {ROLES.map((r) => <option key={r.value} value={r.value}>{ROLE_LABELS[r.value] || r.value}</option>)}
                </select>
              </div>
              {form.role === 'moderateur' && (
                <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
                  <label className="label">Droits d'accès par rubrique</label>
                  <div className="table-wrap">
                  <table className="w-max-table text-xs">
                    <thead>
                      <tr>
                        <th className="pb-1 text-start font-semibold text-slate-500">Rubrique</th>
                        {ACTIONS.map((a) => (
                          <th key={a.key} className="pb-1 text-center font-semibold text-slate-500">{a.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {MODULES.map((m) => (
                        <tr key={m.key} className="border-t border-amber-100">
                          <td className="py-1.5 font-medium text-slate-700">{m.label}</td>
                          {ACTIONS.map((a) => {
                            const checked = !!(form.permissions && form.permissions[m.key] && form.permissions[m.key][a.key]);
                            return (
                              <td key={a.key} className="py-1.5 text-center">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() =>
                                    setForm({
                                      ...form,
                                      permissions: {
                                        ...(form.permissions || PERMISSIONS_VIDE),
                                        [m.key]: {
                                          ...((form.permissions && form.permissions[m.key]) || { lire: false, ajouter: false, modifier: false }),
                                          [a.key]: !checked,
                                        },
                                      },
                                    })
                                  }
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-400">La suppression reste réservée au super admin.</p>
                </div>
              )}
              <div>
                <label className="label">Employé lié {form.role === 'employe' && <span className="text-red-500">*</span>}</label>
                <select className="input" value={form.employe_id} onChange={(e) => setForm({ ...form, employe_id: e.target.value })}>
                  <option value="">— Aucun —</option>
                  {employes.map((e) => (
                    <option key={e.id} value={e.id}>{e.matricule} — {e.nom} {e.prenom}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input id="cpt_actif" type="checkbox" checked={!!form.actif} onChange={(e) => setForm({ ...form, actif: e.target.checked ? 1 : 0 })} />
                <label htmlFor="cpt_actif" className="text-sm text-slate-600">Compte actif</label>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Annuler</button>
              <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
            </div>
          </form>
        </div>
      )}

      {/* Génération d'identifiants */}
      {showGen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overscroll-contain bg-slate-900/50 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:p-4">
          <div className="card modal-shell w-full max-w-2xl p-4 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Générer des identifiants</h3>
              <button className="text-slate-400 hover:text-slate-600" onClick={() => setShowGen(false)}>✕</button>
            </div>
            <div className="mb-4 space-y-3">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="radio" checked={genMode === 'tous'} onChange={() => setGenMode('tous')} /> Tous les employés actifs
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="radio" checked={genMode === 'un'} onChange={() => setGenMode('un')} /> Un employé :
              </label>
              {genMode === 'un' && (
                <select className="input ms-6" value={genEmpId} onChange={(e) => setGenEmpId(e.target.value)}>
                  <option value="">Choisir…</option>
                  {employes.filter((e) => e.actif).map((e) => (
                    <option key={e.id} value={e.id}>{e.matricule} — {e.nom} {e.prenom}</option>
                  ))}
                </select>
              )}
              <button className="btn-primary" onClick={generer} disabled={busy}>
                {busy ? 'Génération…' : 'Générer'}
              </button>
            </div>

            {genMsg && <p className="mb-3 text-sm font-semibold text-emerald-600">{genMsg}</p>}
            {genResult.length > 0 && (
              <>
                <div className="mb-2 flex gap-2">
                  <button className="btn-secondary" onClick={copyAll}>Copier tout</button>
                  <button className="btn-secondary" onClick={exportCsv}><IconDownload /> Exporter CSV</button>
                </div>
                <p className="mb-2 text-[11px] text-amber-600">
                  ⚠️ Identifiants affichés UNE FOIS en clair : transmettez-les à chaque employé, puis fermez cette fenêtre.
                </p>
                <div className="table-wrap max-h-64 overflow-y-auto rounded-lg border border-slate-200">
                  <table className="w-max-table text-sm">
                    <thead className="sticky top-0 bg-slate-50 text-start text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Matricule</th>
                        <th className="px-3 py-2">Employé</th>
                        <th className="px-3 py-2">Login</th>
                        <th className="px-3 py-2">Mot de passe</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {genResult.map((g, i) => (
                        <tr key={i} className="border-t border-slate-100">
                          <td className="px-3 py-2 font-mono text-xs">{g.matricule}</td>
                          <td className="px-3 py-2 text-xs">{g.nom_prenom}</td>
                          <td className="px-3 py-2 font-mono text-xs">{g.login}</td>
                          <td className="px-3 py-2 font-mono text-xs">{g.password}</td>
                          <td className="px-3 py-2">
                            <button className="text-xs font-semibold text-brand-600 hover:underline" onClick={() => copyOne(g.login, g.password)}>Copier</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Photos — sauvegarde/restauration uniquement (upload déplacé vers Fiche Signalétique > Informations Personnelles) */}
      <div className="card p-6">
        <div className="mt-0 border-t-0 pt-0">
          <h4 className="mb-2 text-sm font-semibold text-slate-700">Sauvegarde & restauration des photos d'identité</h4>
          <p className="mb-4 text-xs leading-relaxed text-slate-500">
            Sauvegardez <span className="font-semibold text-slate-700">toutes les photos d'identité</span> dans un fichier
            ZIP (à la dernière minute), avec les <span className="font-semibold text-slate-700">mêmes noms de fichiers et
            paramètres</span> que le dossier <code className="rounded bg-slate-100 px-1 py-0.5">data/photos</code> : un
            fichier <code className="rounded bg-slate-100 px-1 py-0.5">{'{matricule}.webp'}</code> par employé. Conservez ce
            ZIP dans un endroit sûr, puis utilisez <span className="font-semibold text-slate-700">Restaurer</span> pour
            remettre l'ensemble des photos en place après une réinstallation ou un incident.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button type="button" className="btn-primary" onClick={sauverPhotos} disabled={busy}>
              <IconDownload /> Sauvegarder les photos (ZIP)
            </button>
            <form onSubmit={restaurerPhotos} className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
              <input className="input p-2 flex-1" type="file" accept=".zip,application/zip"
                onChange={(e) => setPhotosZip(e.target.files[0] || null)} />
              <button type="submit" className="btn-secondary" disabled={busy}>
                <IconUpload /> Restaurer les photos (ZIP)
              </button>
            </form>
          </div>
          {photosMsg && <p className="mt-3 text-sm text-emerald-600">{photosMsg}</p>}
        </div>
      </div>
    </div>
  );
}