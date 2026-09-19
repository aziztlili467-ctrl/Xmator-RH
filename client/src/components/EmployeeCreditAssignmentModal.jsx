import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { MOIS, today } from '../utils';
import { IconX, IconAlertTriangle } from './icons';
import Field from './Field';

// ---------------------------------------------------------------------------
// Octroi d'un crédit / avance : choix de l'employé (ou présélection depuis la
// fiche), type de crédit, montant/durée/différé, calcul temps réel de la
// mensualité, taux d'endettement (alertes), aperçu de l'échéancier et champs
// dynamiques du type (texte / nombre / booléen / fichier).
// ---------------------------------------------------------------------------
const fmtDT = (n) => (Number.isFinite(Number(n))
  ? Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) : '0,000');

function decalerMois(s, n) {
  const [a, m] = String(s || '').split('-').map(Number);
  if (!a || !m) return '';
  const idx = a * 12 + (m - 1) + n;
  const na = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return `${na}-${String(nm).padStart(2, '0')}`;
}

function libelleMois(s) {
  const [a, m] = String(s || '').split('-').map(Number);
  if (!a || !m) return '—';
  return `${MOIS[m - 1]} ${a}`;
}

export default function EmployeeCreditAssignmentModal({ employe, onClose, onSaved }) {
  const [types, setTypes] = useState([]);
  const [employes, setEmployes] = useState([]);
  const [form, setForm] = useState({
    employeId: employe ? String(employe.id) : '',
    typeId: '',
    montant: '',
    duree: '',
    differe: 0,
    tauxInteret: '',
    frais: '',
    salaireRef: '',
    dateDebutRetenue: decalerMois(today().slice(0, 7), 1),
    dateOctroi: today(),
    motif: '',
    justificatifs: {},
  });
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mort = false;
    Promise.all([api.creditsTypes(), api.creditEmployes()])
      .then(([t, e]) => {
        if (mort) return;
        setTypes((t?.types || []).filter((x) => x.actif));
        setEmployes(e?.employes || []);
      })
      .catch((err) => { if (!mort) setMsg({ type: 'err', texte: err.message || 'Impossible de charger le référentiel.' }); });
    return () => { mort = true; };
  }, []);

  const type = useMemo(() => types.find((t) => String(t.id) === String(form.typeId)), [types, form.typeId]);
  const emp = useMemo(() => employes.find((e) => String(e.id) === String(form.employeId)), [employes, form.employeId]);

  const selectType = (tid) => {
    const t = types.find((x) => String(x.id) === String(tid));
    setForm((f) => ({
      ...f,
      typeId: tid,
      duree: t ? String(t.duree_max || t.duree_min || 12) : '',
      tauxInteret: t ? (t.taux_interet_annuel ?? '') : '',
      frais: t ? (t.frais_dossier ?? 0) : '',
      differe: 0,
    }));
  };

  const selectEmploye = (eid) => {
    const e = employes.find((x) => String(x.id) === String(eid));
    const ref = e ? ((Number(e.salaire_base) || 0) + (Number(e.indemnite_presence) || 0)
      + (Number(e.indemnite_transport) || 0) + (Number(e.indemnite_fonction) || 0)) : 0;
    setForm((f) => ({ ...f, employeId: eid, salaireRef: ref ? String(ref) : '' }));
  };

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setJust = (k) => (e) => {
    const v = e.target.files && e.target.files[0] ? e.target.files[0] : null;
    if (k === 'fichier' && v) {
      const reader = new FileReader();
      reader.onload = () => setForm((f) => ({ ...f, justificatifs: { ...f.justificatifs, [k]: reader.result } }));
      reader.readAsDataURL(v);
      return;
    }
    setForm((f) => ({ ...f, justificatifs: { ...f.justificatifs, [k]: v } }));
  };
  const setJustBool = (k) => (e) => setForm((f) => ({ ...f, justificatifs: { ...f.justificatifs, [k]: e.target.checked } }));

  const calculs = useMemo(() => {
    const montant = Number(form.montant) || 0;
    const duree = Number(form.duree) || 0;
    const taux = Number(form.tauxInteret) || 0;
    const frais = Number(form.frais) || 0;
    const salaireRef = Number(form.salaireRef) || 0;
    const interets = duree > 0 ? montant * (taux / 100) * (duree / 12) : 0;
    const total = montant + interets + frais;
    const mensualite = duree > 0 ? total / duree : 0;
    const endettement = salaireRef > 0 ? (mensualite / salaireRef) * 100 : 0;
    let plafond = null;
    if (type) {
      plafond = type.plafond_mode === 'dt'
        ? Number(type.plafond_montant) || 0
        : (salaireRef > 0 ? (Number(type.plafond_montant) || 0) * salaireRef : null);
    }
    const depassePlafond = plafond !== null && montant > plafond;
    const dureeValide = type ? duree >= (type.duree_min || 1) && duree <= (type.duree_max || duree) : true;
    return { montant, duree, taux, frais, salaireRef, interets, total, mensualite, endettement, plafond, depassePlafond, dureeValide };
  }, [form.montant, form.duree, form.tauxInteret, form.frais, form.salaireRef, type]);

  const alerteEndettement = type && calculs.salaireRef > 0 && type.taux_endettement_max
    ? calculs.endettement > Number(type.taux_endettement_max) : false;

  const submit = async () => {
    setMsg(null);
    if (!form.employeId) return setMsg({ type: 'err', texte: 'Sélectionnez un employé.' });
    if (!type) return setMsg({ type: 'err', texte: 'Sélectionnez un type de crédit.' });
    if (!(calculs.montant > 0)) return setMsg({ type: 'err', texte: 'Saisissez un montant.' });
    if (!calculs.dureeValide || !(calculs.duree > 0)) return setMsg({ type: 'err', texte: `Durée invalide (${type.duree_min || 1} à ${type.duree_max || 60} mois).` });
    if (calculs.depassePlafond) return setMsg({ type: 'err', texte: `Montant hors plafond (max ${fmtDT(calculs.plafond)} DT).` });
    if (!form.dateDebutRetenue) return setMsg({ type: 'err', texte: 'Saisissez la date de début de retenue.' });
    setSaving(true);
    try {
      const body = {
        employe_id: form.employeId,
        type_id: form.typeId,
        montant_actuel: calculs.montant,
        duree_mois: calculs.duree,
        differe_mois: Number(form.differe) || 0,
        taux_interet_annuel: calculs.taux || null,
        frais_dossier: calculs.frais || null,
        salaire_reference: calculs.salaireRef || null,
        date_debut_retenue: form.dateDebutRetenue,
        date_octroi: form.dateOctroi || null,
        motif: form.motif || null,
        justificatifs: Object.keys(form.justificatifs).filter((k) => form.justificatifs[k] !== '' && form.justificatifs[k] !== undefined && form.justificatifs[k] !== false)
          .reduce((o, k) => { o[k] = form.justificatifs[k]; return o; }, {}),
      };
      const r = await api.creditCreerContrat(body);
      onSaved?.(r?.created || r);
    } catch (e) {
      setMsg({ type: 'err', texte: e.message || 'Échec de l\'octroi du crédit.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div className="card modal-shell w-full max-w-3xl p-4 sm:p-6">
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-800">Octroyer un crédit / avance</h2>
            <p className="text-[11px] text-slate-400">Mensualité calculée automatiquement, retenue injectée au bulletin de paie.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Fermer">
            <IconX className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Employé" required>
            {employe ? (
              <div className="input flex items-center justify-between">
                <span className="truncate">{employe.nom} {employe.prenom}{employe.matricule ? ` — ${employe.matricule}` : ''}</span>
              </div>
            ) : (
              <select className="input" value={form.employeId} onChange={(e) => selectEmploye(e.target.value)}>
                <option value="">— Sélectionner —</option>
                {employes.map((e) => (
                  <option key={e.id} value={e.id}>{e.nom} {e.prenom}{e.matricule ? ` (${e.matricule})` : ''}</option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Type de crédit" required>
            <select className="input" value={form.typeId} onChange={(e) => selectType(e.target.value)}>
              <option value="">— Sélectionner —</option>
              {types.map((t) => <option key={t.id} value={t.id}>{t.nom}</option>)}
            </select>
          </Field>
          <Field label="Montant (DT)" required>
            <input type="number" min="0" step="0.001" className="input" value={form.montant} onChange={set('montant')} placeholder="0,000" />
            {calculs.depassePlafond && <p className="mt-1 text-xs text-red-600">Dépasse le plafond ({fmtDT(calculs.plafond)} DT).</p>}
          </Field>
          <Field label={`Durée (mois)${type ? ` — min ${type.duree_min || 1} / max ${type.duree_max || 60}` : ''}`} required>
            <input type="number" min="1" max="60" step="1" className="input" value={form.duree} onChange={set('duree')} />
          </Field>
          <Field label="Différé (mois avant 1re retenue)" hint={type && type.differe_max ? `Maximum ${type.differe_max} mois` : null}>
            <input type="number" min="0" max={type?.differe_max ?? 3} step="1" className="input" value={form.differe} onChange={set('differe')} />
          </Field>
          <Field label="Salaire mensuel de référence (DT)" required hint="Base + indemnités — sert au taux d'endettement.">
            <input type="number" min="0" step="0.001" className="input" value={form.salaireRef} onChange={set('salaireRef')} />
          </Field>
          <Field label="Taux d'intérêt annuel (%)">
            <input type="number" min="0" step="0.01" className="input" value={form.tauxInteret} onChange={set('tauxInteret')} />
          </Field>
          <Field label="Frais de dossier (DT)">
            <input type="number" min="0" step="0.001" className="input" value={form.frais} onChange={set('frais')} />
          </Field>
          <Field label="Début des retenues (mois)" required>
            <input type="month" className="input" value={form.dateDebutRetenue} onChange={set('dateDebutRetenue')} />
          </Field>
          <Field label="Date d'octroi">
            <input type="date" className="input" value={form.dateOctroi} onChange={set('dateOctroi')} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Motif">
              <input className="input" value={form.motif} onChange={set('motif')} placeholder="Motif facultatif" />
            </Field>
          </div>

          {type?.champs?.map((c) => {
            const typeChamp = c.type || c.type_champ;
            return (
            <Field key={c.id} label={c.nom} required={c.obligatoire}>
              {typeChamp === 'booleen' ? (
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={!!form.justificatifs[c.id]} onChange={setJustBool(c.id)} />
                  Oui
                </label>
              ) : typeChamp === 'fichier' ? (
                <input type="file" className="input" onChange={setJust(String(c.id))} />
              ) : typeChamp === 'nombre' ? (
                <input type="number" step="any" className="input" value={form.justificatifs[c.id] ?? ''} onChange={setJust(String(c.id))} />
              ) : (
                <input className="input" value={form.justificatifs[c.id] ?? ''} onChange={setJust(String(c.id))} />
              )}
            </Field>
            );
          })}

          <div className="sm:col-span-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <div>
                  <p className="text-[10px] uppercase text-slate-400">Capital</p>
                  <p className="font-semibold text-slate-800">{fmtDT(calculs.montant)} DT</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-slate-400">Intérêts</p>
                  <p className="font-semibold text-slate-800">{fmtDT(calculs.interets)} DT</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-slate-400">Mensualité</p>
                  <p className="font-bold text-brand-700">{fmtDT(calculs.mensualite)} DT</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-slate-400">Taux endettement</p>
                  <p className={`font-semibold ${alerteEndettement ? 'text-red-600' : (calculs.endettement > 0 ? 'text-slate-800' : 'text-slate-400')}`}>
                    {calculs.salaireRef > 0 ? `${calculs.endettement.toFixed(1)} %` : '—'}
                    {type?.taux_endettement_max && <span className="ml-1 text-[10px] text-slate-400">/ {type.taux_endettement_max} %</span>}
                  </p>
                </div>
              </div>
              {alerteEndettement && (
                <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-red-600">
                  <IconAlertTriangle className="h-3.5 w-3.5" /> La mensualité dépasse le taux d'endettement maximal du type ({type.taux_endettement_max} %).
                </p>
              )}
              <div className="mt-3 border-t border-slate-200 pt-2">
                <p className="mb-1 text-[10px] uppercase text-slate-400">Échéancier prévisionnel — {calculs.duree} retenues de {fmtDT(calculs.mensualite)} DT</p>
                {calculs.duree > 0 && (
                  <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                    {Array.from({ length: Math.min(calculs.duree, 8) }).map((_, i) => (
                      <div key={i} className="rounded border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-600">
                        <span className="text-slate-400">{libelleMois(decalerMois(form.dateDebutRetenue, i + Number(form.differe) || 0))}</span>
                        <b className="block font-semibold text-slate-800">{fmtDT(calculs.mensualite)}</b>
                      </div>
                    ))}
                    {calculs.duree > 8 && <div className="px-2 py-1 text-[10px] text-slate-400">… {calculs.duree - 8} autres</div>}
                  </div>
                )}
              </div>
            </div>
          </div>

          {msg && (
            <div className={`sm:col-span-2 rounded-md px-3 py-2 text-sm ${msg.type === 'err' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
              {msg.texte}
            </div>
          )}

          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Annuler</button>
            <button className="btn-primary" onClick={submit} disabled={saving}>
              {saving ? 'Octroi en cours…' : 'Octroyer le crédit'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}