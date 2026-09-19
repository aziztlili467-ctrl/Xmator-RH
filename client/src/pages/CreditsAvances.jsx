import { useEffect, useState } from 'react';
import { api } from '../api';
import { IconPlus, IconEdit, IconTrash, IconCreditCard, IconBanknotes } from '../components/icons';
import EmployeeCreditAssignmentModal from '../components/EmployeeCreditAssignmentModal';
import Field from '../components/Field';

const fmtDT = (n) => (Number.isFinite(Number(n))
  ? Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) : '0,000');
const TYPES_CHAMPS = ['texte', 'nombre', 'booleen', 'fichier'];

function libelleStatut(s) {
  return ({ en_cours: 'En cours', solde: 'Soldé', annule: 'Annulé' })[s] || s || '—';
}

export default function CreditsAvances() {
  const [types, setTypes] = useState([]);
  const [contrats, setContrats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);
  const [edition, setEdition] = useState(null); // null | {type} à éditer → true = nouveau
  const [supprType, setSupprType] = useState(null);
  const [octroi, setOctroi] = useState(false);

  const charger = () => {
    setLoading(true);
    Promise.all([api.creditsTypes(), api.creditContrats()])
      .then(([t, c]) => { setTypes(t?.types || []); setContrats(c?.contrats || []); })
      .catch((e) => setMsg({ type: 'err', texte: e.message || 'Impossible de charger les données.' }))
      .finally(() => setLoading(false));
  };

  useEffect(() => { charger(); }, []);

  const supprimerType = async () => {
    try {
      await api.creditDeleteType(supprType);
      setMsg({ type: 'ok', texte: 'Type supprimé.' });
      setSupprType(null);
      charger();
    } catch (e) {
      setMsg({ type: 'err', texte: e.message || 'Échec de la suppression.' });
    } finally {
      setTimeout(() => setMsg(null), 3000);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Crédits &amp; Avances Emploi</h2>
          <p className="text-[11px] text-slate-400">Référentiel des types de crédits, octroi et suivi du capital restant dû (CRD).</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary" onClick={() => setOctroi(true)}>
            <span className="inline-flex items-center gap-1.5"><IconPlus /> Octroyer</span>
          </button>
          <button type="button" className="btn-primary" onClick={() => setEdition({})}>
            <span className="inline-flex items-center gap-1.5"><IconPlus /> Nouveau type</span>
          </button>
        </div>
      </div>

      {msg && (
        <div className={`rounded-md px-3 py-2 text-sm ${msg.type === 'err' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
          {msg.texte}
        </div>
      )}

      {/* Référentiel */}
      <section className="card p-4">
        <h3 className="mb-3 text-sm font-bold text-slate-800">Référentiel des types de crédit</h3>
        {loading && !types.length ? (
          <p className="py-6 text-center text-sm text-slate-400">Chargement…</p>
        ) : !types.length ? (
          <p className="py-6 text-center text-sm text-slate-400">
            <IconCreditCard /> Aucun type défini. Créez un premier type pour pouvoir octroyer des crédits.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[10px] uppercase text-slate-400">
                  <th className="px-2 py-1.5">Nom</th>
                  <th className="px-2 py-1.5">Code paie</th>
                  <th className="px-2 py-1.5 text-end">Plafond</th>
                  <th className="px-2 py-1.5 text-end">Durée (min–max)</th>
                  <th className="px-2 py-1.5 text-end">Taux / Frais</th>
                  <th className="px-2 py-1.5 text-end">Endettement max</th>
                  <th className="px-2 py-1.5">Champs</th>
                  <th className="px-2 py-1.5 text-center">Actif</th>
                  <th className="px-2 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {types.map((t) => (
                  <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-2 py-2 font-medium text-slate-700">{t.nom}</td>
                    <td className="px-2 py-2 font-mono text-xs text-slate-600">{t.code_paie}</td>
                    <td className="px-2 py-2 text-end text-slate-700">
                      {t.plafond_mode === 'multiple_salaire' ? `× ${t.plafond_montant} salaire` : `${fmtDT(t.plafond_montant)} DT`}
                    </td>
                    <td className="px-2 py-2 text-end text-slate-700">{t.duree_min} – {t.duree_max} mois</td>
                    <td className="px-2 py-2 text-end text-slate-700">
                      {t.taux_interet_annuel != null ? `${Number(t.taux_interet_annuel) || 0} % ` : ''}
                      {t.frais_dossier ? `/ ${fmtDT(t.frais_dossier)} DT` : ''}
                    </td>
                    <td className="px-2 py-2 text-end text-slate-700">{t.taux_endettement_max != null ? `${t.taux_endettement_max} %` : '—'}</td>
                    <td className="px-2 py-2 text-slate-500">{(t.champs || []).length || '—'}</td>
                    <td className="px-2 py-2 text-center">
                      <span className={`inline-block h-2 w-2 rounded-full ${t.actif ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                    </td>
                    <td className="px-2 py-2 text-end">
                      <div className="inline-flex gap-1">
                        <button type="button" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Modifier"
                          onClick={() => setEdition(t)}><IconEdit /></button>
                        <button type="button" className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Supprimer"
                          onClick={() => setSupprType(t.id)}><IconTrash /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Contrats */}
      <section className="card p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800"><IconBanknotes /> Contrats &amp; CRD</h3>
        {contrats.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[10px] uppercase text-slate-400">
                  <th className="px-2 py-1.5">Employé</th>
                  <th className="px-2 py-1.5">Type</th>
                  <th className="px-2 py-1.5 text-end">Capital</th>
                  <th className="px-2 py-1.5 text-end">Mensualité</th>
                  <th className="px-2 py-1.5 text-end">Total retenu</th>
                  <th className="px-2 py-1.5 text-end">Remboursé</th>
                  <th className="px-2 py-1.5 text-end">CRD</th>
                  <th className="px-2 py-1.5 text-center">Statut</th>
                </tr>
              </thead>
              <tbody>
                {contrats.map((c) => {
                  const payees = c.echeances?.filter((e) => e.statut === 'paye') || [];
                  const remb = payees.reduce((s, e) => s + Number(e.montant) || 0, 0);
                  const crd = Number(c.total_retenu) - remb;
                  return (
                    <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-2 py-2 text-slate-700">{c.nom} {c.prenom}{c.matricule ? ` (${c.matricule})` : ''}</td>
                      <td className="px-2 py-2 text-slate-600">{c.type_nom}</td>
                      <td className="px-2 py-2 text-end text-slate-700">{fmtDT(c.montant_actuel)}</td>
                      <td className="px-2 py-2 text-end text-slate-700">{fmtDT(c.mensualite)}</td>
                      <td className="px-2 py-2 text-end text-slate-700">{fmtDT(c.total_retenu)}</td>
                      <td className="px-2 py-2 text-end text-emerald-700">{fmtDT(remb)}</td>
                      <td className="px-2 py-2 text-end font-bold text-red-700">{c.statut === 'annule' ? '—' : fmtDT(Math.max(crd, 0))}</td>
                      <td className="px-2 py-2 text-center">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${c.statut === 'en_cours' ? 'bg-amber-100 text-amber-700' : c.statut === 'solde' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                          {libelleStatut(c.statut)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-slate-400">Aucun contrat pour le moment.</p>
        )}
      </section>

      {octroi && <EmployeeCreditAssignmentModal onClose={() => setOctroi(false)} onSaved={() => { setOctroi(false); charger(); }} />}

      {edition && (
        <TypeEditor initial={edition} onClose={() => setEdition(null)} onSaved={() => { setEdition(null); charger(); }} />
      )}

      {supprType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setSupprType(null); }}>
          <div className="card modal-shell w-full max-w-sm p-4 sm:p-6" onMouseDown={(e) => e.stopPropagation()}>
            <h2 className="mb-1 text-sm font-bold text-slate-800">Supprimer ce type ?</h2>
            <p className="mb-4 text-xs text-slate-500">Les contrats existants de ce type seront conservés, mais le type ne sera plus disponible.</p>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setSupprType(null)}>Annuler</button>
              <button type="button" className="btn-danger" onClick={supprimerType}>Supprimer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TypeEditor({ initial, onClose, onSaved }) {
  const estNouveau = !initial.id;
  const [form, setForm] = useState({
    nom: initial.nom || '',
    code_paie: initial.code_paie || '',
    plafond_mode: initial.plafond_mode || 'dt',
    plafond_montant: initial.plafond_montant ?? '',
    duree_min: initial.duree_min ?? 1,
    duree_max: initial.duree_max ?? 60,
    taux_interet_annuel: initial.taux_interet_annuel ?? '',
    frais_dossier: initial.frais_dossier ?? '',
    taux_endettement_max: initial.taux_endettement_max ?? '',
    differe_max: initial.differe_max ?? 0,
    pause_mensualite: !!initial.pause_mensualite,
    stc_auto: !!initial.stc_auto,
    actif: initial.actif !== false,
  });
  const [champs, setChamps] = useState((initial.champs || []).map((c) => ({ ...c })));
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);

  const set = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [k]: v }));
  };

  const majChamp = (i, k, v) => setChamps((cs) => cs.map((c, j) => (j === i ? { ...c, [k]: v } : c)));
  const ajoutChamp = () => setChamps((cs) => [...cs, { id: null, nom: '', type: 'texte', obligatoire: false }]);

  const submit = async () => {
    setMsg(null);
    if (!String(form.nom).trim()) return setMsg({ type: 'err', texte: 'Saisissez le nom du type.' });
    if (!String(form.code_paie).trim()) return setMsg({ type: 'err', texte: 'Saisissez le code de paie (ex. 5301).' });
    if (!(Number(form.duree_min) >= 1) || !(Number(form.duree_max) >= Number(form.duree_min))) {
      return setMsg({ type: 'err', texte: 'Durée minimale (≥ 1) et maximale (≥ min) invalides.' });
    }
    if (!(Number(form.plafond_montant) > 0)) return setMsg({ type: 'err', texte: 'Saisissez un plafond.' });
    if (champs.some((c) => !String(c.nom).trim())) return setMsg({ type: 'err', texte: 'Chaque champ doit avoir un nom.' });
    setSaving(true);
    try {
      const body = {
        ...form,
        plafond_montant: Number(form.plafond_montant),
        duree_min: Number(form.duree_min),
        duree_max: Number(form.duree_max),
        taux_interet_annuel: form.taux_interet_annuel === '' ? null : Number(form.taux_interet_annuel),
        frais_dossier: form.frais_dossier === '' ? null : Number(form.frais_dossier),
        taux_endettement_max: form.taux_endettement_max === '' ? null : Number(form.taux_endettement_max),
        differe_max: Number(form.differe_max) || 0,
        champs: champs.filter((c) => String(c.nom).trim()).map((c) => ({ id: c.id, nom: String(c.nom).trim(), type: c.type, obligatoire: !!c.obligatoire })),
      };
      if (estNouveau) await api.creditCreateType(body);
      else await api.creditUpdateType(initial.id, body);
      onSaved?.();
    } catch (e) {
      setMsg({ type: 'err', texte: e.message || 'Échec de l\'enregistrement.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div className="card modal-shell w-full max-w-2xl p-4 sm:p-6" onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="mb-3 text-base font-bold text-slate-800">{estNouveau ? 'Nouveau type de crédit' : 'Modifier le type de crédit'}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nom du type" required>
            <input className="input" value={form.nom} onChange={set('nom')} placeholder="Ex. Avance sur salaire" />
          </Field>
          <Field label="Code de paie" required hint="Rubrique « À déduire » du bulletin (ex. 5301).">
            <input className="input" value={form.code_paie} onChange={set('code_paie')} />
          </Field>
          <Field label="Mode plafond">
            <select className="input" value={form.plafond_mode} onChange={set('plafond_mode')}>
              <option value="dt">Montant fixe (DT)</option>
              <option value="multiple_salaire">Multiple du salaire</option>
            </select>
          </Field>
          <Field label="Plafond" required hint={form.plafond_mode === 'multiple_salaire' ? 'Coefficient du salaire de référence' : 'Montant maximal accordable (DT) :'}
            >
            <input type="number" min="0" step="0.001" className="input" value={form.plafond_montant} onChange={set('plafond_montant')} />
          </Field>
          <Field label="Durée minimale (mois)" required>
            <input type="number" min="1" max="60" step="1" className="input" value={form.duree_min} onChange={set('duree_min')} />
          </Field>
          <Field label="Durée maximale (mois)" required hint="Plafonnée à 60 mois.">
            <input type="number" min="1" max="60" step="1" className="input" value={form.duree_max} onChange={set('duree_max')} />
          </Field>
          <Field label="Taux d'intérêt annuel (%)">
            <input type="number" min="0" step="0.01" className="input" value={form.taux_interet_annuel} onChange={set('taux_interet_annuel')} />
          </Field>
          <Field label="Frais de dossier (DT)">
            <input type="number" min="0" step="0.001" className="input" value={form.frais_dossier} onChange={set('frais_dossier')} />
          </Field>
          <Field label="Taux d'endettement maximal (%)" hint="Alerte si mensualité / salaire ref. dépasse ce taux.">
            <input type="number" min="0" step="0.1" className="input" value={form.taux_endettement_max} onChange={set('taux_endettement_max')} />
          </Field>
          <Field label="Différé maximal (mois)" hint="Avant la 1re retenue (max 3).">
            <input type="number" min="0" max="3" step="1" className="input" value={form.differe_max} onChange={set('differe_max')} />
          </Field>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.pause_mensualite} onChange={set('pause_mensualite')} /> Pause de mensualité
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.stc_auto} onChange={set('stc_auto')} /> Solde de tout compte automatique
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.actif} onChange={set('actif')} /> Type actif
          </label>

          <div className="sm:col-span-2">
            <div className="mb-1 flex items-center justify-between">
              <p className="label mb-0">Champs personnalisés (justificatifs)</p>
              <button type="button" className="text-[11px] font-semibold text-brand-700 hover:underline" onClick={ajoutChamp}>+ Ajouter un champ</button>
            </div>
            {champs.map((c, i) => (
              <div key={i} className="mb-2 flex items-center gap-2">
                <input className="input" placeholder="Nom du champ" value={c.nom} onChange={(e) => majChamp(i, 'nom', e.target.value)} />
                <select className="input w-32" value={c.type} onChange={(e) => majChamp(i, 'type', e.target.value)}>
                  {TYPES_CHAMPS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <label className="flex shrink-0 items-center gap-1 text-xs text-slate-600">
                  <input type="checkbox" checked={!!c.obligatoire} onChange={(e) => majChamp(i, 'obligatoire', e.target.checked)} /> Oblig.
                </label>
                <button type="button" className="shrink-0 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => setChamps((cs) => cs.filter((_, j) => j !== i))}>
                  <IconTrash />
                </button>
              </div>
            ))}
            {!champs.length && <p className="text-xs text-slate-400">Aucun champ personnalisé.</p>}
          </div>

          {msg && (
            <div className={`sm:col-span-2 rounded-md px-3 py-2 text-sm ${msg.type === 'err' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
              {msg.texte}
            </div>
          )}

          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Annuler</button>
            <button className="btn-primary" onClick={submit} disabled={saving}>
              {saving ? 'Enregistrement…' : estNouveau ? 'Créer le type' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}