import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { fmtJours, today } from '../utils';
import Field from '../components/Field';
import EmployePicker from '../components/EmployePicker';

export default function PrelevementConges() {
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

  const nb = Number(jours);
  const soldeOk = !selected || !(nb > 0) || nb <= selected.solde + 0.0001;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!selected) return setError('Veuillez sélectionner un employé.');
    if (!soldeOk) return setError(`Le prélèvement (${fmtJours(nb)} j) dépasse le solde disponible (${fmtJours(selected.solde)} j).`);
    setSaving(true);
    try {
      const mvt = await api.createMouvement({
        employe_id: selected.id,
        type_operation: 'prelevement',
        date_operation: date,
        jours: nb,
        motif,
      });
      setSuccess(`Prélèvement de ${fmtJours(mvt.jours)} j enregistré pour ${selected.nom} ${selected.prenom}. Solde restant : ${fmtJours(mvt.solde_apres)} j.`);
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
        <h2 className="text-lg font-bold text-slate-900">Prélèvement de congé</h2>
        <p className="text-sm text-slate-500">
          Saisissez le matricule : le nom, le prénom et la fonction s'affichent automatiquement. Le prélèvement est déduit en temps réel du solde.
        </p>
      </div>

      {success && <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700 ring-1 ring-emerald-200">{success}</p>}
      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}

      <form onSubmit={submit} className="card space-y-5 p-6">
        <Field label="Employé" required hint="Recherche par matricule, nom ou prénom — vérification du matricule dans la base.">
          <EmployePicker key={resetKey} selected={selected} onSelect={setSelected} />
        </Field>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Date de l'opération" required>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          <Field label="Nombre de jours prélevés" required>
            <input
              type="number"
              className="input"
              min="0.5"
              step="0.5"
              value={jours}
              onChange={(e) => setJours(e.target.value)}
              placeholder="Ex. 5"
              required
            />
          </Field>
        </div>

        <Field label="Remarque / motif" hint="Optionnel">
          <textarea className="input" rows={2} value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Ex. Congé annuel" />
        </Field>

        {selected && (
          <div className={`rounded-lg px-4 py-3 text-sm ring-1 ${soldeOk ? 'bg-slate-50 text-slate-600 ring-slate-200' : 'bg-red-50 text-red-700 ring-red-200'}`}>
            <p>
              {`Solde disponible de ${selected.nom} ${selected.prenom} : ${fmtJours(selected.solde)} j`}
            </p>
            {nb > 0 && !soldeOk && (
              <p className="mt-1 font-semibold">
                {`Attention : le prélèvement de ${fmtJours(nb)} j dépasse le solde disponible. La saisie sera bloquée.`}
              </p>
            )}
            {nb > 0 && soldeOk && (
              <p className="mt-1 text-emerald-700">{`Solde après prélèvement : ${fmtJours(selected.solde - nb)} j`}</p>
            )}
          </div>
        )}

        <div className="flex justify-end">
          <button className="btn-primary" disabled={saving || (selected && !soldeOk)}>
            {saving ? 'Enregistrement…' : 'Valider le prélèvement'}
          </button>
        </div>
      </form>
    </div>
  );
}
