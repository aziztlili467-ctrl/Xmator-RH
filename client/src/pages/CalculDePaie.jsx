import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { fmtDate } from '../utils';
import {
  IconCalculator, IconClipboardList, IconCalendarDays, IconFileText, IconRefresh,
} from '../components/icons';
import BulletinDePaie from '../components/BulletinDePaie';

const MOIS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const ANNEES = [2026, 2027, 2028, 2029, 2030];

const fmtNombre = (n) => {
  const v = Number(n) || 0;
  return v.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
};

const pad = (n) => String(n).padStart(2, '0');
const isoYMD = (y, m0, d) => `${y}-${pad(m0 + 1)}-${pad(d)}`;

export default function CalculDePaie() {
  const [employes, setEmployes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filtre, setFiltre] = useState('');
  const [selId, setSelId] = useState(null);

  // Calendrier mensuel synchronisé avec le cycle de calcul.
  // Un mois est « figé » tant que la date d'aujourd'hui n'a pas atteint la date de FIN de son cycle
  // (ex. : un mois s'active automatiquement à la date de fin de son cycle, soit début + 30 jours).
  const now = new Date();
  const aujourdhuiIso = isoYMD(now.getFullYear(), now.getMonth(), now.getDate());
  const [annee, setAnnee] = useState(now.getFullYear());
  const [moisSel, setMoisSel] = useState(null);
  const [regles, setRegles] = useState({
    jour_debut: 21, jour_fin: 20, mode: 'forfaitaire', base_jours: 30, carence_ma: 2,
    base_reference: 'ouvres', regime_horaire: 173.33, taux_horaire: 'auto', decompte_horaire: 'deduction',
  });
  const [cycles, setCycles] = useState({});
  const [previsions, setPrevisions] = useState(null);
  const [prevCharge, setPrevCharge] = useState(false);
  const [prevErr, setPrevErr] = useState('');

  useEffect(() => {
    let mort = false;
    api.employes()
      .then((rows) => { if (!mort) setEmployes(Array.isArray(rows) ? rows : []); })
      .catch((e) => { if (!mort) setError(e.message || 'Une erreur est survenue.'); })
      .finally(() => { if (!mort) setLoading(false); });
    return () => { mort = true; };
  }, []);

  useEffect(() => {
    let mort = false;
    api.reglesCycleCalcul()
      .then((d) => { if (!mort && d?.regles) setRegles((r) => ({ ...r, ...d.regles })); })
      .catch(() => {});
    return () => { mort = true; };
  }, []);

  // Cycles personnalisés de l'année (sinon la règle générale jour_debut → jour_fin s'applique)
  useEffect(() => {
    let mort = false;
    api.cyclesCalcul(annee)
      .then((rows) => {
        if (mort) return;
        const map = {};
        (Array.isArray(rows) ? rows : []).forEach((r) => { map[r.mois] = { debut: r.debut, fin: r.fin }; });
        setCycles(map);
      })
      .catch(() => {});
    return () => { mort = true; };
  }, [annee]);

  // Prévisions de paie : Nbr_Jours_Paie de tous les actifs pour le mois sélectionné
  useEffect(() => {
    if (moisSel === null) { setPrevisions(null); setPrevCharge(false); setPrevErr(''); return undefined; }
    let mort = false;
    setPrevCharge(true);
    setPrevErr('');
    api.previsionsBulletins({ annee, mois: moisSel + 1 })
      .then((d) => { if (!mort) setPrevisions(d); })
      .catch((e) => { if (!mort) { setPrevisions(null); setPrevErr(e.message || 'Impossible de calculer les prévisions du mois.'); } })
      .finally(() => { if (!mort) setPrevCharge(false); });
    return () => { mort = true; };
  }, [annee, moisSel]);

  const trie = useMemo(
    () => [...employes].sort((a, b) => {
      const diff = (Number(a.matricule) || 0) - (Number(b.matricule) || 0);
      return diff !== 0 ? diff : String(a.matricule).localeCompare(String(b.matricule));
    }),
    [employes]
  );

  const filtres = useMemo(() => {
    const f = filtre.trim().toLowerCase();
    if (!f) return trie;
    const exacts = trie.filter((e) => String(e.matricule).toLowerCase() === f);
    return (exacts.length ? exacts : trie).filter((e) =>
      String(e.matricule).toLowerCase().startsWith(f) ||
      String(e.nom || '').toLowerCase().includes(f) ||
      String(e.prenom || '').toLowerCase().includes(f) ||
      `${e.nom} ${e.prenom}`.toLowerCase().includes(f)
    );
  }, [trie, filtre]);

  useEffect(() => {
    if (filtre.trim() && String(filtre).trim() === String(filtres[0]?.matricule || '').trim() && filtres.length === 1) {
      setSelId(filtres[0].id);
    }
  }, [filtres, filtre]);

  // Dates du cycle d'un mois (1-12 → index 0-11) : ligne cycles_calcul personnalisée sinon règle générale
  const cycleDe = (m0) => {
    const custom = cycles[m0 + 1];
    if (custom && custom.debut && custom.fin) return { ...custom, source: 'personnalise' };
    const prevY = m0 === 0 ? annee - 1 : annee;
    const prevM = m0 === 0 ? 11 : m0 - 1;
    return {
      debut: isoYMD(prevY, prevM, regles.jour_debut),
      fin: isoYMD(annee, m0, regles.jour_fin),
      source: 'regle',
    };
  };

  // Mois verrouillé tant que la date d'aujourd'hui est antérieure à la fin de son cycle :
  // la fiche de paie d'un mois ne peut être générée qu'après la clôture du cycle correspondant.
  const verrouillePour = (y, m0) => {
    const custom = cycles[m0 + 1];
    const fin = custom && custom.fin ? custom.fin : isoYMD(y, m0, regles.jour_fin);
    return aujourdhuiIso < String(fin);
  };
  const estVerrouille = (m0) => verrouillePour(annee, m0);

  // Dernier mois débloqué d'une année (le plus récent dont le cycle est terminé) — null si tout est figé.
  const dernierMoisActif = (y) => {
    for (let i = 11; i >= 0; i--) if (!verrouillePour(y, i)) return i;
    return null;
  };

  // Maintient la sélection sur un mois débloqué : à l'ouverture (année courante → dernier mois dont le
  // cycle est fini), au changement d'année, ou si les règles/cycles font basculer le mois sélectionné en figé.
  useEffect(() => {
    const dernier = dernierMoisActif(annee);
    if (dernier === null) {
      if (moisSel !== null) setMoisSel(null);
    } else if (moisSel === null || estVerrouille(moisSel)) {
      setMoisSel(dernier);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annee, regles, cycles]);

  const cycleActif = previsions?.periode || null;

  const lignesPrevisions = useMemo(() => {
    if (!previsions?.employes) return [];
    const f = filtre.trim().toLowerCase();
    return previsions.employes
      .map(({ employe, result }) => {
        const e = employes.find((x) => String(x.id) === String(employe.id)) || null;
        const base = e ? (Number(e.salaire_base) || 0) : 0;
        const indem = e ? (Number(e.fv_presence) || 0) + (Number(e.fv_transport) || 0) + (Number(e.indemnite_fonction) || 0) : 0;
        const brut = base + indem;
        // Unité du mode de calcul : heures (régime horaire → base × volume, prix inclus dans le
        // résultat serveur) ou jours (forfaitaire / prorata → base × N / base du cycle).
        const enHeures = result?.unite === 'heures';
        const partBase = enHeures
          ? result.nbr_unites * (result.prix_heure || 0)
          : base * (result.nbr_unites / (result.base_unites || 30));
        const prorata = partBase + indem;
        return { id: employe.id, matricule: employe.matricule, nom: `${employe.nom || ''} ${employe.prenom || ''}`.trim(), base, indem, brut, prorata, enHeures, result };
      })
      .filter((r) => !f || String(r.matricule).toLowerCase().startsWith(f) || r.nom.toLowerCase().includes(f))
      .sort((a, b) => (Number(a.matricule) || 0) - (Number(b.matricule) || 0) || String(a.matricule).localeCompare(String(b.matricule)));
  }, [previsions, employes, filtre]);

  const statsMois = useMemo(() => {
    if (!lignesPrevisions.length) return null;
    const enHeures = lignesPrevisions.some((r) => r.enHeures);
    const unite = enHeures ? 'h' : 'j';
    const baseRef = enHeures ? (Number(regles.regime_horaire) || 173.33) : (Number(regles.base_jours) || 30);
    return {
      effectif: lignesPrevisions.length,
      unite,
      baseRef,
      unitesTotal: lignesPrevisions.reduce((s, r) => s + (r.result.nbr_unites || 0), 0),
      avecDedution: lignesPrevisions.filter((r) => (r.enHeures ? (r.result.heures_deduits || 0) : (r.result.jours_deduits || 0)) > 0).length,
      massBrut: lignesPrevisions.reduce((s, r) => s + r.brut, 0),
      massNet: lignesPrevisions.reduce((s, r) => s + r.prorata, 0),
    };
  }, [lignesPrevisions, regles]);

  const selection = useMemo(() => employes.find((e) => String(e.id) === String(selId)) || null, [employes, selId]);

  const synchro = useMemo(() => selection ? {
    'Salaire de base (Grille de salaire)': Number(selection.salaire_base) || 0,
    'Indemnité de présence (Indemnités F&V)': Number(selection.fv_presence) || 0,
    'Indemnité de transport (Indemnités F&V)': Number(selection.fv_transport) || 0,
    'Indemnité de fonction (Fiche employé)': Number(selection.indemnite_fonction) || 0,
  } : null, [selection]);

  const brutEstime = useMemo(() => synchro ? Object.values(synchro).reduce((s, v) => s + v, 0) : 0, [synchro]);

  const employeBulletin = useMemo(() => selection ? {
    matricule: String(selection.matricule),
    nom: `${selection.nom || ''} ${selection.prenom || ''}`.trim(),
    cnss: selection.cnss || '',
    qualification: selection.intitule_poste || selection.categorie || '',
    affectation: selection.departement || '',
    situationFamille: selection.situation_familiale || '',
    categorieEchelon: [
      selection.categorie,
      selection.grade ? `Grd. ${selection.grade}` : '',
      selection.classe ? `Cl. ${selection.classe}` : '',
      selection.echelon ? `Éch. ${selection.echelon}` : '',
    ].filter(Boolean).join(' / '),
    situationAdmin: selection.actif ? 'Titulaire' : 'Non actif',
  } : null, [selection]);

  const montants = useMemo(() => selection ? {
    '5011': Number(selection.salaire_base) || 0,
    '10011': Number(selection.fv_presence) || 0,
    '10021': Number(selection.fv_transport) || 0,
    '25011': Number(selection.indemnite_fonction) || 0,
  } : null, [selection]);

  const genererFiche = (id) => {
    setSelId(String(id));
    requestAnimationFrame(() => {
      document.getElementById('fiche-calcul-paie')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="print:hidden flex items-start justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">CALCUL DE PAIE</h2>
          <p className="max-w-3xl text-sm text-slate-500">
            Calendrier mensuel synchronisé avec le cycle de calcul (Référentiel → Paramètre de Salaire) :
            choisissez un mois, les <b>unités de paie</b> de chaque employé sont calculées sur le cycle selon
            le mode enregistré (forfaitaire, prorata réel ou régime horaire — jours ou heures), réduites des
            absences A1 / MALD et de la maladie MA (règle de prélèvement), puis générez sa fiche de paie
            mois par mois et
            année par année, en tenant compte de tous les paramètres de calcul actuels (rubriques,
            grille de salaire, indemnités, taux CNSS/CSS/IRPP). Un mois reste <b>figé</b> tant que son
            cycle n'est pas terminé : il s'active automatiquement à la date de fin du cycle
            (aujourd'hui : <b>{fmtDate(aujourdhuiIso)}</b>).
          </p>
        </div>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}

      {loading ? (
        <div className="card p-10 text-center text-sm text-slate-400">Chargement des employés…</div>
      ) : (
        <>
          {/* ==================== Calendrier mensuel ==================== */}
          <div className="print:hidden card p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                <IconCalendarDays /> Calendrier de paie {annee} — synchronisé avec le cycle de calcul
              </p>
              <label className="flex items-center gap-1.5 text-xs text-slate-600">
                Année :
                <select className="input py-1 text-xs" value={annee} onChange={(e) => setAnnee(Number(e.target.value))}>
                  {ANNEES.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {MOIS_FR.map((m, i) => {
                const c = cycleDe(i);
                const actif = moisSel === i;
                const perso = c.source === 'personnalise';
                const fige = verrouillePour(annee, i);
                return (
                  <button
                    key={m}
                    type="button"
                    disabled={fige}
                    onClick={() => setMoisSel(i)}
                    title={fige
                      ? `Mois figé — sa fiche de paie sera disponible à la fin de son cycle : ${fmtDate(c.fin)}`
                      : `Cycle : ${fmtDate(c.debut)} → ${fmtDate(c.fin)} (${perso ? 'personnalisé' : 'règle générale'})`}
                    className={`rounded-xl border p-3 text-left transition-colors ${
                      fige
                        ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400 opacity-70'
                        : actif
                          ? 'border-brand-500 bg-brand-50/80 text-brand-700 ring-2 ring-brand-500'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-brand-300 hover:bg-brand-50/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <p className={`text-sm font-bold ${fige ? '' : actif ? 'text-brand-700' : 'text-slate-700'}`}>{m}</p>
                      {fige ? (
                        <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500">
                          Figé
                        </span>
                      ) : (
                        <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                          perso ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {perso ? 'Perso' : 'Règle'}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] tabular-nums text-slate-500">
                      {fige
                        ? `Actif à partir du ${fmtDate(c.fin)}`
                        : `${fmtDate(c.debut)} → ${fmtDate(c.fin)}`}
                    </p>
                    <p className="text-[10px] text-slate-400">
  {regles.mode === 'horaire'
    ? `Régime ${Number(regles.regime_horaire) || 173.33} h · MA : ${regles.ma_jours_payes ?? 5} j payés`
    : `Base ${regles.base_jours} j · MA : ${regles.ma_jours_payes ?? 5} j payés`}
</p>
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-[11px] text-slate-400">
              Les mois <b>figés</b> (cycle non encore terminé) restent verrouillés jusqu'à la date de fin du
              cycle : leur fiche de paie ne se génère qu'à partir de cette date — aujourd'hui : <b>{fmtDate(aujourdhuiIso)}</b>
              . Exemple : un mois s'active automatiquement à la date de fin de son cycle (début + 30 jours).
            </p>
          </div>

          {/* ==================== Mois sélectionné : employés + fiche de paie ==================== */}
          <div className="print:hidden card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  <IconClipboardList /> {moisSel !== null ? `${MOIS_FR[moisSel]} ${annee} — prévisions de paie` : `Aucun mois actif en ${annee} — tous les cycles sont figés`}
                </p>
                {cycleActif && (
                  <p className="mt-1 text-xs text-slate-500">
                    Cycle : <b className="text-slate-700">{fmtDate(cycleActif.debut)} → {fmtDate(cycleActif.fin)}</b>
<span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
  {regles.mode === 'horaire'
    ? `${Number(regles.regime_horaire) || 173.33} h de régime · MA : ${regles.ma_jours_payes ?? 5} j payés (1er épisode)`
    : `${regles.base_jours || 30} j de base · MA : ${regles.ma_jours_payes ?? 5} j payés (1er épisode)`}
</span>
                    <span className={`ml-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      cycleActif.source === 'personnalise' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                    }`}>
                      {cycleActif.source === 'personnalise' ? 'Cycle personnalisé' : 'Règle générale du cycle'}
                    </span>
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  className="input w-full sm:w-64"
                  placeholder="Filtrer par matricule ou nom…"
                  value={filtre}
                  onChange={(e) => setFiltre(e.target.value)}
                />
                <button
                  type="button"
                  className="btn-secondary h-8 px-3 text-xs"
                  onClick={() => { setFiltre(''); setSelId(null); }}
                  title="Réinitialiser le filtre et la sélection"
                >
                  <IconRefresh />
                </button>
              </div>
            </div>

            {statsMois && (
              <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-slate-200 ring-1 ring-slate-200 sm:grid-cols-5">
                <div className="bg-white px-3 py-2">
                  <p className="text-[10px] font-bold uppercase text-slate-400">Effectif (actifs)</p>
                  <p className="text-sm font-bold text-slate-800">{statsMois.effectif}</p>
                </div>
                <div className="bg-white px-3 py-2">
                  <p className="text-[10px] font-bold uppercase text-slate-400">Unités de paie cumulées ({statsMois.unite})</p>
                  <p className="text-sm font-bold text-slate-800">{fmtNombre(statsMois.unitesTotal)} <span className="text-[10px] font-normal text-slate-400">/ {fmtNombre(statsMois.effectif * statsMois.baseRef)}</span></p>
                </div>
                <div className="bg-white px-3 py-2">
                  <p className="text-[10px] font-bold uppercase text-slate-400">Employés avec déductions</p>
                  <p className="text-sm font-bold text-amber-600">{statsMois.avecDedution}</p>
                </div>
                <div className="bg-white px-3 py-2">
                  <p className="text-[10px] font-bold uppercase text-slate-400">Masse salariale (fixe)</p>
                  <p className="text-sm font-bold text-slate-800">{fmtNombre(statsMois.massBrut)} <span className="text-[10px] font-normal text-slate-400">DT</span></p>
                </div>
                <div className="bg-white px-3 py-2">
                  <p className="text-[10px] font-bold uppercase text-slate-400">Masse salariale (proratisée)</p>
                  <p className="text-sm font-bold text-brand-700">{fmtNombre(statsMois.massNet)} <span className="text-[10px] font-normal text-slate-400">DT</span></p>
                </div>
              </div>
            )}

            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    <th className="py-2 pr-2 text-left">Matricule</th>
                    <th className="py-2 pr-2 text-left">Employé</th>
                    <th className="py-2 pr-2 text-right">Salaire fixe (DT)</th>
                    <th className="py-2 pr-2 text-center">Unités de paie</th>
                    <th className="py-2 pr-2 text-right">Brut adapté au cycle (DT)</th>
                    <th className="py-2 pr-2 text-right">Déductions</th>
                    <th className="py-2 text-right">Fiche de paie</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {moisSel === null ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center">
                        <p className="text-sm font-semibold text-slate-500">Tous les mois de {annee} sont figés</p>
                        <p className="mx-auto mt-1 max-w-lg text-xs text-slate-400">
                          Leur cycle de calcul n'étant pas terminé, ils se déverrouillent automatiquement à la
                          date de fin de chaque cycle (la fin est calculée automatiquement : début + 30 jours).
                        </p>
                      </td>
                    </tr>
                  ) : prevCharge ? (
                    <tr><td colSpan={7} className="py-8 text-center text-sm text-slate-400">Calcul des prévisions du mois…</td></tr>
                  ) : prevErr ? (
                    <tr><td colSpan={7} className="py-8 text-center text-sm text-red-600">{prevErr}</td></tr>
                  ) : lignesPrevisions.length === 0 ? (
                    <tr><td colSpan={7} className="py-8 text-center text-sm text-slate-400">Aucun employé ne correspond au filtre.</td></tr>
                  ) : lignesPrevisions.map((r) => (
                    <tr key={r.id} className={`hover:bg-slate-50/60 ${String(r.id) === String(selId) ? 'bg-brand-50/40' : ''}`}>
                      <td className="py-2 pr-2 font-mono text-xs text-slate-500">{String(r.matricule).padStart(4, '0')}</td>
                      <td className="py-2 pr-2 font-semibold text-slate-700">{r.nom}</td>
                      <td className="py-2 pr-2 text-right tabular-nums text-slate-700">{fmtNombre(r.brut)}</td>
                      <td className="py-2 pr-2 text-center">
                        <b className={r.result.nbr_unites < statsMois?.baseRef ? 'text-amber-600' : 'text-emerald-700'}>
                          {fmtNombre(r.result.nbr_unites)}
                        </b>
                        <span className="text-[10px] text-slate-400"> / {fmtNombre(statsMois?.baseRef)}{r.enHeures ? ' h' : ''}</span>
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums font-bold text-slate-800">{fmtNombre(r.prorata)}</td>
                      <td className="py-2 pr-2 text-right text-[11px] tabular-nums text-slate-400">
                        {r.enHeures
                          ? ((r.result.heures_deduits || 0) > 0
                            ? `A1 ${fmtNombre(r.result.heures_a1)} h · MALD ${fmtNombre(r.result.heures_mald)} h · MA déduit ${fmtNombre(r.result.heures_carence)} h`
                            : '—')
                          : (r.result.jours_deduits > 0
                            ? `A1 ${r.result.jours_a1} · MALD ${r.result.jours_mald} · MA déduit ${r.result.carence_appliquee}`
                            : '—')}
                      </td>
                      <td className="py-2 text-right">
                        <button
                          type="button"
                          onClick={() => genererFiche(r.id)}
                          className="btn-primary h-8 px-3 text-xs"
                        >
                          <IconFileText className="mr-1 inline h-3 w-3" />Générer la fiche
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Données synchronisées + fiche de paie calculée */}
          {selection && synchro && (
            <div id="fiche-calcul-paie" className="scroll-mt-24">
              <div className="print:hidden card overflow-hidden">
                <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/60 px-4 py-3">
                  <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-700">
                    <IconClipboardList /> Données insérées automatiquement — Mat. {String(selection.matricule).padStart(4, '0')}
                    <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-semibold text-brand-700">
                      {MOIS_FR[moisSel]} {annee}
                    </span>
                  </p>
                  <span className="text-xs text-slate-500">
                    <b className="text-slate-700">{fmtNombre(brutEstime)}</b> DT — salaire brut estimé
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-px bg-slate-200 sm:grid-cols-3 lg:grid-cols-4">
                  {Object.entries(synchro).map(([label, valeur]) => (
                    <div key={label} className="bg-white px-4 py-3">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
                      <p className="mt-1 text-sm font-bold text-slate-800">{fmtNombre(valeur)} <span className="text-[10px] font-normal text-slate-400">DT</span></p>
                    </div>
                  ))}
                </div>
              </div>

              <BulletinDePaie
                key={selection.id}
                employe={employeBulletin}
                montants={montants}
                masquerSansValeur
                periode={moisSel !== null ? { mois: moisSel, annee } : { mois: 0, annee }}
                onPeriodeChange={(p) => {
                  if (p && Number.isInteger(p.mois) && !verrouillePour(p.annee, p.mois)) {
                    setAnnee(p.annee);
                    setMoisSel(p.mois);
                  }
                }}
                chefFamille={
                  selection.chef_famille
                    ? String(selection.chef_famille).toUpperCase() === 'OUI'
                    : /mari|divorc|veuf/i.test(selection.situation_familiale || '')
                }
                nbEnfants={
                  selection.enfants_a_charge != null && selection.enfants_a_charge !== ''
                    ? Number(selection.enfants_a_charge) || 0
                    : Number(selection.nombre_enfants) || 0
                }
              />
            </div>
          )}

          {/* Aide si aucune sélection */}
          {!selection && !loading && (
            <div className="print:hidden card p-8 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
                <IconCalculator />
              </div>
              <p className="mt-3 text-sm font-bold uppercase tracking-wide text-slate-700">
                Choisissez un employé pour générer sa fiche
              </p>
              <p className="mx-auto mt-1 max-w-xl text-sm text-slate-500">
                Sélectionnez un mois <b>débloqué</b> dans le calendrier (les mois dont le cycle n'est pas terminé
                restent figés), puis cliquez sur <b>« Générer la fiche »</b> dans le tableau de prévisions (ou
                filtrez par matricule) : la fiche de paie de {moisSel !== null ? `${MOIS_FR[moisSel]} ${annee}` : annee}
                se génère automatiquement avec les paramètres de calcul actuels.
              </p>
              <div className="mt-4 flex justify-center">
                <IconCalendarDays className="h-5 w-5 text-slate-300" />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}