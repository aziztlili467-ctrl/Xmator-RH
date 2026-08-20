import { useEffect, useState } from 'react';
import { api } from '../api';
import { fmtDate, fmtJours } from '../utils';
import BadgeStatut from '../components/BadgeStatut';
import { IconAlert } from '../components/icons';

export default function ArretsMaladieInstance() {
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
        const a = await api.validerArretMaladie(decision.arret.id);
        setSuccess(`Arrêt N°${String(decision.arret.numero_sequentiel).padStart(3, '0')} validé. ${fmtJours(decision.arret.nombre_jours)} j déduits du solde maladie et journalisés.`);
      } else {
        await api.rejeterArretMaladie(decision.arret.id, motifRejet);
        setSuccess(`Arrêt N°${String(decision.arret.numero_sequentiel).padStart(3, '0')} rejeté. L'employé est considéré comme absent — événement journalisé.`);
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
                    <td className="max-w-[160px] truncate px-5 py-3 text-slate-500" title={a.certificat}>{a.certificat || '—'}</td>
                    <td className="px-5 py-3 text-slate-600">{fmtDate(a.date_debut)} → {fmtDate(a.date_fin)}</td>
                    <td className="px-5 py-3 text-end font-semibold text-rose-600">{fmtJours(a.nombre_jours)}</td>
                    <td className="px-5 py-3 text-end text-slate-600">{fmtJours(a.solde_maladie_a_la_demande)} j</td>
                    <td className="px-5 py-3">
                      <BadgeStatut statut={a.statut} />
                      {a.statut === 'rejete' && a.motif_rejet && (
                        <p className="mt-1 max-w-[160px] text-[11px] text-slate-500" title={a.motif_rejet}>{a.motif_rejet}</p>
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
                {decision.type === 'valider' ? "Valider l'arrêt maladie" : "Rejeter l'arrêt maladie"}
              </h3>
              <button onClick={() => setDecision(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <div className="space-y-4">
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                {`N° ${String(decision.arret.numero_sequentiel).padStart(3, '0')} — ${decision.arret.nom_prenom} · ${fmtJours(decision.arret.nombre_jours)} jour(s) · Bulletin ${decision.arret.numero_bulletin}`}
              </p>

              {decision.type === 'valider' ? (
                <div className="flex items-start gap-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
                  <span className="mt-0.5 shrink-0"><IconAlert /></span>
                  <p>{`La validation déduira ${fmtJours(decision.arret.nombre_jours)} j du solde maladie de l'agent et créera un mouvement dans le journal (type : Maladie).`}</p>
                </div>
              ) : (
                <div>
                  <label className="label">Motif du rejet (optionnel)</label>
                  <textarea className="input" rows={2} value={motifRejet} onChange={(e) => setMotifRejet(e.target.value)} placeholder="Ex. Certificat non conforme" />
                  <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                    {"L'employé sera considéré comme absent : un événement « Absence » sera journalisé (aucune déduction du solde maladie)."}
                  </p>
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
                  {saving ? 'Traitement…' : decision.type === 'valider' ? 'Confirmer la validation' : 'Confirmer le rejet'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}