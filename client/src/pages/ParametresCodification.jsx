import { useEffect, useState } from 'react';
import { api } from '../api';
import { IconAlert } from '../components/icons';

const COULEURS = [
  { hex: '#f59e0b', nom: 'Ambre' },
  { hex: '#0ea5e9', nom: 'Bleu ciel' },
  { hex: '#f43f5e', nom: 'Rose' },
  { hex: '#64748b', nom: 'Gris ardoise' },
  { hex: '#10b981', nom: 'Émeraude' },
  { hex: '#8b5cf6', nom: 'Violet' },
  { hex: '#1c34cc', nom: 'Bleu brand' },
  { hex: '#eab308', nom: 'Jaune' },
];

export default function ParametresCodification() {
  const [codes, setCodes] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [fCode, setFCode] = useState('');
  const [fLibelle, setFLibelle] = useState('');
  const [fCouleur, setFCouleur] = useState('#1c34cc');
  const [saving, setSaving] = useState(false);

  const [delTarget, setDelTarget] = useState(null);
  const [delSaving, setDelSaving] = useState(false);

  const load = () => api.codesPaie().then((r) => setCodes(r.codes)).catch((e) => setError(e.message));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const ouvrirCreation = () => {
    setError('');
    setEditTarget(null);
    setFCode('');
    setFLibelle('');
    setFCouleur('#1c34cc');
    setFormOpen(true);
  };

  const ouvrirModification = (c) => {
    setError('');
    setEditTarget(c);
    setFCode(c.code);
    setFLibelle(c.libelle);
    setFCouleur(c.couleur || '#1c34cc');
    setFormOpen(true);
  };

  const submitForm = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const body = { code: fCode, libelle: fLibelle, couleur: fCouleur };
      if (editTarget) {
        await api.updateCodePaie(editTarget.id, body);
        setSuccess(`Paramètre « ${fCode.toUpperCase()} » modifié.`);
      } else {
        await api.createCodePaie(body);
        setSuccess(`Paramètre « ${fCode.trim().toUpperCase()} » ajouté.`);
      }
      setFormOpen(false);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const submitDelete = async () => {
    setError('');
    setDelSaving(true);
    try {
      await api.deleteCodePaie(delTarget.id);
      setSuccess(`Paramètre « ${delTarget.code} » supprimé.`);
      setDelTarget(null);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setDelSaving(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Paramètres &amp; Codification</h2>
          <p className="text-sm text-slate-500">
            Codes de présence utilisés par le journal de paie — ajoutez, modifiez ou supprimez les paramètres.
          </p>
        </div>
        <button className="btn-primary" onClick={ouvrirCreation}>
          + Ajouter un paramètre
        </button>
      </div>

      {success && <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700 ring-1 ring-emerald-200">{success}</p>}
      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}

      <div className="card overflow-hidden">
        <table className="w-max-table text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-5 py-3">Code</th>
              <th className="px-5 py-3">Signification</th>
              <th className="px-5 py-3">Couleur</th>
              <th className="px-5 py-3 text-end">Actions</th>
            </tr>
          </thead>
          <tbody>
            {codes.map((c) => (
              <tr key={c.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="px-5 py-3">
                  <span className="inline-block rounded-md bg-slate-100 px-2.5 py-1 font-mono text-base font-bold text-slate-900">{c.code}</span>
                </td>
                <td className="px-5 py-3 font-semibold uppercase text-slate-800">{c.libelle}</td>
                <td className="px-5 py-3">
                  {c.couleur ? (
                    <span className="inline-flex items-center gap-2 text-xs text-slate-500">
                      <span className="inline-block h-4 w-4 rounded-full ring-1 ring-slate-300" style={{ backgroundColor: c.couleur }} />
                      <span className="font-mono">{c.couleur}</span>
                    </span>
                  ) : '—'}
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      className="rounded-md px-2.5 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50"
                      onClick={() => ouvrirModification(c)}
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
            {codes.length === 0 && (
              <tr><td colSpan={4} className="px-5 py-10 text-center text-slate-500">Aucun paramètre défini. Ajoutez votre premier code de présence.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400">
        Ces codes serviront à la codification des journées dans le futur journal de paie (une case = un code).
        La couleur est utilisée pour l'affichage coloré des cases.
      </p>

      {formOpen && (
        <Modal
          onClose={() => setFormOpen(false)}
          title={editTarget ? `Modifier le paramètre « ${editTarget.code} »` : 'Nouveau paramètre de codification'}
        >
          <form onSubmit={submitForm} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Code *</label>
                <input
                  className="input font-mono uppercase"
                  value={fCode}
                  onChange={(e) => setFCode(e.target.value)}
                  placeholder="Ex. A1"
                  maxLength={10}
                  autoFocus={!editTarget}
                  required
                />
              </div>
              <div>
                <label className="label">Couleur</label>
                <input
                  type="color"
                  className="input h-[42px] cursor-pointer p-1"
                  value={fCouleur}
                  onChange={(e) => setFCouleur(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="label">Signification (libellé) *</label>
              <input
                className="input"
                value={fLibelle}
                onChange={(e) => setFLibelle(e.target.value)}
                placeholder="Ex. ABSENT"
                autoFocus={!!editTarget}
                required
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {COULEURS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  title={c.nom}
                  onClick={() => setFCouleur(c.hex)}
                  className={`h-6 w-6 rounded-full ring-2 transition ${fCouleur.toLowerCase() === c.hex ? 'ring-slate-900' : 'ring-transparent hover:ring-slate-300'}`}
                  style={{ backgroundColor: c.hex }}
                />
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setFormOpen(false)}>Annuler</button>
              <button className="btn-primary" disabled={saving}>
                {saving ? 'Enregistrement…' : editTarget ? 'Enregistrer' : 'Ajouter'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {delTarget && (
        <Modal onClose={() => setDelTarget(null)} title="Supprimer le paramètre" danger>
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              <span className="mt-0.5 shrink-0"><IconAlert /></span>
              <p>
                Supprimer le paramètre « <b>{delTarget.code}</b> » ({delTarget.libelle}) ?
                <br />
                Cette action est irréversible.
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onMouseDown={onClose}>
      <div className="card max-h-[90vh] w-full max-w-md overflow-auto p-6" onMouseDown={(e) => e.stopPropagation()}>
        <div className={`mb-4 flex items-center justify-between ${danger ? 'text-red-700' : 'text-slate-900'}`}>
          <h3 className="text-base font-bold">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
