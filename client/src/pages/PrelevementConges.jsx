import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { fmtJours, today } from '../utils';
import Field from '../components/Field';
import EmployePicker from '../components/EmployePicker';

const TYPES_CONGE_UI = [
  { value: 'annuel', label: 'Congé annuel', maladie: false, debite: true },
  { value: 'exceptionnel', label: 'Congé exceptionnel', maladie: false, debite: false },
  { value: 'maladie', label: 'Maladie', maladie: true, debite: true },
  { value: 'maternite', label: 'Maternité', maladie: true, debite: true },
];

export default function PrelevementConges() {
  const [params] = useSearchParams();
  const [selected, setSelected] = useState(null);
  const [type, setType] = useState('annuel');
  const [dateDebut, setDateDebut] = useState(today());
  const [dateFin, setDateFin] = useState(today());
  const [demiJournee, setDemiJournee] = useState(false);
  const [motif, setMotif] = useState('');
  const [comptage, setComptage] = useState(null);
  const [comptageErr, setComptageErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [resetKey, setResetKey] = useState(0);
  const comptageSeq = useRef(0);

  useEffect(() => {
    const id = params.get('employe');
    if (id) api.employe(id).then(setSelected).catch(() => {});
  }, [params]);

  useEffect(() => {
    if (!selected || !dateDebut || !dateFin || dateFin < dateDebut) {
      setComptage(null);
      setComptageErr('');
      return;
    }
    const seq = ++comptageSeq.current;
    api
      .compteJoursPrelevement({ employe_id: selected.id, debut: dateDebut, fin: dateFin, demi_journee: demiJournee ? '1' : '' })
      .then((data) => {
        if (seq === comptageSeq.current) {
          setComptage(data);
          setComptageErr('');
        }
      })
      .catch((err) => {
        if (seq === comptageSeq.current) {
          setComptage(null);
          setComptageErr(err.message);
        }
      });
  }, [selected, dateDebut, dateFin, demiJournee]);

  if (dateFin < dateDebut) setDateFin(dateDebut);

  const typeInfos = TYPES_CONGE_UI.find((t) => t.value === type);
  const soldeAvant = selected ? (typeInfos.maladie ? selected.solde_maladie : selected.solde) : null;
  const canSubmit =
    selected &&
    comptage &&
    comptage.ouvrables > 0 &&
    (typeInfos.debite ? comptage.jours <= soldeAvant + 0.0001 : true) &&
    comptageErr === '';

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!selected) return setError('Veuillez sélectionner un employé.');
    if (!canSubmit) {
      if (!comptage || comptage.ouvrables < 1) return setError('Aucun jour ouvrable dans cette période pour ce type de congé : tous les jours sont fériés ou repos.');
      return setError(`Le prélèvement (${fmtJours(comptage.jours)} j) dépasse le solde disponible (${fmtJours(soldeAvant)} j).`);
    }
    setSaving(true);
    try {
      const res = await api.createMouvement({
        employe_id: selected.id,
        type_conge: type,
        date_debut: dateDebut,
        date_fin: dateFin,
        demi_journee: demiJournee,
        motif,
      });
      const base = `Prélèvement « ${typeInfos.label} » de ${fmtJours(res.jours_calcules)} j enregistré pour ${selected.nom} ${selected.prenom}.`;
      const reste = typeInfos.debite ? ` Solde restant : ${fmtJours(res.solde_apres)} j.` : '';
      setSuccess(base + reste + (res.note ? ` ${res.note}` : ''));
      setSelected(null);
      setMotif('');
      setDateDebut(today());
      setDateFin(today());
      setDemiJournee(false);
      setComptage(null);
      setType('annuel');
      setResetKey((k) => k + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const surChangementDebut = (v) => {
    setDateDebut(v);
    if (v && dateFin < v) setDateFin(v);
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900">PRÉLÈVEMENT DE CONGÉ</h2>
        <p className="text-sm text-slate-500">
          Saisissez le matricule : le nom, le prénom et la fonction s'affichent automatiquement. Choisissez le type de congé et la
          période [date début → date fin] : les jours de congé sont calculés automatiquement en excluant les jours fériés et les
          repos (calendrier de l'année et catégorie de l'employé).
        </p>
      </div>

      {success && <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700 ring-1 ring-emerald-200">{success}</p>}
      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}

      <form onSubmit={submit} className="card space-y-5 p-6">
        <Field label="Employé" required hint="Recherche par matricule, nom ou prénom — vérification du matricule dans la base.">
          <EmployePicker key={resetKey} selected={selected} onSelect={setSelected} />
        </Field>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Type de congé" required>
            <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES_CONGE_UI.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Demi-journée" hint="Cochez pour ne déduire que le dernier jour ouvrable (0,5 j).">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" className="h-4 w-4" checked={demiJournee} onChange={(e) => setDemiJournee(e.target.checked)} />
              Dernier jour en demi-journée (DJ)
            </label>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Date de début" required>
            <input type="date" className="input" value={dateDebut} onChange={(e) => surChangementDebut(e.target.value)} required />
          </Field>
          <Field label="Date de fin" required>
            <input type="date" className="input" value={dateFin} onChange={(e) => setDateFin(e.target.value)} required />
          </Field>
        </div>

        <Field label="Remarque / motif" hint="Optionnel — ajouté au libellé du mouvement.">
          <textarea className="input" rows={2} value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Ex. Congé annuel posé hors demande" />
        </Field>

        {selected && (
          <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-200">
            <p>
              {`Solde ${typeInfos.maladie ? 'maladie' : 'de congé'} de ${selected.nom} ${selected.prenom} : ${fmtJours(soldeAvant)} j`}
            </p>
            {type === 'exceptionnel' && (
              <p className="mt-1 text-amber-700">
                Congé exceptionnel : ajouté au Journal RMA (cellules CE) et au tableau de bord, sans déduction du solde.
              </p>
            )}
            {comptageErr ? (
              <p className="mt-1 font-semibold text-red-700">{comptageErr}</p>
            ) : comptage ? (
              <>
                {comptage.ouvrables > 0 ? (
                  <p className="mt-1 text-emerald-700">
                    {`Période du ${comptage.date_debut} au ${comptage.date_fin} : ${comptage.ouvrables} jour(s) ouvrable(s) — jours déduits : ${fmtJours(comptage.jours)} j. Jours fériés et repos non décomptés : ${comptage.feries + comptage.repos}.`}
                  </p>
                ) : (
                  <p className="mt-1 font-semibold text-red-700">
                    Aucun jour ouvrable : tous les jours de la période sont fériés ou repos pour cette catégorie.
                  </p>
                )}
                {typeInfos.debite && comptage.ouvrables > 0 && (
                  <p className="mt-1">
                    {`Solde après prélèvement : ${fmtJours(soldeAvant - comptage.jours)} j`}
                  </p>
                )}
              </>
            ) : (
              <p className="mt-1 text-slate-400">Calcul en cours…</p>
            )}
          </div>
        )}

        <div className="flex justify-end">
          <button className="btn-primary" disabled={saving || !canSubmit}>
            {saving ? 'Enregistrement…' : 'Valider le prélèvement'}
          </button>
        </div>
      </form>
    </div>
  );
}