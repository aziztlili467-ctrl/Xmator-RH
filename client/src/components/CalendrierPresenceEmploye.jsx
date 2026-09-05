import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import { api } from '../api';
import { fmtDate } from '../utils';
import CalendarJour, { statutJour } from './CalendarJour';

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MOIS_COURT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

// Mois de travail (règle 21 → 20) — cohérent avec le tableau de bord et le module heures
function moisTravail(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  let py = y, pm = m - 1;
  if (d > 20) { pm += 1; if (pm === 12) { pm = 0; py += 1; } }
  return { annee: py, mois: pm };
}
function rangeMoisTravail(py, pm) {
  const sY = pm === 0 ? py - 1 : py;
  const sM = pm === 0 ? 11 : pm - 1;
  return {
    debut: `${sY}-${String(sM + 1).padStart(2, '0')}-21`,
    fin: `${py}-${String(pm + 1).padStart(2, '0')}-20`,
  };
}

function periodePreset(preset) {
  const now = new Date();
  const y = now.getFullYear();
  const iso = (d) => d.toISOString().split('T')[0];
  const tIso = iso(now);
  const mt = moisTravail(tIso);
  if (preset === 'mois') {
    const r = rangeMoisTravail(mt.annee, mt.mois);
    return { debut: r.debut, fin: tIso < r.fin ? tIso : r.fin };
  }
  if (preset === 'mois_dernier') {
    let pm = mt.mois - 1, py = mt.annee;
    if (pm < 0) { pm = 11; py -= 1; }
    return rangeMoisTravail(py, pm);
  }
  if (preset === 'annee') return { debut: `${y}-01-01`, fin: `${y}-12-31` };
  if (preset === 'annee_prec') return { debut: `${y - 1}-01-01`, fin: `${y - 1}-12-31` };
  return null;
}

// Catégories de la courbe et couleur associée : on réutilise les codes de « Paramètres & Codification »
// (Présence = P1, Congé = CA, Maladie = MA, Absence = A1, Repos = RP) pour rester 100 % cohérent avec le calendrier.
const CATS = ['Présence', 'Congé', 'Maladie', 'Absence', 'Repos'];
const CODE_CAT = { Présence: 'P1', Congé: 'CA', Maladie: 'MA', Absence: 'A1', Repos: 'RP' };
const COULEURS_DEFAUT = {
  Présence: '#10b981', Congé: '#3860ea', Maladie: '#f43f5e', Absence: '#f59e0b', Repos: '#64748b',
};

// Même logique que l'affichage du calendrier : chaque jour tombe dans exactement une catégorie.
function categorieJour(j) {
  const st = statutJour(j).st;
  if (st === 'present') return 'Présence';
  if (st === 'conge' || st === 'conge_demi') return 'Congé';
  if (st === 'maladie') return 'Maladie';
  if (st === 'absence') return 'Absence';
  if (st === 'rma') {
    const code = (j.rma_code || '').split('/')[0];
    if (code === 'A1') return 'Absence';
    if (code === 'CA' || code === 'CE') return 'Congé';
    if (code === 'MA' || code === 'MAT') return 'Maladie';
    if (code === 'P1' || code === 'FT') return 'Présence';
    return 'Repos';
  }
  return 'Repos';
}

const fmtJ = (v) => `${Math.round(v)} j`;

export default function CalendrierPresenceEmploye({ employeId, matricule, nom, prenom }) {
  const [preset, setPreset] = useState('annee');
  const [persoDebut, setPersoDebut] = useState('');
  const [persoFin, setPersoFin] = useState('');
  const [mode, setMode] = useState('mois'); // 'mois' | 'jour'
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const periode = useMemo(() => {
    if (preset === 'perso') return { debut: persoDebut, fin: persoFin };
    return periodePreset(preset);
  }, [preset, persoDebut, persoFin]);

  useEffect(() => {
    if (!employeId || !periode || !periode.debut) return;
    setLoading(true);
    setError('');
    api.dashboardAudit({ granularite: mode, debut: periode.debut, fin: periode.fin, employe_id: employeId })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [employeId, periode, mode]);

  // Couleurs des catégories depuis codes_paie (rendu live) avec repli
  const coul = useMemo(() => {
    const c = { ...COULEURS_DEFAUT };
    const lib = {};
    for (const k of (data?.codes || [])) {
      const cat = Object.keys(CODE_CAT).find((x) => CODE_CAT[x] === k.code);
      if (cat && k.couleur) c[cat] = k.couleur;
      lib[k.code] = k.libelle;
    }
    return { coul: c, lib };
  }, [data]);

  // Données de la courbe : agrégation du calendrier par jour ou par mois (même source que les cases)
  const chartData = useMemo(() => {
    const jours = data?.calendrier || [];
    if (!jours.length) return [];
    const map = new Map();
    for (const j of jours) {
      const cle = mode === 'mois' ? j.date.slice(0, 7) : j.date;
      if (!map.has(cle)) {
        map.set(cle, { cle, label: '', Présence: 0, Congé: 0, Maladie: 0, Absence: 0, Repos: 0 });
      }
      map.get(cle)[categorieJour(j)] += 1;
    }
    return [...map.values()].map((r) => ({
      ...r,
      label: mode === 'mois' ? `${MOIS_COURT[Number(r.cle.slice(5, 7)) - 1]} ${r.cle.slice(0, 4)}`
        : fmtDate(r.cle).slice(0, 5),
      total: r.Présence + r.Congé + r.Maladie + r.Absence + r.Repos,
    }));
  }, [data, mode]);

  const totaux = useMemo(() => {
    const t = { Présence: 0, Congé: 0, Maladie: 0, Absence: 0, Repos: 0 };
    for (const r of chartData) for (const k of CATS) t[k] += r[k];
    return t;
  }, [chartData]);

  if (error) return <div className="card p-5"><p className="text-sm text-red-600">{error}</p></div>;

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/60 px-5 py-4">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">Calendrier &amp; répartition de présence</h3>
          <p className="text-xs text-slate-400">
            Calendrier identique au tableau de bord, couleurs issues des codes de « Paramètres &amp; Codification » (live).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-lg ring-1 ring-slate-200">
            {['mois', 'jour'].map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 text-xs font-semibold ${mode === m ? 'bg-brand-700 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
              >
                {m === 'mois' ? 'Par mois' : 'Par jour'}
              </button>
            ))}
          </div>
          <select className="input w-auto" value={preset} onChange={(e) => setPreset(e.target.value)}>
            <option value="mois">Mois en cours</option>
            <option value="mois_dernier">Mois dernier</option>
            <option value="annee">Année en cours</option>
            <option value="annee_prec">Année précédente</option>
            <option value="perso">Personnalisée</option>
          </select>
          {preset === 'perso' && (
            <div className="flex items-center gap-2">
              <input type="date" className="input w-auto" value={persoDebut} onChange={(e) => setPersoDebut(e.target.value)} />
              <span className="text-slate-400">→</span>
              <input type="date" className="input w-auto" value={persoFin} onChange={(e) => setPersoFin(e.target.value)} />
            </div>
          )}
        </div>
      </div>

      {loading && !data && <p className="py-10 text-center text-sm text-slate-400">Chargement de la présence…</p>}

      {data && (
        <div className="space-y-6 p-5">
          {/* Synthèse : totaux de la période */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {CATS.map((cat) => (
              <div key={cat} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
                <span className="h-8 w-8 shrink-0 rounded-lg" style={{ background: coul.coul[cat] }} />
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-400">{cat}</p>
                  <p className="text-lg font-bold leading-none text-slate-800">{fmtJ(totaux[cat])}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Courbe de répartition */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Répartition {mode === 'mois' ? 'mensuelle' : 'journalière'}
              </h4>
              <span className="text-[11px] text-slate-400">sur {chartData.length} {mode === 'mois' ? 'période(s)' : 'jour(s)'}</span>
            </div>
            {chartData.length === 0 ? (
              <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-slate-300 text-sm text-slate-400">
                Aucune donnée sur cette période.
              </div>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      {CATS.map((cat) => (
                        <linearGradient key={cat} id={`grad-${cat}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={coul.coul[cat]} stopOpacity={0.85} />
                          <stop offset="100%" stopColor={coul.coul[cat]} stopOpacity={0.35} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={mode === 'jour' ? 'preserveStartEnd' : 0} />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <Tooltip
                      formatter={(v, name) => [fmtJ(v), name]}
                      labelFormatter={(label, payload) => {
                        const p = payload?.[0]?.payload;
                        if (!p) return label;
                        return mode === 'mois'
                          ? `${moisLabel(p.cle)} · ${p.total} j au total`
                          : `${fmtDate(p.cle)} · ${p.total} j au total`;
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {CATS.map((cat) => (
                      <Area key={cat} type="monotone" dataKey={cat}
                        stackId="1" stroke={coul.coul[cat]} strokeWidth={2}
                        fill={`url(#grad-${cat})`} />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Calendrier identique au tableau de bord */}
          <CalendarJour
            debut={data.periode.debut}
            fin={data.periode.fin}
            jours={data.calendrier}
            codes={data.codes || []}
            nom={nom}
            prenom={prenom}
            matricule={matricule}
          />
        </div>
      )}
    </div>
  );
}

// Libellé complet « juillet 2026 »
function moisLabel(mois) {
  const [y, m] = String(mois || '').split('-');
  if (!y || !m) return mois;
  return `${MOIS[Number(m) - 1]} ${y}`;
}