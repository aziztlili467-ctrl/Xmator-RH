import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { today, debutMois, fmtDate } from '../utils';
import { IconBellAlert, IconPrinter, IconTrash, IconAlert } from '../components/icons';

const vide = { matricule: '', nom: '', prenom: '', categorie: '', date_debut: '', date_fin: '', superieur: '' };

// created_at SQLite = « YYYY-MM-DD HH:MM:SS » : on garde la partie date avant l'heure
const fmtHorodatage = (v) => (v ? fmtDate(String(v).split(' ')[0].split('T')[0]) : '—');

export default function NotificationAbsences() {
  const { user } = useAuth();
  const estAdmin = user?.role === 'super_admin';

  // --- Formulaire de notification (super_admin) ---
  const [form, setForm] = useState(vide);
  const [employes, setEmployes] = useState([]);
  const [apercuJours, setApercuJours] = useState(null);
  const [messageApercu, setMessageApercu] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [formError, setFormError] = useState('');
  const [succes, setSucces] = useState(null);

  // --- Journal des notifications ---
  const [fDebut, setFDebut] = useState('');
  const [fFin, setFFin] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // --- Suppression (super_admin) ---
  const [aSupprimer, setASupprimer] = useState(null);
  const [suppression, setSuppression] = useState(false);

  const loadJournal = (d, f) => {
    setLoading(true);
    setError('');
    api.notificationsAbsence({ debut: d || undefined, fin: f || undefined })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadJournal('', '');
    if (estAdmin) {
      api.employes()
        .then((r) => setEmployes(Array.isArray(r) ? r : r.employes || []))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Aperçu du nombre de jours ouvrables (hors repos hebdomadaires et fériés payés) calculé en direct
  useEffect(() => {
    setApercuJours(null);
    setMessageApercu('');
    if (!form.date_debut || !form.date_fin) return;
    if (form.date_fin < form.date_debut) { setMessageApercu('La date de fin doit être postérieure ou égale à la date de début.'); return; }
    const t = setTimeout(() => {
      api.joursOuvrablesAbsence({ debut: form.date_debut, fin: form.date_fin })
        .then((r) => {
          if (r.jours === null) setMessageApercu(r.message || 'Calendrier non configuré.');
          else { setApercuJours(r); setMessageApercu(''); }
        })
        .catch((e) => setMessageApercu(e.message));
    }, 250);
    return () => clearTimeout(t);
  }, [form.date_debut, form.date_fin]);

  const choixMatricule = (v) => {
    const m = String(v).trim();
    const emp = employes.find((e) => String(e.matricule).trim() === m || String(parseInt(m, 10)) === String(parseInt(e.matricule, 10)));
    setForm((f) => ({
      ...f,
      matricule: v,
      nom: emp ? emp.nom : '',
      prenom: emp ? emp.prenom : '',
      categorie: emp && emp.categorie ? emp.categorie : '',
    }));
  };

  const valider = async () => {
    setFormError('');
    setSucces(null);
    if (!form.matricule.trim() || !form.date_debut || !form.date_fin || !form.superieur.trim()) {
      return setFormError('Veuillez renseigner le matricule, les dates d\u2019absence et le nom du supérieur hiérarchique.');
    }
    setEnvoi(true);
    try {
      const r = await api.notifierAbsence({
        matricule: form.matricule,
        date_debut: form.date_debut,
        date_fin: form.date_fin,
        superieur: form.superieur,
      });
      setSucces(r);
      api.printNotificationAbsence(r.notification.id).catch(() => {});
      setForm({ ...vide, superieur: form.superieur });
      setApercuJours(null);
      loadJournal(fDebut, fFin);
    } catch (e) {
      setFormError(e.message);
    } finally {
      setEnvoi(false);
    }
  };

  const supprimer = async () => {
    setSuppression(true);
    try {
      await api.supprimerNotificationAbsence(aSupprimer.id);
      setASupprimer(null);
      loadJournal(fDebut, fFin);
    } catch (e) {
      setError(e.message);
      setASupprimer(null);
    } finally {
      setSuppression(false);
    }
  };

  const employeResolu = form.nom ? `${form.nom} ${form.prenom}` : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Notification d'Absences</h2>
        <p className="text-sm text-slate-500">
          Formulaire rempli par le supérieur hiérarchique ou le responsable RH : déclaration d'une absence par matricule,
          dates de début et de fin, nombre de jours calculé <strong>hors repos hebdomadaires et jours fériés payés</strong>
          {' '}(religieux et nationaux), puis impression officielle en PDF. Le journal des notifications figure ci-dessous.
        </p>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}

      {estAdmin && (
        <div className="card p-4 sm:p-5">
          <div className="mb-4 flex items-center gap-2">
            <span className="text-brand-600"><IconBellAlert /></span>
            <h3 className="text-sm font-bold text-slate-900">Nouvelle notification d'absence</h3>
          </div>

          {formError && (
            <p className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
              <IconAlert /> {formError}
            </p>
          )}

          {succes && (
            <div className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-200">
              <p className="font-semibold">
                Notification N° {String(succes.notification.id).padStart(4, '0')} enregistrée —{' '}
                {succes.notification.nb_jours} jour(s) d'absence pour {succes.notification.nom} {succes.notification.prenom}.
              </p>
              <p className="mt-1 text-xs text-emerald-700">
                {succes.detail.exclus} jour(s) exclus (repos hebdomadaire / fériés payés) sur {succes.detail.total_calendaire} jours
                calendaire{succes.detail.total_calendaire > 1 ? 's' : ''}. Le document PDF a été ouvert dans la boîte d'impression.
              </p>
              <button
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
                onClick={() => api.printNotificationAbsence(succes.notification.id).catch((e) => setFormError(e.message))}
              >
                <IconPrinter /> Réimprimer le formulaire
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">Matricule *</span>
              <input
                className="input"
                list="matricules-absence"
                inputMode="numeric"
                placeholder="ex. 35"
                value={form.matricule}
                onChange={(e) => choixMatricule(e.target.value)}
              />
              <datalist id="matricules-absence">
                {employes.map((e) => (
                  <option key={e.id} value={String(e.matricule)}>{e.nom} {e.prenom}</option>
                ))}
              </datalist>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">Nom et prénom</span>
              <input className="input bg-slate-50" readOnly value={employeResolu || ''} placeholder="— automatique —" />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">Catégorie</span>
              <input className="input bg-slate-50" readOnly value={form.categorie || ''} placeholder="— automatique —" />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">Absence — du *</span>
              <input type="date" className="input" value={form.date_debut} onChange={(e) => setForm((f) => ({ ...f, date_debut: e.target.value }))} />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">Absence — au *</span>
              <input type="date" className="input" value={form.date_fin} min={form.date_debut || undefined} onChange={(e) => setForm((f) => ({ ...f, date_fin: e.target.value }))} />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">Supérieur hiérarchique *</span>
              <input className="input" placeholder="Nom et prénom du supérieur" value={form.superieur} onChange={(e) => setForm((f) => ({ ...f, superieur: e.target.value }))} />
            </label>
          </div>

          <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
            {messageApercu ? (
              <p className="text-sm font-medium text-amber-700">{messageApercu}</p>
            ) : apercuJours ? (
              <p className="text-sm text-slate-600">
                Nombre de jours d'absence :{' '}
                <strong className="text-base text-brand-700">{apercuJours.jours} jour(s)</strong>
                <span className="ml-2 text-xs text-slate-400">
                  ({apercuJours.exclus} jour(s) exclus sur {apercuJours.total_calendaire} calendaires)
                </span>
              </p>
            ) : (
              <p className="text-xs text-slate-400">Sélectionnez les dates d'absence pour calculer le nombre de jours.</p>
            )}
            <button className="btn-primary inline-flex items-center gap-2" onClick={valider} disabled={envoi}>
              <IconPrinter /> {envoi ? 'Validation…' : "Valider & Imprimer en PDF"}
            </button>
          </div>
        </div>
      )}

      {/* ---- Journal des notifications ---- */}
      <div className="card p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Journal des notifications d'absences</h3>
            <p className="mt-1 text-xs text-slate-500">Toutes les opérations enregistrées, de la plus récente à la plus ancienne.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" className="input" value={fDebut} onChange={(e) => { setFDebut(e.target.value); loadJournal(e.target.value, fFin); }} title="Absences à partir du…" />
            <span className="text-slate-400">→</span>
            <input type="date" className="input" value={fFin} onChange={(e) => { setFFin(e.target.value); loadJournal(fDebut, e.target.value); }} title="Absences jusqu'au…" />
          </div>
        </div>

        {data && (
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              {data.totaux.notifications} notification{data.totaux.notifications > 1 ? 's' : ''}
            </span>
            <span className="rounded-lg bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
              {data.totaux.jours} jour(s) d'absence cumulés
            </span>
          </div>
        )}

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-2 py-2">N°</th>
                <th className="px-2 py-2">Saisie le</th>
                <th className="px-2 py-2">Matricule</th>
                <th className="px-2 py-2">Employé</th>
                <th className="px-2 py-2">Catégorie</th>
                <th className="px-2 py-2">Du</th>
                <th className="px-2 py-2">Au</th>
                <th className="px-2 py-2 text-right">Jours</th>
                <th className="px-2 py-2">Supérieur hiérarchique</th>
                <th className="px-2 py-2">Établi par</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {loading && !data && (
                <tr><td colSpan={11} className="px-2 py-6 text-center text-slate-400">Chargement…</td></tr>
              )}
              {data && data.notifications.length === 0 && (
                <tr><td colSpan={11} className="px-2 py-6 text-center text-slate-400">Aucune notification d'absence enregistrée.</td></tr>
              )}
              {data && data.notifications.map((n) => (
                <tr key={n.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-2 py-2 font-mono text-xs text-slate-500">{String(n.id).padStart(4, '0')}</td>
                  <td className="px-2 py-2 whitespace-nowrap text-xs text-slate-500">{fmtHorodatage(n.created_at)}</td>
                  <td className="px-2 py-2 font-mono">{n.matricule}</td>
                  <td className="px-2 py-2 font-medium text-slate-900">{n.nom} {n.prenom}</td>
                  <td className="px-2 py-2 text-xs text-slate-500">{n.categorie || '—'}</td>
                  <td className="px-2 py-2 whitespace-nowrap">{fmtDate(n.date_debut)}</td>
                  <td className="px-2 py-2 whitespace-nowrap">{fmtDate(n.date_fin)}</td>
                  <td className="px-2 py-2 text-right font-bold text-brand-700">{n.nb_jours}</td>
                  <td className="px-2 py-2">{n.superieur}</td>
                  <td className="px-2 py-2 text-xs text-slate-500">{n.cree_par || '—'}</td>
                  <td className="px-2 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        className="rounded-lg p-1.5 text-brand-600 transition hover:bg-brand-50"
                        onClick={() => api.printNotificationAbsence(n.id).catch((e) => setError(e.message))}
                        title="Imprimer le formulaire PDF"
                      >
                        <IconPrinter />
                      </button>
                      {estAdmin && (
                        <button
                          className="rounded-lg p-1.5 text-red-500 transition hover:bg-red-50"
                          onClick={() => setASupprimer(n)}
                          title="Supprimer cette notification"
                        >
                          <IconTrash />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {aSupprimer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !suppression && setASupprimer(null)}>
          <div className="card w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-slate-900">Supprimer la notification N° {String(aSupprimer.id).padStart(4, '0')} ?</h3>
            <p className="mt-2 text-sm text-slate-600">
              Absence de <strong>{aSupprimer.nom} {aSupprimer.prenom}</strong> du {fmtDate(aSupprimer.date_debut)} au{' '}
              {fmtDate(aSupprimer.date_fin)} ({aSupprimer.nb_jours} jour(s)). Cette action est définitive.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setASupprimer(null)} disabled={suppression}>Annuler</button>
              <button
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
                onClick={supprimer}
                disabled={suppression}
              >
                <IconTrash /> {suppression ? 'Suppression…' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
