import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { IconSettings, IconTrash, IconCalendarDays } from '../components/icons';

const ANNEES = [2025, 2026, 2027, 2028, 2029, 2030];
const MOIS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];
const TYPES_INFO = [
  { key: 'transport', label: 'Indemnité de transport', court: 'Transport', nature: 'Fixe' },
  { key: 'presence', label: 'Indemnité de présence', court: 'Présence', nature: 'Fixe' },
];

function normaliserSaisie(valeur) {
  const s = String(valeur == null ? '' : valeur);
  const n = s.replace(/[^\d.,-]/g, '');
  const parties = n.split(/[.,]/);
  if (parties.length > 2) return `${parties[0]}.${parties.slice(1).join('')}`;
  return n;
}

function valeurEq(a, b) {
  if ((a == null || String(a).trim() === '') && (b == null || String(b).trim() === '')) return true;
  const na = a == null ? '' : String(a).trim();
  const nb = b == null ? '' : String(b).trim();
  return (na.replace(',', '.') === nb.replace(',', '.')) || Number(na.replace(',', '.')) === Number(nb.replace(',', '.'));
}

const aujourdhui = new Date();

export default function ParametresIndemnites() {
  const [annee, setAnnee] = useState(ANNEES.includes(aujourdhui.getFullYear()) ? aujourdhui.getFullYear() : 2026);
  const [mois, setMois] = useState(aujourdhui.getMonth() + 1);
  const [chargement, setChargement] = useState(true);
  const [sauvegarde, setSauvegarde] = useState(false);
  const [message, setMessage] = useState(null);
  const [lignes, setLignes] = useState([]);
  const [changements, setChangements] = useState([]);
  const [supprId, setSupprId] = useState(null);
  const [supprBusy, setSupprBusy] = useState(false);

  const charger = async (anneeSel, moisSel) => {
    setChargement(true);
    setMessage(null);
    try {
      const d = await api.parametresIndemnites({ annee: anneeSel, mois: moisSel });
      setLignes(
        d.categories.map((c) => ({
          id: c.id,
          libelle: c.libelle,
          transport: c.transport == null ? '' : String(c.transport),
          presence: c.presence == null ? '' : String(c.presence),
          _orig: {
            transport: c.transport == null ? '' : String(c.transport),
            presence: c.presence == null ? '' : String(c.presence),
          },
        }))
      );
      setChangements(d.changements || []);
    } catch (e) {
      setMessage({ type: 'erreur', texte: e.message });
    } finally {
      setChargement(false);
    }
  };

  useEffect(() => { charger(annee, mois); }, [annee, mois]);

  const modifier = (id, key, valeur) => {
    setLignes((prev) => prev.map((l) => (l.id === id ? { ...l, [key]: normaliserSaisie(valeur) } : l)));
    setMessage(null);
  };

  const modifiees = useMemo(
    () =>
      lignes.filter((l) =>
        TYPES_INFO.some((t) => !valeurEq(l[t.key], l._orig[t.key]))
      ),
    [lignes]
  );

  const enregistrer = async () => {
    if (modifiees.length === 0) return;
    setSauvegarde(true);
    setMessage(null);
    try {
      const r = await api.sauverParametresIndemnites({
        annee,
        mois,
        lignes: modifiees.map((l) => ({
          categorie_id: l.id,
          transport: l.transport,
          presence: l.presence,
        })),
      });
      setMessage({ type: 'ok', texte: `${r.enregistres} montant(s) enregistré(s) pour ${MOIS[mois - 1]} ${annee}${r.retires > 0 ? ` · ${r.retires} retiré(s)` : ''}.` });
      await charger(annee, mois);
    } catch (e) {
      setMessage({ type: 'erreur', texte: e.message });
    } finally {
      setSauvegarde(false);
    }
  };

  const supprimerChangement = async () => {
    if (!supprId) return;
    setSupprBusy(true);
    setMessage(null);
    try {
      const r = await api.supprimerChangementIndemnites(supprId);
      setMessage({ type: 'ok', texte: `Changement du ${r.supprime.mois}/${r.supprime.annee} supprimé.` });
      setSupprId(null);
      await charger(annee, mois);
    } catch (e) {
      setMessage({ type: 'erreur', texte: e.message });
    } finally {
      setSupprBusy(false);
    }
  };

  const fmtMontant = (v) => (v == null || v === '' ? '' : Number(v).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 3 }));

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">
        Paie Mensuelle — Indemnités F&V : montants fixes (transport &amp; présence) par catégorie.
        Un montant saisi pour un mois s'applique à ce mois et aux suivants ; les mois antérieurs restent inchangés.
      </div>

      {/* Sélecteurs Année / Mois */}
      <div className="card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-bold text-slate-800">Montants des indemnités F&amp;V</h3>
            <p className="text-xs text-slate-500">
              Période d'effet des montants saisis — {modifiees.length} ligne(s) modifiée(s) en attente
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-end gap-2">
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Année</label>
              <select className="input" value={annee} onChange={(e) => setAnnee(Number(e.target.value))}>
                {ANNEES.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Mois</label>
              <select className="input" value={mois} onChange={(e) => setMois(Number(e.target.value))}>
                {MOIS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <button
              className="btn btn-primary"
              onClick={enregistrer}
              disabled={sauvegarde || modifiees.length === 0}
            >
              <IconSettings /> {sauvegarde ? 'Enregistrement…' : 'Enregistrer pour ce mois'}
            </button>
          </div>
        </div>

        {message && (
          <p className={`mt-3 text-sm font-semibold ${message.type === 'ok' ? 'text-emerald-700' : 'text-red-600'}`}>
            {message.texte}
          </p>
        )}

        <p className="mt-3 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500 ring-1 ring-slate-200">
          <IconCalendarDays /> Les montants saisis ci-dessous entrent en vigueur en <b>{MOIS[mois - 1]} {annee}</b> et restent
          appliqués aux mois suivants jusqu'au prochain changement. « Vider une case » retire seulement le changement de
          ce mois (retour au montant précédent) ; l'historique des mois antérieurs n'est jamais modifié.
        </p>

        <div className="mt-3 table-wrap">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-xs font-semibold text-slate-500">
                <th className="px-3 py-2 text-start">Catégorie</th>
                {TYPES_INFO.map((t) => (
                  <th key={t.key} className="px-3 py-2 text-end" title={t.label}>
                    {t.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lignes.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-3 py-8 text-center text-slate-400">
                    {chargement ? 'Chargement…' : 'Aucune catégorie.'}
                  </td>
                </tr>
              ) : (
                lignes.map((l) => {
                  const modifiee = TYPES_INFO.some((t) => !valeurEq(l[t.key], l._orig[t.key]));
                  return (
                    <tr key={l.id} className={`border-b hover:bg-slate-50 ${modifiee ? 'bg-amber-50/60' : ''}`}>
                      <td className="px-3 py-2 text-sm font-semibold text-slate-800">{l.libelle}</td>
                      {TYPES_INFO.map((t) => (
                        <td key={t.key} className="px-2 py-1.5 text-end">
                          <input
                            className="input w-32 text-end font-mono text-xs"
                            inputMode="decimal"
                            placeholder="0,00"
                            title={`${t.label} — ${l.libelle}`}
                            aria-label={`${t.label} — ${l.libelle}`}
                            value={l[t.key]}
                            onChange={(e) => modifier(l.id, t.key, e.target.value)}
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50 text-xs font-bold text-slate-600">
                <td className="px-3 py-2">Total ({lignes.length} catégorie{lignes.length > 1 ? 's' : ''})</td>
                {TYPES_INFO.map((t) => (
                  <td key={t.key} className="px-3 py-2 text-end font-mono">
                    {fmtMontant(lignes.reduce((s, l) => s + (parseFloat(String(l[t.key]).trim().replace(',', '.')) || 0), 0))}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>

        {modifiees.length > 0 && (
          <p className="mt-2 text-xs text-amber-700">
            Les lignes surlignées sont modifiées mais pas encore enregistrées — cliquez sur « Enregistrer pour ce mois ».
          </p>
        )}
      </div>

      {/* Historique des changements */}
      <div className="card overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">
            Historique des changements ({changements.length})
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Chaque ligne représente un changement de montant entré en vigueur à son mois.
          </p>
        </div>
        {changements.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-slate-400">
            Aucun changement enregistré pour le moment.
          </div>
        ) : (
          <div className="table-wrap">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-start text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2.5">Mois d'effet</th>
                  <th className="px-4 py-2.5">Catégorie</th>
                  <th className="px-4 py-2.5">Indemnité</th>
                  <th className="px-4 py-2.5 text-end">Montant (DT)</th>
                  <th className="px-4 py-2.5 text-end">Action</th>
                </tr>
              </thead>
              <tbody>
                {changements.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-mono text-xs font-semibold text-slate-700">
                      {MOIS[c.mois - 1]} {c.annee}
                    </td>
                    <td className="px-4 py-2.5 text-slate-700">{c.categorie}</td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {TYPES_INFO.find((t) => t.key === c.type)?.label || c.type}
                    </td>
                    <td className="px-4 py-2.5 text-end font-mono text-slate-800">{fmtMontant(c.montant)}</td>
                    <td className="px-4 py-2.5 text-end">
                      <button
                        className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:underline"
                        onClick={() => setSupprId(c.id)}
                      >
                        <IconTrash /> Supprimer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Boîte de confirmation suppression d'un changement */}
      {supprId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overscroll-contain bg-slate-900/50 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:p-4">
          <div className="modal-shell w-full max-w-md rounded-xl border border-red-200 bg-white p-4 shadow-xl sm:p-6">
            <div className="mb-3 flex items-start gap-3">
              <span className="mt-0.5 text-red-600"><IconTrash /></span>
              <div>
                <h3 className="text-lg font-bold text-red-700">Supprimer ce changement</h3>
                <p className="text-sm text-slate-700">
                  Le montant saisi pour ce mois sera retiré de l'historique. Les mois concernés
                  reviendront au montant précédemment en vigueur.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setSupprId(null)} disabled={supprBusy}>Annuler</button>
              <button
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={supprimerChangement}
                disabled={supprBusy}
              >
                {supprBusy ? 'Suppression…' : 'Confirmer la suppression'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}