import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { IconRefresh } from '../components/icons';

const COLS = [
  { key: 'transport', label: 'Indemnité de transport', short: 'Transport' },
  { key: 'presence', label: 'Indemnité de présence', short: 'Présence' },
  { key: 'fonction', label: 'Indemnité de Fonction', short: 'Fonction' },
];

const ANNEES = [2025, 2026, 2027, 2028, 2029, 2030];
const MOIS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

// Autorise uniquement les caractères d'un nombre décimal (virgule française incluse)
function normaliserSaisie(valeur) {
  const s = String(valeur == null ? '' : valeur);
  const n = s.replace(/[^\d.,-]/g, '');
  const parties = n.split(/[.,]/);
  if (parties.length > 2) return `${parties[0]}.${parties.slice(1).join('')}`;
  return n;
}

function valeurEq(a, b) {
  const na = a == null || String(a).trim() === '' ? null : String(a).trim();
  const nb = b == null || String(b).trim() === '' ? null : String(b).trim();
  if (na === null && nb === null) return true;
  if (na === null || nb === null) return false;
  const ca = Number(na.replace(',', '.'));
  const cb = Number(nb.replace(',', '.'));
  return Number.isFinite(ca) && Number.isFinite(cb) && ca === cb;
}

// Étiquettes de la source d'un montant transport/présence (affiche l'origine de la valeur).
// L'ancienne source « Fiche » (valeur de base du dossier employé) a été supprimée : seul le
// référentiel des catégories (« Montants des indemnités F&V ») est utilisé.
const SOURCES = {
  manuel: { libelle: 'Surcharge', classe: 'bg-amber-100 text-amber-700' },
  categorie: { libelle: 'Catégorie', classe: 'bg-sky-100 text-sky-700' },
};

const aujourdhui = new Date();

export default function IndemnitesFv() {
  const [annee, setAnnee] = useState(ANNEES.includes(aujourdhui.getFullYear()) ? aujourdhui.getFullYear() : 2026);
  const [mois, setMois] = useState(aujourdhui.getMonth() + 1);
  const [lignes, setLignes] = useState([]);
  const [recherche, setRecherche] = useState('');
  const [chargement, setChargement] = useState(true);
  const [sauvegarde, setSauvegarde] = useState(false);
  const [reaffBusy, setReaffBusy] = useState(false);
  const [confirmReaff, setConfirmReaff] = useState(false);
  const [message, setMessage] = useState(null);

  const charger = async (anneeSel, moisSel) => {
    setChargement(true);
    setMessage(null);
    try {
      const d = await api.indemnitesFv({ annee: anneeSel, mois: moisSel });
      setLignes(
        d.lignes.map((r) => ({
          id: r.id,
          matricule: r.matricule,
          nom: r.nom,
          prenom: r.prenom,
          categorie: r.categorie || '',
          departement: r.departement,
          transport: r.indemnite_transport == null ? '' : String(r.indemnite_transport),
          presence: r.indemnite_presence == null ? '' : String(r.indemnite_presence),
          fonction: r.indemnite_fonction == null ? '' : String(r.indemnite_fonction),
          srcTransport: r.transport_source || '',
          srcPresence: r.presence_source || '',
          catTransport: r.categorie_transport == null ? '' : String(r.categorie_transport),
          catPresence: r.categorie_presence == null ? '' : String(r.categorie_presence),
          _orig: {
            transport: r.indemnite_transport == null ? '' : String(r.indemnite_transport),
            presence: r.indemnite_presence == null ? '' : String(r.indemnite_presence),
            fonction: r.indemnite_fonction == null ? '' : String(r.indemnite_fonction),
          },
        }))
      );
    } catch (e) {
      setMessage({ type: 'erreur', texte: e.message });
    } finally {
      setChargement(false);
    }
  };

  useEffect(() => { charger(annee, mois); }, [annee, mois]);

  const filtre = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return lignes;
    return lignes.filter((l) =>
      `${l.matricule} ${l.nom} ${l.prenom} ${l.categorie} ${l.departement}`.toLowerCase().includes(q)
    );
  }, [lignes, recherche]);

  const modifier = (id, key, valeur) => {
    setLignes((prev) => prev.map((l) => (l.id === id ? { ...l, [key]: normaliserSaisie(valeur) } : l)));
    setMessage(null);
  };

  const modifiees = useMemo(
    () => lignes.filter((l) => COLS.some((c) => !valeurEq(l[c.key], l._orig[c.key]))),
    [lignes]
  );

  const surcharges = useMemo(
    () => lignes.filter((l) => l.srcTransport === 'manuel' || l.srcPresence === 'manuel'),
    [lignes]
  );

  const total = (key) =>
    filtre.reduce(
      (s, l) => s + (parseFloat(String(l[key]).trim().replace(',', '.')) || 0),
      0
    );

  const enregistrer = async () => {
    if (modifiees.length === 0) return;
    setSauvegarde(true);
    setMessage(null);
    try {
      const r = await api.sauverIndemnitesFv({
        annee,
        mois,
        lignes: modifiees.map((l) => ({
          id: l.id,
          transport: l.transport,
          presence: l.presence,
          fonction: l.fonction,
        })),
      });
      setMessage({ type: 'ok', texte: `${r.total} employé(s) enregistré(s) pour ${MOIS[mois - 1]} ${annee}.` });
      await charger(annee, mois);
    } catch (e) {
      setMessage({ type: 'erreur', texte: e.message });
    } finally {
      setSauvegarde(false);
    }
  };

  const effacer = (id) => {
    setLignes((prev) =>
      prev.map((l) => (l.id === id ? { ...l, transport: '', presence: '', fonction: '' } : l))
    );
    setMessage(null);
  };

  const reaffecter = async () => {
    setReaffBusy(true);
    setMessage(null);
    try {
      const r = await api.reaffecterIndemnitesFv({ annee, mois });
      setMessage({ type: 'ok', texte: r.message || `${r.retires} surcharge(s) supprimée(s).` });
      setConfirmReaff(false);
      await charger(annee, mois);
    } catch (e) {
      setMessage({ type: 'erreur', texte: e.message });
    } finally {
      setReaffBusy(false);
    }
  };

  const badge = (source) => {
    const s = SOURCES[source];
    if (!s) return null;
    return <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${s.classe}`}>{s.libelle}</span>;
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">
        Paie Mensuelle — Indemnités F&V : indemnités de présence, transport et fonction en vigueur
        pour {MOIS[mois - 1]} {annee}.
      </div>

      <div className="card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <h3 className="text-sm font-bold text-slate-800">Tableau des indemnités</h3>
            <p className="text-xs text-slate-500">
              {lignes.length} employé(s) · {modifiees.length} ligne(s) modifiée(s) · {surcharges.length} surcharge(s)
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
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
            <input
              className="input w-full sm:w-56"
              placeholder="Rechercher (catégorie, matricule, nom, prénom)…"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
            />
            <button className="btn btn-primary" onClick={enregistrer} disabled={sauvegarde || modifiees.length === 0}>
              {sauvegarde ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => setConfirmReaff(true)}
              disabled={reaffBusy || chargement}
              title="Réaffecte les montants de transport et de présence de tous les employés depuis le montant fixe de leur catégorie (Montants des indemnités F&V)"
            >
              <IconRefresh /> {reaffBusy ? 'Réaffectation…' : 'Réaffecter depuis les catégories'}
            </button>
          </div>
        </div>

        {message && (
          <p className={`mt-3 text-sm font-semibold ${message.type === 'ok' ? 'text-emerald-700' : 'text-red-600'}`}>
            {message.texte}
          </p>
        )}

        <div className="mt-3 table-wrap">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-xs font-semibold text-slate-500">
                <th className="px-3 py-2 text-start">Catégorie</th>
                <th className="px-3 py-2 text-start">Matricule</th>
                <th className="px-3 py-2 text-start">Nom et Prénom</th>
                {COLS.map((c) => (
                  <th key={c.key} className="px-3 py-2 text-end" title={c.label}>{c.label}</th>
                ))}
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtre.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-slate-400">
                    {chargement ? 'Chargement…' : 'Aucun employé trouvé.'}
                  </td>
                </tr>
              ) : (
                filtre.map((l) => {
                  const modifiee = COLS.some((c) => !valeurEq(l[c.key], l._orig[c.key]));
                  return (
                    <tr key={l.id} className={`border-b hover:bg-slate-50 ${modifiee ? 'bg-amber-50/60' : ''}`}>
                      <td className="px-3 py-2 text-xs font-semibold text-brand-700">{l.categorie || '—'}</td>
                      <td className="px-3 py-2 font-mono text-xs font-semibold text-slate-700">{l.matricule}</td>
                      <td className="px-3 py-2 text-slate-800">
                        {l.nom} {l.prenom}
                        {l.departement ? <span className="ms-1 text-[10px] text-slate-400">({l.departement})</span> : null}
                      </td>
                      {COLS.map((c) => {
                        const source = c.key === 'transport' ? l.srcTransport : c.key === 'presence' ? l.srcPresence : null;
                        const refCat = c.key === 'transport' ? l.catTransport : c.key === 'presence' ? l.catPresence : '';
                        const estSurcharge = (c.key === 'transport' && l.srcTransport === 'manuel') || (c.key === 'presence' && l.srcPresence === 'manuel');
                        return (
                          <td key={c.key} className="px-2 py-1.5 text-end">
                            <div className="flex items-center justify-end gap-1.5">
                              {source ? badge(source) : null}
                              <input
                                className="input w-28 text-end font-mono text-xs sm:w-32"
                                inputMode="decimal"
                                placeholder="0,00"
                                title={`${c.label} — mat. ${l.matricule}${refCat ? ` — catégorie: ${refCat}` : ''}`}
                                aria-label={`${c.label} — mat. ${l.matricule}`}
                                value={l[c.key]}
                                onChange={(e) => modifier(l.id, c.key, e.target.value)}
                              />
                            </div>
                            {estSurcharge && refCat ? (
                              <p className="mt-0.5 text-[9px] text-slate-400">Réf. catégorie : {refCat}</p>
                            ) : null}
                          </td>
                        );
                      })}
                      <td className="px-2 py-1.5 text-end">
                        <button
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          title="Effacer les 3 indemnités de cet employé"
                          onClick={() => effacer(l.id)}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" /></svg>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {filtre.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50 text-xs font-bold text-slate-600">
                  <td className="px-3 py-2" colSpan={3}>Total ({filtre.length} ligne{filtre.length > 1 ? 's' : ''})</td>
                  {COLS.map((c) => (
                    <td key={c.key} className="px-3 py-2 text-end font-mono">
                      {total(c.key).toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                    </td>
                  ))}
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {modifiees.length > 0 && (
          <p className="mt-2 text-xs text-amber-700">
            Les lignes surlignées sont modifiées mais pas encore enregistrées — cliquez sur « Enregistrer » pour les appliquer.
          </p>
        )}
      </div>

      {confirmReaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overscroll-contain bg-slate-900/50 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:p-4">
          <div className="modal-shell w-full max-w-md rounded-xl border border-amber-200 bg-white p-4 shadow-xl sm:p-6">
            <div className="mb-3 flex items-start gap-3">
              <span className="mt-0.5 text-amber-600"><IconRefresh /></span>
              <div>
                <h3 className="text-lg font-bold text-amber-700">Réaffecter depuis les catégories</h3>
                <p className="text-sm text-slate-700">
                  Toutes les <b>surcharges manuelles</b> de transport et de présence seront supprimées.
                  Chaque employé suivra uniquement le <b>montant fixe de sa catégorie</b> défini dans
                  « Montants des indemnités F&V » (case vide si la catégorie n'en définit pas).
                  L'indemnité de fonction n'est pas modifiée.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setConfirmReaff(false)} disabled={reaffBusy}>Annuler</button>
              <button
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={reaffecter}
                disabled={reaffBusy}
              >
                {reaffBusy ? 'Réaffectation…' : 'Confirmer la réaffectation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}