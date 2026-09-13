import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { fmtDate } from '../utils';
import { IconCalendarDays, IconSave, IconRefresh } from '../components/icons';

const MOIS_NOM = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const ANNEES = [2026, 2027, 2028, 2029, 2030];

function isoYMD(y, m0, d) {
  return `${y}-${String(m0 + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function parseIso(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim());
  return m ? { y: Number(m[1]), m0: Number(m[2]) - 1, d: Number(m[3]) } : null;
}

// Règle du cycle de 30 jours : du 21 (ou 22) du mois précédent → le 20 du mois courant.
function cycleDefaut(annee, mois, jourDebut) {
  const prevY0 = mois === 1 ? annee - 1 : annee;
  const prevM0 = mois === 1 ? 11 : mois - 2;
  const curM0 = mois - 1;
  return { debut: isoYMD(prevY0, prevM0, jourDebut), fin: isoYMD(annee, curM0, 20) };
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
  const [jourDebut, setJourDebut] = useState(21);
  const [rows, setRows] = useState({});
  const [jourData, setJourData] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
        for (let m = 1; m <= 12; m++) if (!map[m]) map[m] = cycleDefaut(annee, m, jourDebut);
        setRows(map);
      })
      .catch((e) => { if (!mort) setError(e.message); })
      .finally(() => { if (!mort) setLoading(false); });
    return () => { mort = true; };
  }, [annee, jourDebut]);

  const setRow = (mois, key, val) => setRows((prev) => ({ ...prev, [mois]: { ...(prev[mois] || {}), [key]: val } }));

  const reinitialiser = () => {
    const map = {};
    for (let m = 1; m <= 12; m++) map[m] = cycleDefaut(annee, m, jourDebut);
    setRows(map);
    setError('');
    setSuccess(`Dates réinitialisées à la règle du cycle (${jourDebut} → 20 du mois courant) — enregistrez pour conserver.`);
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

  const moisListe = useMemo(() => (moisFiltre === 0 ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] : [moisFiltre]), [moisFiltre]);

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

  return (
    <div className="space-y-5">
      <div className="card flex flex-wrap items-center justify-between gap-3 p-3 text-xs text-slate-600 ring-1 ring-slate-200">
        <p className="flex items-center gap-2">
          <IconCalendarDays className="h-4 w-4 text-slate-400" />
          <span>
            Le calcul de la paie mensuelle se fait <b>par cycle de 30 jours</b> : du
            <b className="text-slate-800"> {jourDebut} du mois précédent</b> → <b className="text-slate-800">20 du mois courant</b>.
            Les <b>dates de début et de fin</b> sont saisies <b>manuellement</b> chaque mois ; les jours de repos
            hebdomadaires et les jours fériés sont extraits du <b>Calendrier de l'année</b>.
          </span>
        </p>
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
          <label className="flex items-center gap-1.5 text-slate-600">
            Début de cycle :
            <select className="input py-1 text-xs" value={jourDebut} onChange={(e) => setJourDebut(Number(e.target.value))}>
              <option value={21}>21</option>
              <option value={22}>22</option>
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
                  const r = rows[m] || cycleDefaut(annee, m, jourDebut);
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
            et les jours fériés issus du Calendrier de l'année. Cliquez sur « Enregistrer les cycles » après toute
            modification des dates ({jourDebut} → 20).
          </p>
        </div>
      )}
    </div>
  );
}