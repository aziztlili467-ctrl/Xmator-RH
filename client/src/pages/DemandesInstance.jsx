import { useEffect, useState } from 'react';
import { api } from '../api';
import { fmtDate, fmtJours } from '../utils';
import BadgeStatut from '../components/BadgeStatut';
import { IconDownload, IconAlert } from '../components/icons';

export default function DemandesInstance() {
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
        setSuccess(`Demande N°${String(decision.demande.numero_sequentiel).padStart(3, '0')} rejetée. Aucune déduction effectuée.`);
      }
      setDecision(null);
      load();
    } catch (err) {
      setDecisionError(err.message);
    } finally {
      setSaving(false);
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
                        <p className="mt-1 max-w-[160px] text-[11px] text-slate-500" title={d.motif_rejet}>{d.motif_rejet}</p>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onMouseDown={() => setDecision(null)}>
          <div className="card max-h-[90vh] w-full max-w-md overflow-auto p-6" onMouseDown={(e) => e.stopPropagation()}>
            <div className={`mb-4 flex items-center justify-between ${decision.type === 'rejeter' ? 'text-red-700' : 'text-slate-900'}`}>
              <h3 className="text-base font-bold">
                {decision.type === 'accepter' ? "Accepter la demande" : "Rejeter la demande"}
              </h3>
              <button onClick={() => setDecision(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <div className="space-y-4">
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                N° {String(decision.demande.numero_sequentiel).padStart(3, '0')} — {decision.demande.nom_prenom} · {fmtJours(decision.demande.nombre_jours)} jour(s)
              </p>

              {decision.type === 'accepter' ? (
                <div className="flex items-start gap-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
                  <span className="mt-0.5 shrink-0"><IconAlert /></span>
                  <p>
                    L'acceptation déduira {fmtJours(decision.demande.nombre_jours)} j du solde de l'agent et créera automatiquement une ligne dans le journal des mouvements. Le solde affiché se mettra à jour immédiatement.
                  </p>
                </div>
              ) : (
                <div>
                  <label className="label">Motif du rejet (optionnel)</label>
                  <textarea className="input" rows={2} value={motifRejet} onChange={(e) => setMotifRejet(e.target.value)} placeholder="Ex. Solde insuffisant, motif non couvert…" />
                  <p className="mt-2 text-xs text-slate-400">Aucune déduction ne sera effectuée sur le solde.</p>
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
                  {saving ? 'Traitement…' : decision.type === 'accepter' ? "Confirmer l'acceptation" : 'Confirmer le rejet'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}