import { useEffect, useState } from 'react';
import { api } from '../api';
import { fmtDate, fmtJours, today } from '../utils';
import Field from '../components/Field';
import EmployePicker from '../components/EmployePicker';
import { IconDownload, IconAlert } from '../components/icons';

function nbJours(debut, fin) {
  if (!debut || !fin) return null;
  const d1 = new Date(debut + 'T00:00:00');
  const d2 = new Date(fin + 'T00:00:00');
  if (isNaN(d1) || isNaN(d2) || d2 < d1) return null;
  let count = 0;
  const cur = new Date(d1);
  while (cur <= d2) {
    const wd = cur.getDay();
    if (wd !== 0 && wd !== 6) count += 1;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

export default function NouvelleDemande() {
  const [selected, setSelected] = useState(null);
  const [nature, setNature] = useState('legal');
  const [dateDemande, setDateDemande] = useState(today());
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');
  const [direction, setDirection] = useState('Amicale');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);
  const [editJours, setEditJours] = useState(false);
  const [joursManuel, setJoursManuel] = useState(null);
  const [demiFin, setDemiFin] = useState(false);
  const [doublon, setDoublon] = useState(null);

  const joursAutoBrut = nbJours(dateDebut, dateFin);
  // Demi-journée cochée : la date de fin compte pour 0,5 (ex. : 3 jours ouvrables → 2,5)
  const joursAuto = joursAutoBrut !== null && demiFin ? Math.max(joursAutoBrut - 0.5, 0.5) : joursAutoBrut;
  const jours = joursManuel !== null ? joursManuel : joursAuto;
  const joursOk = jours !== null && jours > 0;
  const finOk = !dateDebut || !dateFin || joursAuto !== null;

  useEffect(() => {
    let cancelled = false;
    if (!selected || !dateDebut) {
      setDoublon(null);
      return;
    }
    api.demandesConge({ employe: selected.id })
      .then((list) => {
        if (cancelled) return;
        const dup = list.find(
          (x) => x.date_debut === dateDebut && (x.statut === 'en_instance' || x.statut === 'acceptee')
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
    if (!joursOk) return setError('La date de fin doit être postérieure ou égale à la date de début.');
    if (doublon) {
      return setError(`Une demande existe déjà pour cette date de départ (N°${String(doublon.numero_sequentiel).padStart(3, '0')}). Choisissez une autre date ou consultez le module des demandes.`);
    }
    setSaving(true);
    try {
      const d = await api.createDemandeConge({
        employe_id: selected.id,
        nature_conge: nature,
        date_demande: dateDemande,
        date_debut: dateDebut,
        date_fin: dateFin,
        direction,
        nombre_jours: jours,
        demi_journee: demiFin ? 1 : 0,
      });
      setCreated(d);
      setSelected(null);
      setDateDebut('');
      setDateFin('');
      setDateDemande(today());
      setEditJours(false);
      setJoursManuel(null);
      setDemiFin(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const imprimer = async (demande) => {
    setError('');
    try {
      await api.demandePdf(demande.id);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Nouvelle Demande de Congé</h2>
        <p className="text-sm text-slate-500">
          Générez une demande officielle. Le numéro séquentiel est attribué automatiquement par le serveur. Les samedis et dimanches ne sont pas comptés. Pour une demi-journée, cochez « Dernier jour en demi-journée » : la date de fin compte pour 0,5 (ex. : du lundi au mercredi coché = 2,5 jours). Déduits du solde uniquement après acceptation.
        </p>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}

      {doublon && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          <span className="mt-0.5 shrink-0"><IconAlert /></span>
          <div>
            <p className="font-semibold">Alerte : demande déjà existante pour cette date de départ.</p>
            <p className="mt-1">
              Une demande N°{String(doublon.numero_sequentiel).padStart(3, '0')} (statut : {doublon.statut}) existe déjà pour le matricule {selected?.matricule} avec une date de départ au {fmtDate(doublon.date_debut)}. Le blocage empêche la double soumission par erreur.
            </p>
          </div>
        </div>
      )}

      {created && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-800">
            Demande N°{String(created.numero_sequentiel).padStart(3, '0')} créée avec succès — statut : en instance.
          </p>
          <div className="mt-3 flex gap-2">
            <button className="btn-primary" onClick={() => imprimer(created)}>
              <IconDownload /> Imprimer / PDF
            </button>
            <button className="btn-secondary" onClick={() => setCreated(null)}>Nouvelle demande</button>
          </div>
        </div>
      )}

      <form onSubmit={submit} className="card space-y-5 p-6">
        <Field label="Matricule" required hint="Le nom et prénom se remplissent automatiquement.">
          <EmployePicker selected={selected} onSelect={setSelected} />
        </Field>

        {selected && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="label">Nom et Prénom</label>
              <input className="input bg-slate-50 text-slate-700" value={`${selected.nom} ${selected.prenom}`} readOnly />
            </div>
            <div>
              <label className="label">Direction</label>
              <input className="input" value={direction} onChange={(e) => setDirection(e.target.value)} />
            </div>
            <div>
              <label className="label">Matricule</label>
              <input className="input bg-slate-50 text-slate-700" value={selected.matricule} readOnly />
            </div>
          </div>
        )}

        <Field label="Date de la demande" required>
          <input type="date" className="input sm:max-w-xs" value={dateDemande} onChange={(e) => setDateDemande(e.target.value)} required />
        </Field>

        <div>
          <label className="label">Nature du congé *</label>
          <div className="flex gap-4">
            {[
              { v: 'legal', l: 'Légal' },
              { v: 'exceptionnel', l: 'Exceptionnel' },
            ].map((o) => (
              <label
                key={o.v}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold transition ${
                  nature === o.v ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="nature"
                  className="accent-brand-700"
                  checked={nature === o.v}
                  onChange={() => setNature(o.v)}
                />
                {o.l}
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Du (date début)" required>
            <input type="date" className="input" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} required />
          </Field>
          <Field label="Au (date fin, incluse)" required>
            <input type="date" className="input" value={dateFin} onChange={(e) => setDateFin(e.target.value)} required />
            <label className="mt-1.5 flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600">
              <input
                type="checkbox"
                className="h-4 w-4 accent-violet-600"
                checked={demiFin}
                onChange={(e) => setDemiFin(e.target.checked)}
              />
              Dernier jour en demi-journée (0,5)
            </label>
          </Field>
          <Field
            label="Nombre de jours"
            required
            hint={editJours ? 'Valeur manuelle par pas de 0,5 — demi-journée : 0,5 · deux jours et demi : 2,5.' : 'Calculé automatiquement hors samedis et dimanches ; tient compte de la case « dernier jour en demi-journée ».'}
          >
            {editJours ? (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0.5}
                  step={0.5}
                  className="input"
                  value={joursManuel ?? ''}
                  placeholder="Ex. : 0,5 · 1 · 2,5"
                  onChange={(e) => {
                    const v = e.target.value === '' ? null : Number(e.target.value);
                    setJoursManuel(v);
                    // Cohérence : valeur fractionnaire => la case « dernier jour en demi-journée » se coche automatiquement
                    if (v !== null) setDemiFin(!Number.isInteger(v));
                  }}
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
                  value={joursAuto === null ? '' : `${fmtJours(joursAuto)} jour(s)`}
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
            Solde de l'agent à la date de la demande : {fmtJours(selected.solde)} j (à titre indicatif — déduit uniquement après validation).
          </p>
        )}

        <div className="flex justify-end">
          <button className="btn-primary" disabled={saving || (dateDebut && dateFin && !joursOk)}>
            {saving ? 'Génération…' : 'Générer la demande'}
          </button>
        </div>
      </form>
    </div>
  );
}