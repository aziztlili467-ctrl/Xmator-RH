import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { fmtDate } from '../utils';
import { IconCalendarDays, IconSave, IconRefresh } from '../components/icons';

const MOIS_NOM = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const ANNEES = [2026, 2027, 2028, 2029, 2030];

const MODES = [
  {
    id: 'forfaitaire',
    titre: 'Mode 1 — Forfaitaire',
    sous: 'Base fixe comptable sur 30 jours',
    unites: 'jours',
    formule: 'Nbr_Jours = MAX(0, Base forfaitaire − Jours déduits)',
  },
  {
    id: 'prorata',
    titre: 'Mode 2 — Prorata réel',
    sous: 'Jours réels du cycle (ouvrés ou calendaires)',
    unites: 'jours',
    formule: 'Nbr_Jours = MAX(0, Base réelle du cycle − Jours d’absence)',
  },
  {
    id: 'horaire',
    titre: 'Mode 3 — Régime horaire',
    sous: 'Prix de l’heure × volume horaire selon la catégorie / l’échelon',
    unites: 'heures',
    formule: 'Nbr_Heures = MAX(0, Régime mensuel − Heures d’absence)',
  },
];

const MODE_LABEL = Object.fromEntries(MODES.map((m) => [m.id, m.titre]));

function isoYMD(y, m0, d) {
  return `${y}-${String(m0 + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function parseIso(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim());
  return m ? { y: Number(m[1]), m0: Number(m[2]) - 1, d: Number(m[3]) } : null;
}

// Règle du cycle : du jour_debut du mois précédent → le jour_fin du mois courant.
function cycleDefaut(annee, mois, jourDebut, jourFin) {
  const prevY0 = mois === 1 ? annee - 1 : annee;
  const prevM0 = mois === 1 ? 11 : mois - 2;
  const curM0 = mois - 1;
  return { debut: isoYMD(prevY0, prevM0, jourDebut), fin: isoYMD(annee, curM0, jourFin) };
}

// Ajoute n jours civils à une date ISO (aaaa-mm-jj).
function addJours(iso, n) {
  const d = parseIso(iso);
  if (!d) return iso;
  const dt = new Date(d.y, d.m0, d.d);
  dt.setDate(dt.getDate() + n);
  return isoYMD(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

// Fin de cycle automatique : la fin est calculée mois par mois = date de début + 30 jours civils
// (ex. : cycle 21/08 → 20/09 puisque août compte 31 jours).
function cycleAutoMois(annee, mois, jourDebut) {
  const debut = cycleDefaut(annee, mois, jourDebut, jourDebut).debut;
  return { debut, fin: addJours(debut, 30) };
}

// Date par défaut d'un mois selon le mode : automatique (début + 30 j) ou manuel (jour_fin).
function defaultFor(mois, annee, jourDebut, jourFin, finAuto) {
  return finAuto ? cycleAutoMois(annee, mois, jourDebut) : cycleDefaut(annee, mois, jourDebut, jourFin);
}

// Compte les jours de la période [debut, fin] (tous les jours du calendrier) ainsi que les
// repos hebdomadaires (samedi/dimanche) et les jours fériés, synchronisés avec le Calendrier
// de l'année (source 'weekend' / 'ferie' de jours_travail).
function compterJours(debut, fin, jourData) {
  const s = parseIso(debut);
  const e = parseIso(fin);
  if (!s || !e) return null;
  const a = new Date(s.y, s.m0, s.d);
  const b = new Date(e.y, e.m0, e.d);
  if (a > b) return null;
  let total = 0;
  let repos = 0;
  let feries = 0;
  for (let d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) {
    const iso = isoYMD(d.getFullYear(), d.getMonth(), d.getDate());
    total++;
    const src = jourData[iso];
    if (src) {
      if (src === 'weekend') repos++;
      else if (src === 'ferie') feries++;
    } else {
      const dow = d.getDay();
      if (dow === 0 || dow === 6) repos++;
    }
  }
  return { total, repos, feries, ouvres: total - repos - feries };
}

export default function CycleCalcul() {
  const [annee, setAnnee] = useState(ANNEES[0]);
  const [moisFiltre, setMoisFiltre] = useState(0);
  const [jourDebut, setJourDebut] = useState(15);
  const [jourFin, setJourFin] = useState(15);
  const [finAuto, setFinAuto] = useState(true);
  const [mode, setMode] = useState('forfaitaire');
  const [baseJours, setBaseJours] = useState(30);
  const [carenceMa, setCarenceMa] = useState(2);
  const [baseReference, setBaseReference] = useState('ouvres');
  const [regimeHoraire, setRegimeHoraire] = useState(173.33);
  const [tauxHoraire, setTauxHoraire] = useState('auto');
  const [decompteHoraire, setDecompteHoraire] = useState('deduction');
  const [prixCat, setPrixCat] = useState([]);
  const [prixCatLoading, setPrixCatLoading] = useState(false);
  const [prixCatSaving, setPrixCatSaving] = useState(false);
  const [prixCatMsg, setPrixCatMsg] = useState(null);
  const [rows, setRows] = useState({});
  const [jourData, setJourData] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingRules, setSavingRules] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Charge les calendriers (jours travaillés + fériés) de toutes les années du référentiel
  // afin de comptabiliser correctement les périodes qui chevauchent l'année (ex. janvier
  // = 21 décembre N-1 → 20 janvier N).
  const loadCalendrier = async () => {
    const results = await Promise.all(
      ANNEES.map((a) => api.calendrierAnnee(a).catch(() => ({ jours_travail: [] })))
    );
    const data = {};
    results.forEach((r) => (r.jours_travail || []).forEach((j) => { data[j.date] = j.source; }));
    setJourData(data);
  };
  useEffect(() => { loadCalendrier(); }, []);

  // Règles générales du cycle : mode, début/fin, base, carence, options horaires
  useEffect(() => {
    let mort = false;
    api.reglesCycleCalcul()
      .then((d) => {
        if (mort || !d?.regles) return;
        const r = d.regles;
        setJourDebut(r.jour_debut ?? 21);
        setJourFin(r.jour_fin ?? 20);
        setMode(r.mode || 'forfaitaire');
        setBaseJours(r.base_jours ?? 30);
        setCarenceMa(r.ma_jours_payes ?? r.carence_ma ?? 5);
        setBaseReference(r.base_reference || 'ouvres');
        setRegimeHoraire(Number(r.regime_horaire) || 173.33);
        setTauxHoraire(r.taux_horaire || 'auto');
        setDecompteHoraire(r.decompte_horaire || 'deduction');
        // Si la fin enregistrée diffère du début, l'utilisateur l'avait personnalisée → mode manuel.
        setFinAuto(r.jour_debut != null && r.jour_fin != null && r.jour_fin === r.jour_debut);
      })
      .catch(() => { /* valeurs par défaut */ });
    return () => { mort = true; };
  }, []);

  // Prix de l'heure par catégorie (régime horaire — taux par la grille) : chargés dès que le
  // mode horaire est actif avec « taux grille ».
  useEffect(() => {
    if (mode !== 'horaire' || tauxHoraire !== 'grille') return undefined;
    let mort = false;
    setPrixCatLoading(true);
    setPrixCatMsg(null);
    api.prixHeuresCategorie()
      .then((d) => { if (!mort) setPrixCat(Array.isArray(d?.prix) ? d.prix : []); })
      .catch((e) => { if (!mort) setPrixCatMsg({ type: 'err', texte: e.message }); })
      .finally(() => { if (!mort) setPrixCatLoading(false); });
    return () => { mort = true; };
  }, [mode, tauxHoraire]);

  const setPrixCategorie = (id, valeur) => setPrixCat((xs) => xs.map((x) =>
    x.categorie_id === id ? { ...x, prix_heure: valeur === '' ? '' : Number(valeur) } : x));

  const enregistrerPrixCat = async () => {
    const liste = prixCat.map((x) => ({ categorie_id: x.categorie_id, prix_heure: Number(x.prix_heure) || 0 }));
    if (liste.some((x) => x.prix_heure < 0)) {
      setPrixCatMsg({ type: 'err', texte: 'Le prix de l\'heure doit être positif (DT/heure).' });
      return;
    }
    setPrixCatSaving(true);
    setPrixCatMsg(null);
    try {
      await api.sauverPrixHeuresCategorie(liste);
      setPrixCatMsg({ type: 'ok', texte: `Prix de l'heure enregistrés pour ${liste.length} catégorie(s).` });
    } catch (e) {
      setPrixCatMsg({ type: 'err', texte: e.message || 'Échec de l\'enregistrement des prix.' });
    } finally {
      setPrixCatSaving(false);
    }
  };

  useEffect(() => {
    let mort = false;
    setLoading(true);
    setError('');
    setSuccess('');
    api.cyclesCalcul(annee)
      .then((dbRows) => {
        if (mort) return;
        const map = {};
        (dbRows || []).forEach((r) => { map[r.mois] = { debut: r.debut, fin: r.fin }; });
        for (let m = 1; m <= 12; m++) if (!map[m]) map[m] = defaultFor(m, annee, jourDebut, jourFin, finAuto);
        setRows(map);
      })
      .catch((e) => { if (!mort) setError(e.message); })
      .finally(() => { if (!mort) setLoading(false); });
    return () => { mort = true; };
  }, [annee, jourDebut, jourFin, finAuto]);

  const setRow = (mois, key, val) => setRows((prev) => ({ ...prev, [mois]: { ...(prev[mois] || {}), [key]: val } }));

  const reinitialiser = () => {
    const map = {};
    for (let m = 1; m <= 12; m++) map[m] = defaultFor(m, annee, jourDebut, jourFin, finAuto);
    setRows(map);
    setError('');
    setSuccess(`Dates réinitialisées à la règle du cycle (${jourDebut} du mois précédent → ${
      finAuto ? 'début + 30 jours (auto)' : `${jourFin} du mois courant`
    }) — enregistrez pour conserver.`);
  };

  const enregistrer = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const cycles = Object.entries(rows).map(([mois, r]) => ({ mois: Number(mois), debut: r.debut, fin: r.fin }));
      await api.sauverCyclesCalcul(annee, cycles);
      setSuccess(`Cycles de calcul ${annee} enregistrés.`);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const enregistrerRegles = async () => {
    const carence = Number(carenceMa);
    const fin = finAuto ? Number(jourDebut) : Number(jourFin);
    if (mode === 'horaire') {
      const v = Number(regimeHoraire);
      if (!Number.isFinite(v) || v <= 0 || v > 500) {
        setError('Le régime horaire mensuel doit être un nombre entre 0 et 500 heures (ex. 173,33).');
        return;
      }
      } else {
      const base = Number(baseJours);
      if (!Number.isInteger(base) || base < 1 || base > 60) {
        setError('La base de référence doit être un entier entre 1 et 60 jours.');
        return;
      }
    }
    if (!Number.isInteger(carence) || carence < 0 || carence > 30) {
      setError('Le nombre de jours payés du 1er épisode maladie doit être un entier entre 0 et 30.');
      return;
    }
    if (!Number.isInteger(fin) || fin < 1 || fin > 31) {
      setError('La fin de cycle doit être un entier entre 1 et 31 jours.');
      return;
    }
    setSavingRules(true);
    setError('');
    setSuccess('');
    try {
      await api.sauverReglesCycleCalcul({
        jour_debut: Number(jourDebut),
        jour_fin: fin,
        mode,
        base_jours: Number(baseJours),
        ma_jours_payes: carence,
        base_reference: baseReference,
        regime_horaire: Number(regimeHoraire),
        taux_horaire: tauxHoraire,
        decompte_horaire: decompteHoraire,
      });
      setSuccess(`${MODE_LABEL[mode] || mode} — règles du cycle enregistrées (cycle ${jourDebut} du mois précédent → ${
        finAuto ? 'début + 30 jours (auto)' : `${fin} du mois courant`
      }).`);
    } catch (e) {
      setError(e.message);
    } finally {
      setSavingRules(false);
    }
  };

  const moisListe = useMemo(() => (moisFiltre === 0 ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] : [moisFiltre]), [moisFiltre]);

  // Jour de fin affiché quand la fin est automatique : valeur calculée pour le mois visible
  // dans le filtre (« Tous les mois » → mois courant de l'année consultée).
  const finAutoJour = useMemo(() => {
    if (!finAuto) return jourFin;
    const cible = moisFiltre !== 0 ? moisFiltre : new Date().getMonth() + 1;
    const fin = cycleAutoMois(annee, cible, jourDebut).fin;
    const p = parseIso(fin);
    return p ? p.d : jourDebut;
  }, [annee, moisFiltre, jourDebut, finAuto, jourFin]);

  const totaux = useMemo(() => {
    const t = { total: 0, repos: 0, feries: 0, ouvres: 0 };
    moisListe.forEach((m) => {
      const r = rows[m];
      if (!r) return;
      const c = compterJours(r.debut, r.fin, jourData);
      if (c) { t.total += c.total; t.repos += c.repos; t.feries += c.feries; t.ouvres += c.ouvres; }
    });
    return t;
  }, [moisListe, rows, jourData]);

  const modeActif = MODES.find((m) => m.id === mode) || MODES[0];

  return (
    <div className="space-y-5">
      <div className="card flex flex-wrap items-center justify-between gap-3 p-3 text-xs text-slate-600 ring-1 ring-slate-200">
        <p className="flex items-center gap-2">
          <IconCalendarDays className="h-4 w-4 text-slate-400" />
          <span>
            Le calcul de la paie mensuelle se fait <b>par cycle</b> : du
            <b className="text-slate-800"> {jourDebut} du mois précédent</b> → <b className="text-slate-800">{
              finAuto ? 'début + 30 jours (automatique)' : `${jourFin} du mois courant`
            }</b>, en mode <b className="text-slate-800">{modeActif.titre}</b>.
            Le bulletin reprend les <b>unités de paie</b> calculées sur le cycle ({modeActif.unites}, déductions
            A1 / maladie) dans la colonne <b>« Nbr / Taux »</b> de la ligne <b>Salaire de base</b>.
          </span>
        </p>
      </div>

      {/* Règles générales du cycle */}
      <div className="card p-4">
        <p className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
          <IconCalendarDays /> Règles générales du cycle de calcul
        </p>

        {/* Sélecteur du mode de calcul */}
        <div className="mb-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Mode de calcul de la paie</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {MODES.map((m) => {
              const actif = mode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id)}
                  className={`rounded-xl border p-3 text-left transition-colors ${
                    actif
                      ? 'border-brand-500 bg-brand-50/80 ring-2 ring-brand-500'
                      : 'border-slate-200 bg-white hover:border-brand-300 hover:bg-brand-50/40'
                  }`}
                >
                  <p className={`text-xs font-bold ${actif ? 'text-brand-700' : 'text-slate-700'}`}>{m.titre}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">{m.sous}</p>
                  <p className="mt-1 font-mono text-[10px] text-slate-400">{m.formule}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Paramètres communs */}
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Paramètres communs du cycle</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className="block text-xs text-slate-600">
            Début de cycle
            <select className="input mt-1 w-full py-1 text-xs" value={jourDebut}
              onChange={(e) => setJourDebut(Number(e.target.value))}>
              {Array.from({ length: 16 }, (_, i) => 15 + i).map((j) => (
                <option key={j} value={j}>{j} du mois précédent</option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-slate-600">
            Fin de cycle
            <select className="input mt-1 w-full py-1 text-xs" value={finAuto ? finAutoJour : jourFin}
              disabled={finAuto} onChange={(e) => setJourFin(Number(e.target.value))}>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((j) => (
                <option key={j} value={j}>{finAuto ? j : `${j} du mois courant`}</option>
              ))}
            </select>
            {finAuto && (
              <span className="mt-1 block text-[10px] text-emerald-600">
                Auto — calculée pour {moisFiltre !== 0 ? MOIS_NOM[moisFiltre - 1] : MOIS_NOM[new Date().getMonth()]} {annee} (début + 30 jours)
              </span>
            )}
          </label>
          <label className="block text-xs text-slate-600">
            Jours payés 1er épisode maladie (MA, seuil)
            <input className="input mt-1 w-full py-1 text-xs" type="number" min="0" max="30" value={carenceMa}
              onChange={(e) => setCarenceMa(Number(e.target.value))} />
            <span className="mt-1 block text-[10px] text-slate-400">
              Seuil compact — la règle complète (excédent, 2e maladie) se paramètre dans
              Référentiel → Congé & Maladie → Règles de prélèvement.
            </span>
          </label>
        </div>
        <label className="mt-2 flex w-fit cursor-pointer items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={finAuto} onChange={(e) => setFinAuto(e.target.checked)} />
          Fin de cycle automatique — calculée mois par mois à partir du début du cycle (+ 30 jours).
          <span className="text-slate-400">Décochez pour saisir une fin manuelle (personnalisée).</span>
        </label>

        {/* Options du mode actif */}
        <div className="mt-4 rounded-xl bg-slate-50/70 p-3 ring-1 ring-slate-200">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
            Options du {modeActif.titre} ({modeActif.formule})
          </p>

          {mode === 'forfaitaire' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs text-slate-600">
                Base forfaitaire de paie (jours)
                <input className="input mt-1 w-full py-1 text-xs" type="number" min="1" max="60" value={baseJours}
                  onChange={(e) => setBaseJours(Number(e.target.value))} />
              </label>
              <p className="text-[11px] leading-snug text-slate-400">
                <b>Forfaitaire</b> : base comptable fixe (30 jours par défaut). Les absences déductibles
                (A1, MALD, MA selon Règles de prélèvement) sont soustraites directement de la base.
              </p>
            </div>
          )}

          {mode === 'prorata' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="text-xs text-slate-600">
                <p className="mb-1 font-semibold text-slate-600">Base de référence du cycle</p>
                <label className="flex items-center gap-2">
                  <input type="radio" name="base_ref" checked={baseReference === 'ouvres'}
                    onChange={() => setBaseReference('ouvres')} />
                  Jours ouvrés réels du cycle (hors weekend &amp; fériés)
                </label>
                <label className="mt-1 flex items-center gap-2">
                  <input type="radio" name="base_ref" checked={baseReference === 'calendaires'}
                    onChange={() => setBaseReference('calendaires')} />
                  Jours calendaires réels du cycle
                </label>
              </div>
              <p className="text-[11px] leading-snug text-slate-400">
                <b>Prorata réel</b> : la base est recalculée chaque mois sur le calendrier réel du cycle
                (10 mois sur 12 — 21 ouvrés), puis réduite des absences déductibles (A1, MALD, MA selon Règles de prélèvement).
              </p>
            </div>
          )}

          {mode === 'horaire' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-3">
                <label className="block text-xs text-slate-600">
                  Régime horaire mensuel de référence (heures)
                  <input className="input mt-1 w-full py-1 text-xs" type="number" min="0.01" max="500" step="0.01"
                    value={regimeHoraire} onChange={(e) => setRegimeHoraire(Number(e.target.value))} />
                  <span className="mt-1 block text-[10px] text-slate-400">
                    Ex. : 173,33 h (40 h/sem), 195 h, 208 h.
                  </span>
                </label>
                <label className="block text-xs text-slate-600">
                  Mode de détermination du taux horaire (prix heure)
                  <select className="input mt-1 w-full py-1 text-xs" value={tauxHoraire}
                    onChange={(e) => setTauxHoraire(e.target.value)}>
                    <option value="auto">Automatique — Salaire de base ÷ régime mensuel</option>
                    <option value="grille">Grille — prix de l'heure par catégorie (référentiel)</option>
                  </select>
                  <span className="mt-1 block text-[10px] text-slate-400">
                    L'unité affichée sur le bulletin devient <b>« Heures »</b> et le montant vaut
                    heures × prix de l'heure.
                  </span>
                </label>
              </div>
              <div className="space-y-3">
                <div className="text-xs text-slate-600">
                  <p className="mb-1 font-semibold text-slate-600">Mode de décompte horaire</p>
                  <label className="flex items-center gap-2">
                    <input type="radio" name="decompte" checked={decompteHoraire === 'deduction'}
                      onChange={() => setDecompteHoraire('deduction')} />
                    Déduction des heures d'absences — Régime − heures d'absence pointées
                  </label>
                  <label className="mt-1 flex items-center gap-2">
                    <input type="radio" name="decompte" checked={decompteHoraire === 'cumul'}
                      onChange={() => setDecompteHoraire('cumul')} />
                    Cumul des heures de présence réelle + heures assimilées (congés / fériés)
                  </label>
                </div>
                <p className="text-[11px] leading-snug text-slate-400">
                  <b>Régime horaire</b> : 1 jour d'absence = {(() => {
                    const h = Number(regimeHoraire) > 0 ? (Number(regimeHoraire) / 21.67) : 8;
                    return `${h.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} h`;
                  })()} (demi-journée = moitié). Les retards / demi-journées du journal de présence sont
                  convertis exactement en heures.
                </p>
              </div>
            </div>
          )}

          {mode === 'horaire' && tauxHoraire === 'grille' && (
            <div className="mt-3 rounded-xl bg-white p-3 ring-1 ring-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                    Prix de l'heure par catégorie (DT / heure)
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Le prix saisi (salaire de base brut en dinars pour une heure) est appliqué aux
                    employés de la catégorie correspondante ; à défaut, le calcul revient au prix
                    automatique (salaire de base ÷ régime).
                  </p>
                </div>
                <button type="button" onClick={enregistrerPrixCat} disabled={prixCatSaving || prixCatLoading}
                  className="btn-secondary h-8 px-3 text-xs">
                  <IconSave className="mr-1 inline h-3 w-3" />{prixCatSaving ? '…' : 'Enregistrer les prix'}
                </button>
              </div>
              {prixCatMsg && (
                <p className={`mt-2 rounded-lg px-3 py-2 text-xs font-semibold ring-1 ${
                  prixCatMsg.type === 'ok' ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : 'bg-red-50 text-red-700 ring-red-200'
                }`}>
                  {prixCatMsg.texte}
                </p>
              )}
              {prixCatLoading ? (
                <p className="py-4 text-center text-xs text-slate-400">Chargement des catégories…</p>
              ) : prixCat.length === 0 ? (
                <p className="py-4 text-center text-xs text-slate-400">Aucune catégorie à paramétrer.</p>
              ) : (
                <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {prixCat.map((c) => (
                    <label key={c.categorie_id} className="block text-xs text-slate-600">
                      <span className="text-slate-500">{c.libelle}</span>
                      <span className="mt-0.5 flex items-center gap-1">
                        <input className="input w-full py-1 text-xs" type="number" min="0" max="10000" step="0.001"
                          placeholder="— non paramétré —"
                          value={c.prix_heure ?? ''}
                          onChange={(e) => setPrixCategorie(c.categorie_id, e.target.value)} />
                        <span className="text-[10px] text-slate-400">DT/h</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-3 flex items-start justify-between gap-3">
          <p className="max-w-2xl text-[11px] text-slate-400">
            <b>Jours / heures déduits</b> : <b>A1</b> (1 jour par jour d'absence) + <b>MALD</b> (1 jour par
            jour de maladie longue durée) + <b>MA</b> (1er épisode : les 1er jours payés jusqu'au seuil,
            excédent déduit ; 2e maladie non successive et suivantes : déduites en entier — Règles de
            prélèvement dans Congé & Maladie). CA, CE, DJ, FT, P1, R, R1, R3, RP et MAT n'impactent pas la base.
          </p>
          <button type="button" onClick={enregistrerRegles} disabled={savingRules} className="btn-primary h-8 shrink-0 px-3 text-xs">
            <IconSave className="mr-1 inline h-3 w-3" />{savingRules ? '…' : 'Enregistrer les règles'}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="flex items-center gap-1.5 text-slate-600">
            <IconCalendarDays className="h-4 w-4" />
            Année :
            <select className="input py-1 text-xs" value={annee} onChange={(e) => setAnnee(Number(e.target.value))}>
              {ANNEES.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-slate-600">
            Mois :
            <select className="input py-1 text-xs" value={moisFiltre} onChange={(e) => setMoisFiltre(Number(e.target.value))}>
              <option value={0}>Tous les mois</option>
              {MOIS_NOM.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
          </label>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={reinitialiser} disabled={loading} className="btn-secondary h-8 px-3 text-xs">
            <IconRefresh className="mr-1 inline h-3 w-3" />Réinitialiser aux règles
          </button>
          <button type="button" onClick={enregistrer} disabled={saving || loading} className="btn-primary h-8 px-3 text-xs">
            <IconSave className="mr-1 inline h-3 w-3" />{saving ? '…' : `Enregistrer les cycles ${annee}`}
          </button>
        </div>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}
      {success && <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700 ring-1 ring-emerald-200">{success}</p>}

      {loading ? (
        <p className="py-8 text-center text-sm text-slate-400">Chargement des cycles de calcul…</p>
      ) : (
        <div className="card p-4">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Calendrier des cycles — {moisFiltre === 0 ? `année ${annee}` : `${MOIS_NOM[moisFiltre - 1]} ${annee}`}
          </p>
          <div className="table-wrap">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  <th className="py-2 pr-2 text-left">Mois</th>
                  <th className="py-2 pr-2">Début (jj/mm/aaaa)</th>
                  <th className="py-2 pr-2">Fin (jj/mm/aaaa)</th>
                  <th className="py-2 pr-2 text-right">Total jours</th>
                  <th className="py-2 pr-2 text-right">Repos hebdo</th>
                  <th className="py-2 pr-2 text-right">Fériés</th>
                  <th className="py-2 text-right">Jours ouvrés</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {moisListe.map((m) => {
                  const r = rows[m] || defaultFor(m, annee, jourDebut, jourFin, finAuto);
                  const c = compterJours(r.debut, r.fin, jourData);
                  return (
                    <tr key={m} className="hover:bg-slate-50/60">
                      <td className="py-2 pr-2 font-semibold text-slate-700">
                        {MOIS_NOM[m - 1]}
                        <span className="ml-2 block text-[10px] font-normal text-slate-400">
                          {fmtDate(r.debut)} → {fmtDate(r.fin)}
                        </span>
                      </td>
                      <td className="py-2 pr-2 text-center">
                        <input type="date" className="input w-36 py-1 text-center text-xs" value={r.debut}
                          onChange={(e) => setRow(m, 'debut', e.target.value)} />
                      </td>
                      <td className="py-2 pr-2 text-center">
                        <input type="date" className="input w-36 py-1 text-center text-xs" value={r.fin}
                          onChange={(e) => setRow(m, 'fin', e.target.value)} />
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums font-semibold text-slate-700">{c ? c.total : '-'}</td>
                      <td className="py-2 pr-2 text-right tabular-nums text-slate-500">{c ? c.repos : '-'}</td>
                      <td className="py-2 pr-2 text-right tabular-nums text-amber-600">{c ? c.feries : '-'}</td>
                      <td className="py-2 text-right tabular-nums font-bold text-slate-800">{c ? c.ouvres : '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 font-bold text-slate-700">
                  <td className="py-2 pr-2">Total {moisFiltre === 0 ? annee : MOIS_NOM[moisFiltre - 1]}</td>
                  <td colSpan={2} className="py-2 pr-2" />
                  <td className="py-2 pr-2 text-right tabular-nums">{totaux.total}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">{totaux.repos}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">{totaux.feries}</td>
                  <td className="py-2 text-right tabular-nums">{totaux.ouvres}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="mt-3 text-[11px] text-slate-400">
            Tous les jours du calendrier sont comptabilisés, plus les repos hebdomadaires (samedi &amp; dimanche)
            et les jours fériés issus du Calendrier de l'année (utiles au mode <b>Prorata réel</b>). Cliquez sur
            « Enregistrer les cycles » après toute modification des dates ({jourDebut} du mois précédent → {finAuto ? 'début + 30 jours (auto)' : `${jourFin} du mois courant`}).
          </p>
        </div>
      )}
    </div>
  );
}