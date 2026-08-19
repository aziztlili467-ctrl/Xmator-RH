import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { fmtJours, today } from '../utils';
import Field from '../components/Field';
import EmployePicker from '../components/EmployePicker';

export default function NouveauSoldeInitial() {
  const [params] = useSearchParams();
  const [selected, setSelected] = useState(null);
  const [date, setDate] = useState(today());
  const [jours, setJours] = useState('');
  const [motif, setMotif] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    const id = params.get('employe');
    if (id) api.employe(id).then(setSelected).catch(() => {});
  }, [params]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!selected) return setError('Veuillez sélectionner un employé.');
    setSaving(true);
    try {
      const mvt = await api.createMouvement({
        employe_id: selected.id,
        type_operation: 'solde_initial',
        date_operation: date,
        jours: Number(jours),
        motif,
      });
      setSuccess(`Solde initial de ${fmtJours(mvt.jours)} j enregistré pour ${selected.nom} ${selected.prenom}. Nouveau solde : ${fmtJours(mvt.solde_apres)} j.`);
      setSelected(null);
      setJours('');
      setMotif('');
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
        <h2 className="text-lg font-bold text-slate-900">Nouveau solde initial</h2>
        <p className="text-sm text-slate-500">
          Saisissez le solde de départ d'un employé. Ce solde sert de base au calcul du solde courant.
        </p>
      </div>

      {success && <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700 ring-1 ring-emerald-200">{success}</p>}
      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}

      <form onSubmit={submit} className="card space-y-5 p-6">
        <Field label="Employé" required hint="Le matricule est vérifié dans la base des employés.">
          <EmployePicker key={resetKey} selected={selected} onSelect={setSelected} />
        </Field>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Date d'attribution" required>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          <Field label="Nombre de jours attribués" required>
            <input
              type="number"
              className="input"
              min="0.5"
              step="0.5"
              value={jours}
              onChange={(e) => setJours(e.target.value)}
              placeholder="Ex. 30"
              required
            />
          </Field>
        </div>

        <Field label="Remarque / motif" hint="Optionnel">
          <textarea className="input" rows={2} value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Ex. Solde initial année…" />
        </Field>

        {selected && (
          <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
            {`Solde courant actuel de ${selected.nom} ${selected.prenom} : ${fmtJours(selected.solde)} j`}
          </p>
        )}

        <div className="flex justify-end">
          <button className="btn-primary" disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer le solde initial'}
          </button>
        </div>
      </form>
    </div>
  );
}
