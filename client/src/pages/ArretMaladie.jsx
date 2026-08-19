import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { fmtJours } from '../utils';
import Field from '../components/Field';
import EmployePicker from '../components/EmployePicker';
import { IconAlert } from '../components/icons';

function nbJours(debut, fin) {
  if (!debut || !fin) return null;
  const d1 = new Date(debut + 'T00:00:00');
  const d2 = new Date(fin + 'T00:00:00');
  if (isNaN(d1) || isNaN(d2) || d2 < d1) return null;
  let count = 0;
  const cur = new Date(d1);
  while (cur <= d2) {
    count += 1;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

export default function ArretMaladie() {
  const [params] = useSearchParams();
  const [selected, setSelected] = useState(null);
  const [numeroBulletin, setNumeroBulletin] = useState('');
  const [certificat, setCertificat] = useState('');
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);
  const [editJours, setEditJours] = useState(false);
  const [joursManuel, setJoursManuel] = useState(null);
  const [doublon, setDoublon] = useState(null);

  const joursAuto = nbJours(dateDebut, dateFin);
  const jours = joursManuel !== null ? joursManuel : joursAuto;
  const joursOk = jours !== null && jours > 0;
  const finOk = !dateDebut || !dateFin || joursAuto !== null;

  useEffect(() => {
    const id = params.get('employe');
    if (id) {
      api.employe(id).then(setSelected).catch(() => {});
    }
  }, [params]);

  useEffect(() => {
    let cancelled = false;
    if (!selected || !dateDebut) {
      setDoublon(null);
      return;
    }
    api.arretsMaladie({ employe: selected.id })
      .then((list) => {
        if (cancelled) return;
        const dup = list.find(
          (x) => x.date_debut === dateDebut && (x.statut === 'en_instance' || x.statut === 'valide')
        );
        setDoublon(dup || null);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selected, dateDebut]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setCreated(null);
    if (!selected) return setError('Veuillez sélectionner un employé.');
    if (!numeroBulletin.trim()) return setError("Le numéro de bulletin d'assurance est obligatoire.");
    if (!joursOk) return setError('La date de fin doit être postérieure ou égale à la date de début.');
    if (doublon) {
      return setError(`Un arrêt maladie existe déjà pour cette date de début (N°${String(doublon.numero_sequentiel).padStart(3, '0')}).`);
    }
    setSaving(true);
    try {
      const a = await api.createArretMaladie({
        employe_id: selected.id,
        numero_bulletin: numeroBulletin,
        certificat,
        date_debut: dateDebut,
        date_fin: dateFin,
        nombre_jours: jours,
      });
      setCreated(a);
      setSelected(null);
      setNumeroBulletin('');
      setCertificat('');
      setDateDebut('');
      setDateFin('');
      setEditJours(false);
      setJoursManuel(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Nouvel arrêt maladie</h2>
        <p className="text-sm text-slate-500">Saisissez l'arrêt de travail d'un employé. Tous les jours du calendrier sont comptés, samedis et dimanches compris. Une fois validé, le solde maladie est déduit automatiquement.</p>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}

      {doublon && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          <span className="mt-0.5 shrink-0"><IconAlert /></span>
          <div>
            <p className="font-semibold">Alerte : arrêt maladie déjà existant pour cette date de début.</p>
            <p className="mt-1">
              {`Un arrêt N°${String(doublon.numero_sequentiel).padStart(3, '0')} (statut : ${doublon.statut}) existe déjà pour le matricule ${selected?.matricule} à la date du ${doublon.date_debut}.`}
            </p>
          </div>
        </div>
      )}

      {created && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-800">
            {`Arrêt maladie N°${String(created.numero_sequentiel).padStart(3, '0')} créé — statut : en instance.`}
          </p>
          <p className="mt-1 text-xs text-emerald-700">
            {`${fmtJours(created.nombre_jours)} jour(s) · ${created.nombre_jours} j seront déduits du solde maladie (actuellement ${fmtJours(created.solde_maladie_a_la_demande)} j) après validation.`}
          </p>
          <div className="mt-3">
            <button className="btn-secondary" onClick={() => setCreated(null)}>Nouvel arrêt</button>
          </div>
        </div>
      )}

      <form onSubmit={submit} className="card space-y-5 p-6">
        <Field label="Matricule" required hint="Le nom, prénom et la catégorie se remplissent automatiquement.">
          <EmployePicker selected={selected} onSelect={setSelected} />
        </Field>

        {selected && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="label">Nom et Prénom</label>
              <input className="input bg-slate-50 text-slate-700" value={`${selected.nom} ${selected.prenom}`} readOnly />
            </div>
            <div>
              <label className="label">Catégorie</label>
              <input className="input bg-slate-50 text-slate-700" value={selected.categorie} readOnly />
            </div>
            <div>
              <label className="label">Matricule</label>
              <input className="input bg-slate-50 text-slate-700" value={selected.matricule} readOnly />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Numéro de bulletin d'assurance" required>
            <input className="input" value={numeroBulletin} onChange={(e) => setNumeroBulletin(e.target.value)} placeholder="Ex. BUL-2026-045" required />
          </Field>
          <Field label="Certificat" hint="Référence / remarque du certificat médical">
            <input className="input" value={certificat} onChange={(e) => setCertificat(e.target.value)} placeholder="Ex. Certificat médical du Dr. X" />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Du (date début)" required>
            <input type="date" className="input" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} required />
          </Field>
          <Field label="Au (date fin, incluse)" required>
            <input type="date" className="input" value={dateFin} onChange={(e) => setDateFin(e.target.value)} required />
          </Field>
          <Field
            label="Nombre de jours"
            required
            hint={editJours ? 'Valeur saisie manuellement.' : 'Calculé automatiquement du jour de début au jour de fin inclus (samedis et dimanches compris).'}
          >
            {editJours ? (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  step={1}
                  className="input"
                  value={joursManuel ?? ''}
                  placeholder="Saisir le nombre de jours"
                  onChange={(e) => setJoursManuel(e.target.value === '' ? null : Number(e.target.value))}
                />
                <button
                  type="button"
                  className="btn-secondary shrink-0"
                  onClick={() => { setEditJours(false); setJoursManuel(null); }}
                >
                  Auto
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  className={`input flex-1 bg-slate-50 ${finOk ? 'text-slate-800' : 'text-red-600'}`}
                  value={joursAuto === null ? '' : `${joursAuto} jour(s)`}
                  readOnly
                />
                <button
                  type="button"
                  className="btn-secondary shrink-0"
                  onClick={() => { setJoursManuel(joursAuto); setEditJours(true); }}
                >
                  Modifier
                </button>
              </div>
            )}
          </Field>
        </div>

        {selected && (
          <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
            {"Solde maladie de l'agent :"} <strong>{fmtJours(selected.solde_maladie)} j</strong> {'(droit annuel : 20 jours payés — déduit uniquement après validation).'}
          </p>
        )}

        <div className="flex justify-end">
          <button className="btn-primary" disabled={saving || (dateDebut && dateFin && !joursOk)}>
            {saving ? 'Enregistrement…' : "Enregistrer l'arrêt maladie"}
          </button>
        </div>
      </form>
    </div>
  );
}