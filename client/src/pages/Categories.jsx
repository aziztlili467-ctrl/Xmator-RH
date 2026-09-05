import { useEffect, useState } from 'react';
import { api } from '../api';
import { IconAlert } from '../components/icons';

export default function Categories() {
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [createLibelle, setCreateLibelle] = useState('');
  const [createSaving, setCreateSaving] = useState(false);

  const [editTarget, setEditTarget] = useState(null);
  const [editLibelle, setEditLibelle] = useState('');
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
      await api.createCategorie(createLibelle);
      setCreateLibelle('');
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
      await api.updateCategorie(editTarget.id, editLibelle);
      setEditTarget(null);
      setSuccess(`Catégorie « ${editTarget.libelle} » renommée en « ${editLibelle.trim()} ».`);
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
          <h2 className="text-lg font-bold text-slate-900">Catégories professionnelles</h2>
          <p className="text-sm text-slate-500">
            Liste paramétrable — modifiez, renommez ou ajoutez de nouvelles catégories de fonctions.
          </p>
        </div>
        <button className="btn-primary" onClick={() => { setError(''); setCreateOpen(true); }}>
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
              <th className="px-5 py-3 text-end">Actions</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="px-5 py-3 font-semibold text-slate-800">{c.libelle}</td>
                <td className="px-5 py-3">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      className="rounded-md px-2.5 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50"
                      onClick={() => { setError(''); setEditTarget(c); setEditLibelle(c.libelle); }}
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
              <tr><td colSpan={2} className="px-5 py-10 text-center text-slate-500">Aucune catégorie définie.</td></tr>
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
