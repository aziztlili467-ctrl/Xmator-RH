import { useEffect, useState } from 'react';
import { api } from '../api';
import { fmtDate, fmtJours } from '../utils';
import BadgeStatut from '../components/BadgeStatut';
import { IconAlert, IconTrash, IconEdit } from '../components/icons';
import { useAuth } from '../AuthContext';

export default function ArretsMaladieInstance() {
  const { user } = useAuth();
  const estAdmin = user?.role === 'super_admin';
  const [arrets, setArrets] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filters, setFilters] = useState({ statut: '', categorie: '', search: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [decision, setDecision] = useState(null); // { type: 'valider'|'rejeter', arret }
  const [motifRejet, setMotifRejet] = useState('');
  const [decisionError, setDecisionError] = useState('');
  const [saving, setSaving] = useState(false);

  const [aSupprimer, setASupprimer] = useState(null);
  const [suppression, setSuppression] = useState(false);

  useEffect(() => {
    api.categories().then(setCategories).catch(() => {});
  }, []);

  const load = () => {
    setLoading(true);
    api.arretsMaladie(filters)
      .then(setArrets)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, [filters]);

  const set = (k, v) => setFilters((f) => ({ ...f, [k]: v }));

  const openDecision = (type, arret) => {
    setDecision({ type, arret });
    setMotifRejet('');
    setDecisionError('');
  };

  const submitDecision = async () => {
    setDecisionError('');
    setSaving(true);
    try {
      if (decision.type === 'valider') {
        await api.validerArretMaladie(decision.arret.id);
        setSuccess(`Arrêt N°${String(decision.arret.numero_sequentiel).padStart(3, '0')} validé. ${fmtJours(decision.arret.nombre_jours)} j déduits du solde maladie et journalisés.`);
      } else {
        await api.rejeterArretMaladie(decision.arret.id, motifRejet);
        const restauration = decision.arret.statut === 'valide' ? ` Solde maladie restauré de ${fmtJours(decision.arret.nombre_jours)} j.` : " L'employé est considéré comme absent.";
        setSuccess(`Arrêt N°${String(decision.arret.numero_sequentiel).padStart(3, '0')} rejeté.${restauration}`);
      }
      setDecision(null);
      load();
    } catch (err) {
      setDecisionError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const confirmerSuppression = async () => {
    setSuppression(true);
    setError('');
    try {
      await api.supprimerArretMaladie(aSupprimer.id);
      const msgRestauration = aSupprimer.statut === 'valide' ? ` Solde maladie restauré de ${fmtJours(aSupprimer.nombre_jours)} j.` : '';
      setSuccess(`Arrêt N°${String(aSupprimer.numero_sequentiel).padStart(3, '0')} supprimé.${msgRestauration}`);
      setASupprimer(null);
      load();
    } catch (e) {
      setError(e.message);
      setASupprimer(null);
    } finally {
      setSuppression(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Arrêts maladie</h2>
        <p className="text-sm text-slate-500">{`Workflow de validation — ${arrets.length} arrêt(s) affiché(s). Validé → solde maladie déduit. Rejeté → l'employé est considéré comme absent.`}</p>
      </div>

      {success && <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700 ring-1 ring-emerald-200">{success}</p>}
      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}

      <div className="card p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <select className="input" value={filters.statut} onChange={(e) => set('statut', e.target.value)}>
            <option value="">Tous les statuts</option>
            <option value="en_instance">En instance</option>
            <option value="valide">Validé</option>
            <option value="rejete">Rejeté</option>
          </select>
          <input className="input" placeholder="Recherche (matricule, nom, bulletin…)" value={filters.search} onChange={(e) => set('search', e.target.value)} />
          <select className="input" value={filters.categorie} onChange={(e) => set('categorie', e.target.value)}>
            <option value="">Toutes les catégories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.libelle}</option>)}
          </select>
          <button className="btn-secondary" onClick={() => setFilters({ statut: '', categorie: '', search: '' })}>
            Réinitialiser les filtres
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="table-wrap">
          <table className="w-max-table text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-start text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3">N°</th>
                <th className="px-5 py-3">Matricule</th>
                <th className="px-5 py-3">Nom et prénom</th>
                <th className="px-5 py-3">Catégorie</th>
                <th className="px-5 py-3">Bulletin assurance</th>
                <th className="px-5 py-3">Certificat</th>
                <th className="px-5 py-3">Dates</th>
                <th className="px-5 py-3 text-end">Jours</th>
                <th className="px-5 py-3 text-end">Solde maladie</th>
                <th className="px-5 py-3">Statut</th>
                <th className="px-5 py-3 text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={11} className="px-5 py-10 text-center text-slate-500">Chargement…</td></tr>
              ) : arrets.length === 0 ? (
                <tr><td colSpan={11} className="px-5 py-10 text-center text-slate-500">Aucun arrêt maladie ne correspond aux filtres.</td></tr>
              ) : (
                arrets.map((a) => (
                  <tr key={a.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-5 py-3 font-mono font-semibold text-rose-600">{String(a.numero_sequentiel).padStart(3, '0')}</td>
                    <td className="px-5 py-3 font-mono text-slate-600">{a.matricule}</td>
                    <td className="px-5 py-3 font-semibold text-slate-800">{a.nom_prenom}</td>
                    <td className="px-5 py-3 text-slate-500">{a.categorie}</td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-600">{a.numero_bulletin}</td>
                    <td className="max-w-full sm:w-[160px] truncate px-5 py-3 text-slate-500" title={a.certificat}>{a.certificat || '—'}</td>
                    <td className="px-5 py-3 text-slate-600">{fmtDate(a.date_debut)} → {fmtDate(a.date_fin)}</td>
                    <td className="px-5 py-3 text-end font-semibold text-rose-600">{fmtJours(a.nombre_jours)}</td>
                    <td className="px-5 py-3 text-end text-slate-600">{fmtJours(a.solde_maladie_a_la_demande)} j</td>
                    <td className="px-5 py-3">
                      <BadgeStatut statut={a.statut} />
                      {a.statut === 'rejete' && a.motif_rejet && (
                        <p className="mt-1 max-w-full sm:w-[160px] text-[11px] text-slate-500" title={a.motif_rejet}>{a.motif_rejet}</p>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {a.statut === 'en_instance' && (
                          <>
                            <button className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700" onClick={() => openDecision('valider', a)}>
                              Valider
                            </button>
                            <button className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700" onClick={() => openDecision('rejeter', a)}>
                              Rejeter
                            </button>
                          </>
                        )}
                        {a.statut === 'valide' && (
                          <button
                            className="inline-flex items-center gap-1 rounded-md bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-700"
                            onClick={() => openDecision('rejeter', a)}
                            title="Modifier : repasser en rejeté (restaure le solde maladie)"
                          >
                            <IconEdit /> Modifier
                          </button>
                        )}
                        {a.statut === 'rejete' && (
                          <button
                            className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                            onClick={() => openDecision('valider', a)}
                            title="Modifier : repasser en validé"
                          >
                            <IconEdit /> Modifier
                          </button>
                        )}
                        <button
                          className="rounded-md p-1.5 text-red-500 transition hover:bg-red-50"
                          onClick={() => setASupprimer(a)}
                          title="Supprimer cet arrêt"
                        >
                          <IconTrash />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {decision && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overscroll-contain bg-slate-900/40 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:p-4" onMouseDown={() => setDecision(null)}>
          <div className="card modal-shell w-full max-w-md p-4 sm:p-6" onMouseDown={(e) => e.stopPropagation()}>
            <div className={`mb-4 flex items-center justify-between ${decision.type === 'rejeter' ? 'text-red-700' : 'text-slate-900'}`}>
              <h3 className="text-base font-bold">
                {decision.type === 'valider'
                  ? (decision.arret.statut === 'rejete' ? "Modifier : valider l'arrêt maladie" : "Valider l'arrêt maladie")
                  : (decision.arret.statut === 'valide' ? "Modifier : rejeter l'arrêt maladie" : "Rejeter l'arrêt maladie")}
              </h3>
              <button onClick={() => setDecision(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <div className="space-y-4">
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                {`N° ${String(decision.arret.numero_sequentiel).padStart(3, '0')} — ${decision.arret.nom_prenom} · ${fmtJours(decision.arret.nombre_jours)} jour(s) · Bulletin ${decision.arret.numero_bulletin}`}
                {decision.arret.statut !== 'en_instance' && (
                  <span className="ml-1 text-xs text-slate-400">(actuellement : {decision.arret.statut === 'valide' ? 'validé' : 'rejeté'})</span>
                )}
              </p>

              {decision.type === 'valider' ? (
                <div className="flex items-start gap-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
                  <span className="mt-0.5 shrink-0"><IconAlert /></span>
                  <p>
                    {decision.arret.statut === 'rejete'
                      ? `Cet arrêt est actuellement rejeté : la validation déduira ${fmtJours(decision.arret.nombre_jours)} j du solde maladie et créera un mouvement (type Maladie). L'événement d'absence et le code A1 seront supprimés.`
                      : `La validation déduira ${fmtJours(decision.arret.nombre_jours)} j du solde maladie de l'agent et créera un mouvement dans le journal (type : Maladie).`}
                  </p>
                </div>
              ) : (
                <div>
                  {decision.arret.statut === 'valide' && (
                    <div className="mb-3 flex items-start gap-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
                      <span className="mt-0.5 shrink-0"><IconAlert /></span>
                      <p>Cet arrêt est actuellement <strong>validé</strong> ({fmtJours(decision.arret.nombre_jours)} j déjà déduits) : le rejet <strong>restaurera {fmtJours(decision.arret.nombre_jours)} j</strong> au solde maladie et basculera le code RMA de <strong>MA → A1</strong>.</p>
                    </div>
                  )}
                  <label className="label">Motif du rejet (optionnel)</label>
                  <textarea className="input" rows={2} value={motifRejet} onChange={(e) => setMotifRejet(e.target.value)} placeholder="Ex. Certificat non conforme" />
                  {decision.arret.statut !== 'valide' && (
                    <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                      {"L'employé sera considéré comme absent : un événement « Absence » sera journalisé (aucune déduction du solde maladie)."}
                    </p>
                  )}
                </div>
              )}

              {decisionError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{decisionError}</p>}

              <div className="flex justify-end gap-2">
                <button className="btn-secondary" onClick={() => setDecision(null)}>Annuler</button>
                <button
                  className={decision.type === 'valider' ? 'btn-primary' : 'rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700'}
                  disabled={saving}
                  onClick={submitDecision}
                >
                  {saving ? 'Traitement…' : decision.type === 'valider' ? (decision.arret.statut === 'rejete' ? 'Confirmer la modification' : 'Confirmer la validation') : (decision.arret.statut === 'valide' ? 'Confirmer la modification' : 'Confirmer le rejet')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {aSupprimer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overscroll-contain bg-black/40 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:p-4" onClick={() => !suppression && setASupprimer(null)}>
          <div className="card modal-shell w-full max-w-md p-4 sm:p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-slate-900">Supprimer l'arrêt N° {String(aSupprimer.numero_sequentiel).padStart(3, '0')} ?</h3>
            <p className="mt-2 text-sm text-slate-600">
              Arrêt de <strong>{aSupprimer.nom_prenom}</strong> ({aSupprimer.matricule}) du {fmtDate(aSupprimer.date_debut)} au {fmtDate(aSupprimer.date_fin)} — {fmtJours(aSupprimer.nombre_jours)} jour(s), statut : <strong>{aSupprimer.statut}</strong>, bulletin {aSupprimer.numero_bulletin}.
              {aSupprimer.statut === 'valide' && (
                <span className="mt-2 block rounded bg-amber-50 px-2 py-1 text-amber-700">Le solde maladie sera restauré de {fmtJours(aSupprimer.nombre_jours)} j et les codes RMA MA supprimés.</span>
              )}
              {aSupprimer.statut === 'rejete' && (
                <span className="mt-2 block rounded bg-slate-50 px-2 py-1 text-slate-600">L'événement d'absence et le code A1 seront supprimés.</span>
              )}
              Cette action est définitive.
            </p>
            {!estAdmin && <p className="mt-2 text-xs text-red-600">La suppression est réservée au super admin.</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setASupprimer(null)} disabled={suppression}>Annuler</button>
              <button
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
                onClick={confirmerSuppression}
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
