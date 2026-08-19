import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { fmtJours, today } from '../utils';
import Field from '../components/Field';
import EmployePicker from '../components/EmployePicker';

export default function AjoutSoldeMaladie() {
  const [params] = useSearchParams();
  const [mode, setMode] = useState('masse');
  const [selected, setSelected] = useState(null);
  const [categories, setCategories] = useState([]);
  const [categorie, setCategorie] = useState('');
  const [preview, setPreview] = useState(null);
  const [date, setDate] = useState(today());
  const [jours, setJours] = useState('20');
  const [motif, setMotif] = useState('Droit maladie annuel');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    const id = params.get('employe');
    if (id) {
      api.employe(id).then((e) => {
        setSelected(e);
        setMode('individuel');
      }).catch(() => {});
    }
    api.categories().then(setCategories).catch(() => {});
  }, [params]);

  useEffect(() => {
    setPreview(null);
    if (mode === 'masse') {
      api.employes({ categorie }).then((list) => setPreview(list)).catch(() => {});
    }
  }, [mode, categorie]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    const j = Number(jours);
    if (!(j > 0)) return setError('Le nombre de jours doit être positif.');

    setSaving(true);
    try {
      if (mode === 'individuel') {
        if (!selected) return setError('Veuillez sélectionner un employé.');
        const mvt = await api.createMouvement({
          employe_id: selected.id,
          type_operation: 'ajout_annuel',
          date_operation: date,
          jours: j,
          motif,
          solde_type: 'maladie',
        });
        setSuccess(`Solde maladie de ${fmtJours(j)} j crédité pour ${selected.nom} ${selected.prenom}. Nouveau solde maladie : ${fmtJours(mvt.solde_apres)} j.`);
        setSelected(null);
      } else {
        if (!preview || preview.length === 0) return setError("Aucun employé ne correspond au critère choisi.");
        const r = await api.ajoutMaladieMasse({
          jours: j,
          date_operation: date,
          motif,
          categorie_id: categorie || undefined,
          employes: preview.map((p) => p.id),
        });
        setSuccess(`Solde maladie de ${fmtJours(j)} j crédité pour ${r.count} employé(s).`);
      }
      setJours('20');
      setMotif('Droit maladie annuel');
      setDate(today());
      setResetKey((k) => k + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Ajout de solde maladie annuel</h2>
        <p className="text-sm text-slate-500">
          {'Les employés bénéficient de'} <strong>{'20 jours de maladie payés annuellement'}</strong> {"Ce module crédite le solde maladie en masse (tous les employés ou par catégorie), sans écraser l'historique."}
        </p>
      </div>

      <div className="card flex gap-1 p-1">
        {['masse', 'individuel'].map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => { setMode(m); setSelected(null); setError(''); }}
            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
              mode === m ? 'bg-brand-700 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {m === 'masse' ? 'En masse (tous / par catégorie)' : 'Pour un employé'}
          </button>
        ))}
      </div>

      {success && <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700 ring-1 ring-emerald-200">{success}</p>}
      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}

      <form onSubmit={submit} className="card space-y-5 p-6">
        {mode === 'individuel' ? (
          <Field label="Employé" required>
            <EmployePicker key={resetKey} selected={selected} onSelect={setSelected} />
          </Field>
        ) : (
          <Field label="Catégorie professionnelle" hint="Laissez vide pour créditer tous les employés actifs.">
            <select className="input" value={categorie} onChange={(e) => setCategorie(e.target.value)}>
              <option value="">Toutes les catégories</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.libelle}</option>)}
            </select>
            {preview && (
              <p className="mt-2 text-xs text-slate-500">
                {`${preview.length} employé(s) seront crédités : ${preview.slice(0, 3).map((p) => `${p.nom} ${p.prenom}`).join(', ')}`}
                {preview.length > 3 ? '…' : ''}
              </p>
            )}
          </Field>
        )}

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Date du crédit" required>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          <Field label="Nombre de jours" required hint="20 jours payés par an pour chaque employé.">
            <input
              type="number"
              className="input"
              min="0.5"
              step="0.5"
              value={jours}
              onChange={(e) => setJours(e.target.value)}
              required
            />
          </Field>
        </div>

        <Field label="Remarque / motif" hint="Optionnel">
          <textarea className="input" rows={2} value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Ex. Droit maladie annuel 2027" />
        </Field>

        <div className="flex justify-end">
          <button className="btn-primary" disabled={saving}>
            {saving ? 'Crédit en cours…' : mode === 'individuel' ? 'Ajouter le solde maladie' : 'Créditer le solde maladie en masse'}
          </button>
        </div>
      </form>
    </div>
  );
}