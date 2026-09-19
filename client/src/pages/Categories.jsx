import { useEffect, useState } from 'react';
import { api } from '../api';
import { IconAlert } from '../components/icons';

// Jours de la semaine : 0 = dimanche … 6 = samedi (numéros du propos `repos_hebdomadaire`)
const JOURS = [
  { n: 0, long: 'Dimanche', court: 'Dim' },
  { n: 1, long: 'Lundi', court: 'Lun' },
  { n: 2, long: 'Mardi', court: 'Mar' },
  { n: 3, long: 'Mercredi', court: 'Mer' },
  { n: 4, long: 'Jeudi', court: 'Jeu' },
  { n: 5, long: 'Vendredi', court: 'Ven' },
  { n: 6, long: 'Samedi', court: 'Sam' },
];

// Parse '0,6' → tableau de numéros de jours triés
const parselist = (s) => [...new Set(String(s || '').split(',').map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort((a, b) => a - b);
const listStr = (arr) => [...arr].sort((a, b) => a - b).join(',');
const labelRepos = (arr) => (arr.length ? arr.map((n) => JOURS[n].court).join(', ') : 'Aucun');

function ReposPicker({ value, onChange }) {
  return (
    <div>
      <label className="label">Jours de repos hebdomadaire <span className="font-normal text-slate-400">(0 = dimanche … 6 = samedi)</span></label>
      <div className="flex flex-wrap gap-1.5">
        {JOURS.map((j) => {
          const active = value.includes(j.n);
          return (
            <button
              key={j.n}
              type="button"
              onClick={() => onChange(active ? value.filter((n) => n !== j.n) : [...value, j.n])}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                active ? 'border-red-200 bg-red-50 text-red-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
              title={active ? `${j.long} : repos` : `${j.long} : travaillé`}
            >
              {j.court}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-xs text-slate-500">
        Jours cochés = jours de repos (non ouvrables). {labelRepos(value) && <>Actuellement : {labelRepos(value)}.</>}
      </p>
    </div>
  );
}

export default function Categories() {
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [createLibelle, setCreateLibelle] = useState('');
  const [createRepos, setCreateRepos] = useState([0, 6]);
  const [createSaving, setCreateSaving] = useState(false);

  const [editTarget, setEditTarget] = useState(null);
  const [editLibelle, setEditLibelle] = useState('');
  const [editRepos, setEditRepos] = useState([0, 6]);
  const [editSaving, setEditSaving] = useState(false);

  const [delTarget, setDelTarget] = useState(null);
  const [delSaving, setDelSaving] = useState(false);

  const load = () => api.categories().then(setCategories).catch((e) => setError(e.message));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const submitCreate = async (e) => {
    e.preventDefault();
    setError('');
    setCreateSaving(true);
    try {
      await api.createCategorie(createLibelle, listStr(createRepos));
      setCreateLibelle('');
      setCreateRepos([0, 6]);
      setCreateOpen(false);
      setSuccess(`Catégorie « ${createLibelle.trim()} » créée.`);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreateSaving(false);
    }
  };

  const submitEdit = async (e) => {
    e.preventDefault();
    setError('');
    setEditSaving(true);
    try {
      await api.updateCategorie(editTarget.id, editLibelle, listStr(editRepos));
      setEditTarget(null);
      setSuccess(`Catégorie « ${editTarget.libelle} » mise à jour.`);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setEditSaving(false);
    }
  };

  const submitDelete = async () => {
    setError('');
    setDelSaving(true);
    try {
      await api.deleteCategorie(delTarget.id);
      setDelTarget(null);
      setSuccess(`Catégorie « ${delTarget.libelle} » supprimée.`);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setDelSaving(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">CATÉGORIES PROFESSIONNELLES</h2>
          <p className="text-sm text-slate-500">
            Liste paramétrable — modifiez, renommez ou ajoutez de nouvelles catégories de fonctions.
          </p>
        </div>
        <button className="btn-primary" onClick={() => { setError(''); setCreateLibelle(''); setCreateRepos([0, 6]); setCreateOpen(true); }}>
          + Nouvelle catégorie
        </button>
      </div>

      {success && <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700 ring-1 ring-emerald-200">{success}</p>}
      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}

      <div className="card table-wrap p-0">
        <table className="w-max-table text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-start text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-5 py-3">Libellé</th>
              <th className="px-5 py-3">Repos hebdomadaire</th>
              <th className="px-5 py-3 text-end">Actions</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="px-5 py-3 font-semibold text-slate-800">{c.libelle}</td>
                <td className="px-5 py-3 text-slate-600">{labelRepos(parselist(c.repos_hebdomadaire))}</td>
                <td className="px-5 py-3">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      className="rounded-md px-2.5 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50"
                      onClick={() => { setError(''); setEditTarget(c); setEditLibelle(c.libelle); setEditRepos(parselist(c.repos_hebdomadaire)); }}
                    >
                      Modifier
                    </button>
                    <button
                      className="rounded-md px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                      onClick={() => { setError(''); setDelTarget(c); }}
                    >
                      Supprimer
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {categories.length === 0 && (
              <tr><td colSpan={3} className="px-5 py-10 text-center text-slate-500">Aucune catégorie définie.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {createOpen && (
        <Modal onClose={() => setCreateOpen(false)} title="Nouvelle catégorie">
          <form onSubmit={submitCreate} className="space-y-4">
            <div>
              <label className="label">Libellé de la catégorie *</label>
              <input
                className="input"
                value={createLibelle}
                onChange={(e) => setCreateLibelle(e.target.value)}
                placeholder="Ex. Technicien informatique"
                autoFocus
                required
              />
            </div>
            <ReposPicker value={createRepos} onChange={setCreateRepos} />
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setCreateOpen(false)}>Annuler</button>
              <button className="btn-primary" disabled={createSaving}>{createSaving ? 'Création…' : 'Créer'}</button>
            </div>
          </form>
        </Modal>
      )}

      {editTarget && (
        <Modal onClose={() => setEditTarget(null)} title="Modifier la catégorie">
          <form onSubmit={submitEdit} className="space-y-4">
            <div>
              <label className="label">Libellé de la catégorie *</label>
              <input
                className="input"
                value={editLibelle}
                onChange={(e) => setEditLibelle(e.target.value)}
                autoFocus
                required
              />
            </div>
            <ReposPicker value={editRepos} onChange={setEditRepos} />
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setEditTarget(null)}>Annuler</button>
              <button className="btn-primary" disabled={editSaving}>{editSaving ? 'Enregistrement…' : 'Enregistrer'}</button>
            </div>
          </form>
        </Modal>
      )}

      {delTarget && (
        <Modal onClose={() => setDelTarget(null)} title="Supprimer la catégorie" danger>
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              <span className="mt-0.5 shrink-0"><IconAlert /></span>
              <p>
                Supprimer la catégorie « {delTarget.libelle} » ?
                <br />
                La suppression sera refusée si des employés y sont rattachés.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setDelTarget(null)}>Annuler</button>
              <button
                className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700"
                disabled={delSaving}
                onClick={submitDelete}
              >
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
      <div className="card modal-shell w-full max-w-md p-4 sm:p-6" onMouseDown={(e) => e.stopPropagation()}>
        <div className={`mb-4 flex items-center justify-between ${danger ? 'text-red-700' : 'text-slate-900'}`}>
          <h3 className="text-base font-bold">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
