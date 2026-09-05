import { useEffect, useState } from 'react';
import { api } from '../api';
import { fmtDate, fmtJours } from '../utils';
import BadgeStatut from '../components/BadgeStatut';
import { IconDownload, IconAlert, IconTrash, IconEdit } from '../components/icons';
import { useAuth } from '../AuthContext';

export default function DemandesInstance() {
  const { user } = useAuth();
  const estAdmin = user?.role === 'super_admin';
  const [demandes, setDemandes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filters, setFilters] = useState({ statut: '', employe: '', categorie: '', debut: '', fin: '', search: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [decision, setDecision] = useState(null); // { type: 'accepter'|'rejeter', demande }
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
    api.demandesConge(filters)
      .then(setDemandes)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, [filters]);

  const set = (k, v) => setFilters((f) => ({ ...f, [k]: v }));

  const openDecision = (type, demande) => {
    setDecision({ type, demande });
    setMotifRejet('');
    setDecisionError('');
  };

  const imprimer = async (demande) => {
    setError('');
    try {
      await api.demandePdf(demande.id);
    } catch (e) {
      setError(e.message);
    }
  };

  const submitDecision = async () => {
    setDecisionError('');
    setSaving(true);
    try {
      if (decision.type === 'accepter') {
        await api.accepterDemande(decision.demande.id);
        setSuccess(`Demande N°${String(decision.demande.numero_sequentiel).padStart(3, '0')} acceptée. ${fmtJours(decision.demande.nombre_jours)} j déduits du solde et journalisés.`);
      } else {
        await api.rejeterDemande(decision.demande.id, motifRejet);
        const restauration = decision.demande.statut === 'acceptee' ? ` Solde restauré de ${fmtJours(decision.demande.nombre_jours)} j.` : ' Aucune déduction effectuée.';
        setSuccess(`Demande N°${String(decision.demande.numero_sequentiel).padStart(3, '0')} rejetée.${restauration}`);
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
      await api.supprimerDemande(aSupprimer.id);
      const msgRestauration = aSupprimer.statut === 'acceptee' ? ` Solde restauré de ${fmtJours(aSupprimer.nombre_jours)} j.` : '';
      setSuccess(`Demande N°${String(aSupprimer.numero_sequentiel).padStart(3, '0')} supprimée.${msgRestauration}`);
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Demandes de congé</h2>
          <p className="text-sm text-slate-500">Workflow de validation — {demandes.length} demande(s) affichée(s)</p>
        </div>
      </div>

      {success && <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700 ring-1 ring-emerald-200">{success}</p>}
      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}

      <div className="card p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <select className="input" value={filters.statut} onChange={(e) => set('statut', e.target.value)}>
            <option value="">Tous les statuts</option>
            <option value="en_instance">En instance</option>
            <option value="acceptee">Acceptée</option>
            <option value="rejetee">Rejetée</option>
          </select>
          <input className="input" placeholder="Recherche (matricule, nom…)" value={filters.search} onChange={(e) => set('search', e.target.value)} />
          <select className="input" value={filters.categorie} onChange={(e) => set('categorie', e.target.value)}>
            <option value="">Toutes les catégories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.libelle}</option>)}
          </select>
          <div className="flex items-center gap-2">
            <input type="date" className="input" value={filters.debut} onChange={(e) => set('debut', e.target.value)} />
            <span className="text-slate-400">→</span>
            <input type="date" className="input" value={filters.fin} onChange={(e) => set('fin', e.target.value)} />
          </div>
          <button className="btn-secondary" onClick={() => setFilters({ statut: '', employe: '', categorie: '', debut: '', fin: '', search: '' })}>
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
                <th className="px-5 py-3">Nature</th>
                <th className="px-5 py-3">Dates</th>
                <th className="px-5 py-3 text-end">Jours</th>
                <th className="px-5 py-3 text-end">Solde à la demande</th>
                <th className="px-5 py-3">Statut</th>
                <th className="px-5 py-3 text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="px-5 py-10 text-center text-slate-500">Chargement…</td></tr>
              ) : demandes.length === 0 ? (
                <tr><td colSpan={9} className="px-5 py-10 text-center text-slate-500">Aucune demande ne correspond aux filtres.</td></tr>
              ) : (
                demandes.map((d) => (
                  <tr key={d.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-5 py-3 font-mono font-semibold text-brand-700">{String(d.numero_sequentiel).padStart(3, '0')}</td>
                    <td className="px-5 py-3 font-mono text-slate-600">{d.matricule}</td>
                    <td className="px-5 py-3 font-semibold text-slate-800">{d.nom_prenom}</td>
                    <td className="px-5 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${d.nature_conge === 'legal' ? 'bg-slate-100 text-slate-600' : 'bg-purple-50 text-purple-700'}`}>
                        {d.nature_conge === 'legal' ? 'Légal' : 'Exceptionnel'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {fmtDate(d.date_demande)} · {fmtDate(d.date_debut)} → {fmtDate(d.date_fin)}
                    </td>
                    <td className="px-5 py-3 text-end font-semibold text-slate-800">{fmtJours(d.nombre_jours)}</td>
                    <td className="px-5 py-3 text-end text-slate-600">{fmtJours(d.solde_a_la_demande)} j</td>
                    <td className="px-5 py-3">
                      <BadgeStatut statut={d.statut} />
                      {d.statut === 'rejetee' && d.motif_rejet && (
                        <p className="mt-1 max-w-full sm:w-[160px] text-[11px] text-slate-500" title={d.motif_rejet}>{d.motif_rejet}</p>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          className="rounded-md px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100"
                          onClick={() => imprimer(d)}
                          title="PDF"
                        >
                          <IconDownload />
                        </button>
                        {d.statut === 'en_instance' && (
                          <>
                            <button className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700" onClick={() => openDecision('accepter', d)}>
                              Accepter
                            </button>
                            <button className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700" onClick={() => openDecision('rejeter', d)}>
                              Refuser
                            </button>
                          </>
                        )}
                        {d.statut === 'acceptee' && (
                          <button
                            className="inline-flex items-center gap-1 rounded-md bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-700"
                            onClick={() => openDecision('rejeter', d)}
                            title="Modifier : repasser en rejetée (restaure le solde)"
                          >
                            <IconEdit /> Modifier
                          </button>
                        )}
                        {d.statut === 'rejetee' && (
                          <button
                            className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                            onClick={() => openDecision('accepter', d)}
                            title="Modifier : repasser en acceptée"
                          >
                            <IconEdit /> Modifier
                          </button>
                        )}
                        <button
                          className="rounded-md p-1.5 text-red-500 transition hover:bg-red-50"
                          onClick={() => setASupprimer(d)}
                          title="Supprimer cette demande"
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
                {decision.type === 'accepter'
                  ? (decision.demande.statut === 'rejetee' ? 'Modifier : accepter la demande' : 'Accepter la demande')
                  : (decision.demande.statut === 'acceptee' ? 'Modifier : rejeter la demande' : 'Rejeter la demande')}
              </h3>
              <button onClick={() => setDecision(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <div className="space-y-4">
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                N° {String(decision.demande.numero_sequentiel).padStart(3, '0')} — {decision.demande.nom_prenom} · {fmtJours(decision.demande.nombre_jours)} jour(s)
                {decision.demande.statut !== 'en_instance' && (
                  <span className="ml-1 text-xs text-slate-400">(actuellement : {decision.demande.statut === 'acceptee' ? 'acceptée' : 'rejetée'})</span>
                )}
              </p>

              {decision.type === 'accepter' ? (
                <div className="flex items-start gap-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
                  <span className="mt-0.5 shrink-0"><IconAlert /></span>
                  <p>
                    {decision.demande.statut === 'rejetee'
                      ? `Cette demande est actuellement rejetée : l'acceptation déduira ${fmtJours(decision.demande.nombre_jours)} j du solde et créera une ligne au journal.`
                      : `L'acceptation déduira ${fmtJours(decision.demande.nombre_jours)} j du solde de l'agent et créera automatiquement une ligne dans le journal des mouvements.`}
                  </p>
                </div>
              ) : (
                <div>
                  {decision.demande.statut === 'acceptee' && (
                    <div className="mb-3 flex items-start gap-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
                      <span className="mt-0.5 shrink-0"><IconAlert /></span>
                      <p>Cette demande est actuellement <strong>acceptée</strong> ({fmtJours(decision.demande.nombre_jours)} j déjà déduits) : le rejet <strong>restaurera {fmtJours(decision.demande.nombre_jours)} j</strong> au solde de l'agent.</p>
                    </div>
                  )}
                  <label className="label">Motif du rejet (optionnel)</label>
                  <textarea className="input" rows={2} value={motifRejet} onChange={(e) => setMotifRejet(e.target.value)} placeholder="Ex. Solde insuffisant, motif non couvert…" />
                  {decision.demande.statut !== 'acceptee' && <p className="mt-2 text-xs text-slate-400">Aucune déduction ne sera effectuée sur le solde.</p>}
                </div>
              )}

              {decisionError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{decisionError}</p>}

              <div className="flex justify-end gap-2">
                <button className="btn-secondary" onClick={() => setDecision(null)}>Annuler</button>
                <button
                  className={decision.type === 'accepter' ? 'btn-primary' : 'rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700'}
                  disabled={saving}
                  onClick={submitDecision}
                >
                  {saving ? 'Traitement…' : decision.type === 'accepter' ? (decision.demande.statut === 'rejetee' ? "Confirmer la modification" : "Confirmer l'acceptation") : (decision.demande.statut === 'acceptee' ? 'Confirmer la modification' : 'Confirmer le rejet')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {aSupprimer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overscroll-contain bg-black/40 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:p-4" onClick={() => !suppression && setASupprimer(null)}>
          <div className="card modal-shell w-full max-w-md p-4 sm:p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-slate-900">Supprimer la demande N° {String(aSupprimer.numero_sequentiel).padStart(3, '0')} ?</h3>
            <p className="mt-2 text-sm text-slate-600">
              Demande de <strong>{aSupprimer.nom_prenom}</strong> ({aSupprimer.matricule}) du {fmtDate(aSupprimer.date_debut)} au {fmtDate(aSupprimer.date_fin)} — {fmtJours(aSupprimer.nombre_jours)} jour(s), statut : <strong>{aSupprimer.statut}</strong>.
              {aSupprimer.statut === 'acceptee' && (
                <span className="mt-2 block rounded bg-amber-50 px-2 py-1 text-amber-700">Le solde de l'agent sera restauré de {fmtJours(aSupprimer.nombre_jours)} j.</span>
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
