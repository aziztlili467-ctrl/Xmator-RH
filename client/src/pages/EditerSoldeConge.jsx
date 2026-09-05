import { useEffect, useState } from 'react';
import { api } from '../api';
import { fmtDate, fmtJours, today } from '../utils';
import Field from '../components/Field';
import EmployePicker from '../components/EmployePicker';
import BadgeType from '../components/BadgeType';
import { IconEdit, IconTrash, IconPlus } from '../components/icons';

function Modal({ title, children, onClose, danger }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overscroll-contain bg-slate-900/40 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:p-4" onMouseDown={onClose}>
      <div className="card modal-shell w-full max-w-lg p-4 sm:p-6" onMouseDown={(e) => e.stopPropagation()}>
        <div className={`mb-4 flex items-center justify-between ${danger ? 'text-red-700' : 'text-slate-900'}`}>
          <h3 className="text-base font-bold">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function EditerSoldeConge() {
  const [mode, setMode] = useState('individuel');
  const [selected, setSelected] = useState(null);
  const [emp, setEmp] = useState(null);
  const [movements, setMovements] = useState([]);
  const [categories, setCategories] = useState([]);
  const [categorie, setCategorie] = useState('');
  const [preview, setPreview] = useState(null);

  // Formulaire de dotation (individuel)
  const [form, setForm] = useState({ type_operation: 'ajout_annuel', date_debut: today(), date_fin: today(), jours: '', motif: '' });
  // Formulaire de dotation en masse
  const [massForm, setMassForm] = useState({ type_operation: 'ajout_annuel', date_debut: today(), date_fin: today(), jours: '', motif: '' });

  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [delTarget, setDelTarget] = useState(null);
  const [clearTarget, setClearTarget] = useState(null); // { employe } | { categorie_id, categorie_label, count }

  const [saving, setSaving] = useState(false);
  const [loadingEmp, setLoadingEmp] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    api.categories().then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    setPreview(null);
    if (mode === 'masse') {
      api.employes({ categorie }).then((list) => setPreview(list)).catch(() => {});
    }
  }, [mode, categorie]);

  // Synchronisation temps réel avec le journal RMA : toute modification / rectification / ajout /
  // suppression de congés dans le journal RMA recharge immédiatement le journal de l'employé ouvert,
  // y compris quand on revient sur cet onglet après avoir modifié les données ailleurs.
  useEffect(() => {
    const cb = () => { if (selected) loadEmp(selected); };
    const vis = () => { if (document.visibilityState === 'visible' && selected) loadEmp(selected); };
    window.addEventListener('rh:solde-changed', cb);
    document.addEventListener('visibilitychange', vis);
    return () => {
      window.removeEventListener('rh:solde-changed', cb);
      document.removeEventListener('visibilitychange', vis);
    };
  }, [selected]);

  const loadEmp = (e) => {
    setSelected(e);
    setEmp(null);
    setMovements([]);
    setError('');
    if (!e) return;
    setLoadingEmp(true);
    api.journalSoldeConge(e.id)
      .then((d) => {
        setEmp({ ...d.employe, solde: d.solde, accorde: d.accorde, consomme: d.consomme });
        setMovements(d.lignes || []);
      })
      .catch((err) => {
        // Repli : journal indisponible → recharge le solde via la fiche employé (comportement historique)
        api.employe(e.id)
          .then((d) => {
            setEmp(d);
            setMovements((d.mouvements || []).filter((m) => m.solde_type === 'conge'));
          })
          .catch((err2) => setError(err2.message));
      })
      .finally(() => setLoadingEmp(false));
  };

  // Le journal combine dotations (édition possible) et prélèvements RMA (lecture seule).
  const estEditable = (m) => m.source === 'mouvement';

  const openEdit = (m) => {
    setEditTarget(m);
    setEditForm({
      date_debut: m.date_debut || m.date_operation || today(),
      date_fin: m.date_fin || m.date_operation || today(),
      jours: m.jours,
      motif: m.motif || '',
    });
    setError('');
  };

  const submitEdit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.updateMouvement(editTarget.mouvement_id ?? editTarget.id, {
        date_debut: editForm.date_debut,
        date_fin: editForm.date_fin,
        jours: Number(editForm.jours),
        motif: editForm.motif,
      });
      setSuccess('Solde modifié avec succès.');
      setEditTarget(null);
      if (selected) loadEmp(selected);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    setSaving(true);
    setError('');
    try {
      await api.deleteMouvement(delTarget.mouvement_id ?? delTarget.id);
      setSuccess('Solde supprimé.');
      setDelTarget(null);
      if (selected) loadEmp(selected);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const confirmClear = async () => {
    setSaving(true);
    setError('');
    try {
      let body;
      if (clearTarget.employe) {
        body = { employe_id: clearTarget.employe.id };
      } else {
        body = { categorie_id: clearTarget.categorie_id, employes: preview ? preview.map((p) => p.id) : undefined };
      }
      await api.clearSoldes(body);
      if (clearTarget.employe) {
        setSuccess(`Soldes de congé de ${clearTarget.employe.nom} ${clearTarget.employe.prenom} réinitialisés à 0. La nouvelle valeur peut être intégrée.`);
        setClearTarget(null);
        loadEmp(selected);
      } else {
        setSuccess(`Soldes de congé réinitialisés pour ${clearTarget.count} employé(s) : la nouvelle valeur peut être intégrée en masse.`);
        setClearTarget(null);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const createIndividual = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      if (!selected) { setError('Veuillez sélectionner un employé.'); setSaving(false); return; }
      await api.createSolde({
        employe_id: selected.id,
        type_operation: form.type_operation,
        date_debut: form.date_debut,
        date_fin: form.date_fin,
        jours: Number(form.jours),
        motif: form.motif,
      });
      setSuccess(`Solde de ${fmtJours(Number(form.jours))} j ajouté pour ${selected.nom} ${selected.prenom}.`);
      setForm((f) => ({ ...f, jours: '', motif: '' }));
      await loadEmp(selected);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const createMass = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      if (!preview || preview.length === 0) { setError('Aucun employé ne correspond au critère choisi.'); setSaving(false); return; }
      const r = await api.createSoldeMasse({
        type_operation: massForm.type_operation,
        date_debut: massForm.date_debut,
        date_fin: massForm.date_fin,
        jours: Number(massForm.jours),
        motif: massForm.motif,
        categorie_id: categorie || undefined,
        employes: preview.map((p) => p.id),
      });
      setSuccess(`Solde de ${fmtJours(Number(massForm.jours))} j appliqué à ${r.count} employé(s).`);
      setMassForm((f) => ({ ...f, jours: '', motif: '' }));
      setCategorie('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'input';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Éditer solde de congé</h2>
        <p className="text-sm text-slate-500">
          Consultez, ajoutez, modifiez ou supprimez une dotation de solde de congé (période début → fin et nombre de jours), pour un employé ou en masse par catégorie.
        </p>
      </div>

      <div className="card flex gap-1 p-1">
        {['individuel', 'masse'].map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => { setMode(m); setError(''); setSuccess(''); }}
            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${mode === m ? 'bg-brand-700 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            {m === 'individuel' ? 'Pour un employé' : 'En masse (par catégorie)'}
          </button>
        ))}
      </div>

      {success && <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700 ring-1 ring-emerald-200">{success}</p>}
      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}

      {mode === 'individuel' && (
        <>
          <div className="card p-6">
            <Field label="Employé" required>
              <EmployePicker key={resetKey} selected={selected} onSelect={loadEmp} />
            </Field>

            {loadingEmp && <p className="mt-3 text-sm text-slate-500">Chargement du solde…</p>}

            {emp && !loadingEmp && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="rounded-full bg-brand-50 px-3 py-1 font-semibold text-brand-700 ring-1 ring-brand-200">Solde courant : {fmtJours(emp.solde)} j</span>
                  <span className="rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-700 ring-1 ring-emerald-200">Accordé : {fmtJours(emp.accorde)} j</span>
                  <span className="rounded-full bg-amber-50 px-3 py-1 font-semibold text-amber-700 ring-1 ring-amber-200">Consommé : {fmtJours(emp.consomme)} j</span>
                </div>
                <button
                  type="button"
                  onClick={() => setClearTarget({ employe: emp, count: movements.length })}
                  className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                  disabled={saving}
                  title="Supprime tous les soldes de congé de cet employé pour réintégrer de nouvelles valeurs"
                >
                  <IconTrash /> Réinitialiser les soldes
                </button>
              </div>
            )}
          </div>

          {emp && movements.length > 0 && (
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
                <h3 className="text-sm font-bold text-slate-800">Journal du solde de congé — {emp.nom} {emp.prenom}</h3>
                <span className="text-xs text-slate-400">{movements.length} ligne(s) — dotations + prélèvements RMA</span>
              </div>
              <div className="table-wrap">
                <table className="w-max-table text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-start text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-5 py-3">Type</th>
                      <th className="px-5 py-3">Période (début → fin)</th>
                      <th className="px-5 py-3 text-end">Jours</th>
                      <th className="px-5 py-3 text-end">Solde après</th>
                      <th className="px-5 py-3">Motif</th>
                      <th className="px-5 py-3 text-end">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((m) => {
                      const valeur = m.signe * m.jours;
                      const nonDeduit = m.source === 'codes_importes' && m.deduit === false;
                      return (
                      <tr key={m.source === 'mouvement' ? `mv-${m.mouvement_id}` : `ci-${m.codes_importes_id}-${m.code}`} className={`border-b border-slate-100 last:border-0 hover:bg-slate-50 ${valeur < 0 && !nonDeduit ? 'bg-slate-50/50' : ''}`}>
                        <td className="px-5 py-3">
                          {m.source === 'mouvement' ? (
                            <BadgeType type={m.type_operation} />
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                              <span className="h-2 w-2 rounded-full" style={{ background: m.code === 'DJ' ? '#000000' : '#0ea5e9' }} />
                              Prélèvement RMA {m.code}
                              {nonDeduit && <span className="text-slate-400">· non décompté</span>}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap text-slate-600">
                          {fmtDate(m.date_debut || m.date_operation)} → {fmtDate(m.date_fin || m.date_operation)}
                        </td>
                        <td className={`px-5 py-3 text-end font-semibold ${nonDeduit ? 'text-slate-400' : valeur < 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                          {nonDeduit ? '±0' : (valeur < 0 ? '−' : '+') + fmtJours(Math.abs(valeur))}
                          {nonDeduit && <span className="ml-1 text-[10px] font-normal" title="Jour férié / week-end hors calendrier de travail ou déjà couvert par une demande de congé acceptée : non déduit du solde, mais bien visible dans le journal RMA.">{fmtJours(m.jours)}j non déduit</span>}
                        </td>
                        <td className="px-5 py-3 text-end font-mono text-slate-700">{fmtJours(m.solde_apres)} j</td>
                        <td className="max-w-full sm:w-[220px] truncate px-5 py-3 text-slate-500" title={m.motif}>{m.motif || '—'}</td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end gap-2">
                            {m.source === 'mouvement' ? (
                              <>
                                <button title="Modifier" onClick={() => openEdit(m)} className="rounded-lg p-2 text-brand-700 hover:bg-brand-50"><IconEdit /></button>
                                <button title="Supprimer" onClick={() => setDelTarget(m)} className="rounded-lg p-2 text-red-600 hover:bg-red-50"><IconTrash /></button>
                              </>
                            ) : (
                              <span className="text-xs text-slate-400" title="Prélèvement synchronisé depuis le journal RMA (source de vérité)">RMA</span>
                            )}
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!emp && !loadingEmp && (
            <p className="text-sm text-slate-400">Sélectionnez un employé pour afficher et gérer ses soldes de congé.</p>
          )}

          <form onSubmit={createIndividual} className="card space-y-5 p-6">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-800">Nouvelle dotation</h3>
              <IconPlus />
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field label="Type de dotation" required>
                <select className={inputCls} value={form.type_operation} onChange={(e) => setForm((f) => ({ ...f, type_operation: e.target.value }))}>
                  <option value="ajout_annuel">Ajout de solde annuel</option>
                  <option value="solde_initial">Solde initial</option>
                </select>
              </Field>
              <Field label="Nombre de jours" required hint={form.type_operation === 'solde_initial' ? 'Négatif autorisé (solde initial débiteur, soustrait des droits annuels futurs).' : undefined}>
                <input type="number" className={inputCls} min={form.type_operation === 'solde_initial' ? undefined : '0.5'} step="0.5" value={form.jours} onChange={(e) => setForm((f) => ({ ...f, jours: e.target.value }))} placeholder={form.type_operation === 'solde_initial' ? 'Ex. -5' : 'Ex. 30'} required />
              </Field>
              <Field label="Début de la période" required>
                <input type="date" className={inputCls} value={form.date_debut} onChange={(e) => setForm((f) => ({ ...f, date_debut: e.target.value }))} required />
              </Field>
              <Field label="Fin de la période" required>
                <input type="date" className={inputCls} value={form.date_fin} onChange={(e) => setForm((f) => ({ ...f, date_fin: e.target.value }))} required />
              </Field>
            </div>
            <Field label="Remarque / motif" hint="Optionnel">
              <textarea className={inputCls} rows={2} value={form.motif} onChange={(e) => setForm((f) => ({ ...f, motif: e.target.value }))} placeholder="Ex. Droit annuel 2027" />
            </Field>
            <div className="flex justify-end">
              <button className="btn-primary" disabled={saving}>
                {saving ? 'Ajout en cours…' : 'Ajouter la dotation'}
              </button>
            </div>
          </form>
        </>
      )}

      {mode === 'masse' && (
        <form onSubmit={createMass} className="card space-y-5 p-6">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Catégorie professionnelle" hint="Laissez vide pour appliquer à tous les employés actifs.">
              <select className={inputCls} value={categorie} onChange={(e) => setCategorie(e.target.value)}>
                <option value="">Toutes les catégories</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.libelle}</option>)}
              </select>
            </Field>
            <Field label="Type de dotation" required>
              <select className={inputCls} value={massForm.type_operation} onChange={(e) => setMassForm((f) => ({ ...f, type_operation: e.target.value }))}>
                <option value="ajout_annuel">Ajout de solde annuel</option>
                <option value="solde_initial">Solde initial</option>
              </select>
            </Field>
          </div>

          {preview && (
            <p className="rounded-lg bg-slate-50 px-4 py-2 text-xs text-slate-500">
              {`${preview.length} employé(s) concerné(s) : ${preview.slice(0, 3).map((p) => `${p.nom} ${p.prenom}`).join(', ')}`}
              {preview.length > 3 ? '…' : ''}
            </p>
          )}

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Début de la période" required>
              <input type="date" className={inputCls} value={massForm.date_debut} onChange={(e) => setMassForm((f) => ({ ...f, date_debut: e.target.value }))} required />
            </Field>
            <Field label="Fin de la période" required>
              <input type="date" className={inputCls} value={massForm.date_fin} onChange={(e) => setMassForm((f) => ({ ...f, date_fin: e.target.value }))} required />
            </Field>
            <Field label="Nombre de jours" required hint={massForm.type_operation === 'solde_initial' ? 'Négatif autorisé (solde initial débiteur).' : undefined}>
              <input type="number" className={inputCls} min={massForm.type_operation === 'solde_initial' ? undefined : '0.5'} step="0.5" value={massForm.jours} onChange={(e) => setMassForm((f) => ({ ...f, jours: e.target.value }))} placeholder={massForm.type_operation === 'solde_initial' ? 'Ex. -5' : 'Ex. 30'} required />
            </Field>
          </div>

          <Field label="Remarque / motif" hint="Optionnel">
            <textarea className={inputCls} rows={2} value={massForm.motif} onChange={(e) => setMassForm((f) => ({ ...f, motif: e.target.value }))} placeholder="Ex. Droit annuel 2027" />
          </Field>

          <div className="flex items-center justify-end gap-3">
            {preview && preview.length > 0 && (
              <button
                type="button"
                onClick={() => setClearTarget({ categorie_id: categorie || undefined, categorie_label: categorie ? categories.find((c) => String(c.id) === String(categorie))?.libelle : 'tous les employés actifs', count: preview.length })}
                className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                disabled={saving}
                title="Supprime tous les soldes de congé des employés concernés pour intégrer de nouvelles valeurs"
              >
                <IconTrash /> Réinitialiser les soldes ({preview.length})
              </button>
            )}
            <button className="btn-primary" disabled={saving}>
              {saving ? 'Application en cours…' : `Appliquer la dotation à ${preview ? preview.length : 0} employé(s)`}
            </button>
          </div>
        </form>
      )}

      {editTarget && editForm && (
        <Modal onClose={() => setEditTarget(null)} title={`Modifier le solde — ${selected ? `${selected.nom} ${selected.prenom}` : ''}`}>
          <form onSubmit={submitEdit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Début de la période *</label>
                <input type="date" className="input" value={editForm.date_debut} onChange={(e) => setEditForm({ ...editForm, date_debut: e.target.value })} required />
              </div>
              <div>
                <label className="label">Fin de la période *</label>
                <input type="date" className="input" value={editForm.date_fin} onChange={(e) => setEditForm({ ...editForm, date_fin: e.target.value })} required />
              </div>
            </div>
            <div>
              <label className="label">Nombre de jours *</label>
              <input type="number" className="input" min={editTarget.type_operation === 'solde_initial' ? undefined : '0.5'} step="0.5" value={editForm.jours} onChange={(e) => setEditForm({ ...editForm, jours: e.target.value })} required />
              {editTarget.type_operation === 'solde_initial' && (
                <p className="mt-1 text-xs text-slate-500">Négatif autorisé (solde initial débiteur, soustrait des droits annuels futurs).</p>
              )}
            </div>
            <div>
              <label className="label">Motif</label>
              <textarea className="input" rows={2} value={editForm.motif} onChange={(e) => setEditForm({ ...editForm, motif: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setEditTarget(null)}>Annuler</button>
              <button className="btn-primary" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
            </div>
          </form>
        </Modal>
      )}

      {delTarget && (
        <Modal onClose={() => setDelTarget(null)} title="Supprimer cette dotation ?" danger>
          <p className="text-sm text-slate-600">
            Supprimer la dotation de {fmtJours(delTarget.jours)} j (période {fmtDate(delTarget.date_debut || delTarget.date_operation)} → {fmtDate(delTarget.date_fin || delTarget.date_operation)})
            pour {selected ? `${selected.nom} ${selected.prenom}` : 'cet employé'} ? Le solde courant sera recalculé.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setDelTarget(null)}>Annuler</button>
            <button className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700" onClick={confirmDelete} disabled={saving}>
              {saving ? 'Suppression…' : 'Supprimer'}
            </button>
          </div>
        </Modal>
      )}

      {clearTarget && (
        <Modal onClose={() => setClearTarget(null)} title="Réinitialiser les soldes de congé ?" danger>
          <p className="text-sm text-slate-600">
            {clearTarget.employe
              ? `Supprimer TOUS les soldes de congé de ${clearTarget.employe.nom} ${clearTarget.employe.prenom} ?`
              : `Supprimer TOUS les soldes de congé des ${clearTarget.count} employé(s) de « ${clearTarget.categorie_label} » ?`}
            <br />
            Les soldes consommés (prélèvements) le sont également : le solde courant passera à <strong>0 jour</strong>, prêt à intégrer une nouvelle valeur.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setClearTarget(null)}>Annuler</button>
            <button className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700" onClick={confirmClear} disabled={saving}>
              {saving ? 'Réinitialisation…' : 'Réinitialiser les soldes'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}