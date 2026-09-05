import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend, Cell,
} from 'recharts';
import { api } from '../api';
import { fmtDate } from '../utils';

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function moisLabel(mois) {
  const [y, m] = String(mois || '').split('-');
  if (!y || !m) return mois;
  return `${MOIS[Number(m) - 1]} ${y}`;
}

// Libellé court pour l'axe des abscisses : seulement le mois (ex. « janvier »)
function moisCourt(mois) {
  const m = Number(String(mois || '').split('-')[1]);
  return m && MOIS[m - 1] ? MOIS[m - 1] : String(mois || '');
}

// Libellé d'une période de mois de travail : « juillet 2026 (21/06 → 20/07) »
function moisPeriodeLabel(m) {
  if (!m || !m.debut || !m.fin) return moisLabel(m && m.mois);
  const d = (iso) => (iso ? iso.split('-').slice(1).reverse().join('/') : '');
  return `${moisLabel(m.mois)} (${d(m.debut)} → ${d(m.fin)})`;
}

// Mois de travail (règle 21 → 20) : un jour (année y, mois m, jour d) appartient à la période (py, pm).
// Ex. juillet 2026 = 21/06 → 20/07 (mêmes règles que la rubrique Calendrier de l'année).
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

function todayIso() {
  return new Date().toISOString().split('T')[0];
}

function periodePreset(preset) {
  const now = new Date();
  const y = now.getFullYear();
  const iso = (d) => d.toISOString().split('T')[0];
  const todayIso = iso(now);
  const mt = moisTravail(todayIso);
  if (preset === 'mois') {
    // Mois en cours : du 21 du mois précédent au 20 du mois courant (fin = aujourd'hui au plus tard)
    const r = rangeMoisTravail(mt.annee, mt.mois);
    return { debut: r.debut, fin: todayIso < r.fin ? todayIso : r.fin };
  }
  if (preset === 'mois_dernier') {
    // Mois précédent (période complète 21 → 20)
    let pm = mt.mois - 1, py = mt.annee;
    if (pm < 0) { pm = 11; py -= 1; }
    return rangeMoisTravail(py, pm);
  }
  if (preset === 'annee') return { debut: `${y}-01-01`, fin: `${y}-12-31` };
  if (preset === 'annee_prec') return { debut: `${y - 1}-01-01`, fin: `${y - 1}-12-31` };
  return null;
}

const SOURCE_LABELS = {
  normal: 'Jour normal',
  ete: 'Été (juil-août)',
  ramadan: 'Ramadan',
  weekend: 'Week-end',
  ferie: 'Férié',
  manuel: 'Manuel',
};

// Couleur du % de présence : ≥ 100 % vert (dépassement), 90-99 ambre, 75-89 orange, < 75 rouge
export function presenceColor(pct) {
  if (pct === null || pct === undefined) return '#94a3b8';
  if (pct >= 100) return '#10b981';
  if (pct >= 90) return '#f59e0b';
  if (pct >= 75) return '#f97316';
  return '#ef4444';
}

// Baromètre (jauge circulaire) : % de présence par rapport aux heures légales
function Barometre({ pct }) {
  const R = 70;
  const C = 2 * Math.PI * R;
  const val = Math.max(0, Math.min(200, pct === null || pct === undefined ? 0 : pct));
  const angle = Math.min(val, 100) / 100;
  const color = presenceColor(pct);
  return (
    <div className="relative mx-auto h-40 w-40">
      <svg viewBox="0 0 160 160" className="h-full w-full">
        <circle cx="80" cy="80" r={R} fill="none" stroke="#e2e8f0" strokeWidth="14" />
        <circle
          cx="80" cy="80" r={R} fill="none"
          stroke={color} strokeWidth="14" strokeLinecap="round"
          strokeDasharray={`${C * angle} ${C}`}
          transform="rotate(-90 80 80)"
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-black" style={{ color }}>
          {pct === null || pct === undefined ? '—' : `${Math.round(pct)}%`}
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">présence</span>
      </div>
    </div>
  );
}

function fmtHeures(v) {
  if (v === null || v === undefined) return '—';
  return `${Math.round(v * 100) / 100} h`;
}

export default function PresenceHeures({ matricule }) {
  const [preset, setPreset] = useState('annee');
  const [persoDebut, setPersoDebut] = useState('');
  const [persoFin, setPersoFin] = useState('');
  const [mode, setMode] = useState('mois'); // 'mois' | 'jour'
  const [moisSel, setMoisSel] = useState(''); // mois sélectionné dans le baromètre (clé AAAA-MM)
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const periode = useMemo(() => {
    if (preset === 'perso') return { debut: persoDebut, fin: persoFin };
    return periodePreset(preset);
  }, [preset, persoDebut, persoFin]);

  useEffect(() => {
    if (!matricule) return;
    setLoading(true);
    setError('');
    api.employeHeures(matricule, periode)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [matricule, periode]);

  const chartData = useMemo(() => {
    if (!data) return [];
    if (mode === 'mois') {
      return (data.parMois || []).map((m) => ({
        libelle: moisCourt(m.mois),
        periode: moisPeriodeLabel(m),
        Légales: m.legal_heures,
        Travaillées: m.travaille_heures,
        pct: m.presence_pct,
      }));
    }
    return (data.parJour || [])
      .filter((j) => j.legal_heures !== null && j.legal_heures !== undefined)
      .map((j) => ({
        libelle: fmtDate(j.date).slice(0, 5),
        date: j.date,
        Légales: j.legal_heures,
        Travaillées: j.travaille_heures,
        pct: j.presence_pct,
        jour_type: j.jour_type,
        label: j.label,
      }));
  }, [data, mode]);

  // Baromètre : en mode "mois", affiche la ligne du mois sélectionné (mêmes stats que le tableau) ;
  // sinon (mode "jour") les totaux de la période.
  const baro = useMemo(() => {
    if (!data) return null;
    if (mode === 'mois' && data.parMois?.length) {
      let m = data.parMois.find((x) => x.mois === moisSel);
      if (!m) {
        // Défaut : mois en cours (règle 21 → 20) s'il est présent, sinon dernier mois de la liste
        const mt = moisTravail(todayIso());
        const cur = `${mt.annee}-${String(mt.mois + 1).padStart(2, '0')}`;
        m = data.parMois.find((x) => x.mois === cur) || data.parMois[data.parMois.length - 1];
      }
      return m;
    }
    return data.totaux || null;
  }, [data, mode, moisSel]);

  const baroPresence = baro?.presence_pct;
  const baroLegal = baro?.legal_heures;
  const baroTrav = baro?.travaille_heures;
  const baroJoursP = baro?.jours_presents;
  const baroJoursL = baro?.jours_legaux;
  const baroPeriode = baro?.debut && baro?.fin ? { debut: baro.debut, fin: baro.fin } : (data?.periode || {});

  return (
    <div className="card p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-600">Heures travaillées vs heures légales</h3>
          <p className="text-xs text-slate-400">Présence comparée aux heures légales émises par l'administration. Mois de travail : du 21 du mois précédent au 20 du mois courant.</p>
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

      {error && <p className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}

      {loading && !data && <p className="py-10 text-center text-sm text-slate-400">Chargement des heures…</p>}

      {data && (
        <>
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Baromètre + totaux */}
            <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-100">
              {mode === 'mois' && (data.parMois || []).length > 0 && (
                <select
                  className="input mb-3 w-full text-xs"
                  value={baro?.mois || ''}
                  onChange={(e) => setMoisSel(e.target.value)}
                >
                  {(data.parMois || []).map((m) => (
                    <option key={m.mois} value={m.mois}>{moisLabel(m.mois)}</option>
                  ))}
                </select>
              )}
              <Barometre pct={baroPresence} />
              <div className="mt-3 grid grid-cols-1 gap-2 text-center xs:grid-cols-3">
                <div className="rounded-lg bg-white p-2 ring-1 ring-slate-200">
                  <p className="text-[10px] font-semibold uppercase text-slate-400">Légales</p>
                  <p className="text-sm font-bold text-slate-700">{fmtHeures(baroLegal)}</p>
                </div>
                <div className="rounded-lg bg-white p-2 ring-1 ring-slate-200">
                  <p className="text-[10px] font-semibold uppercase text-slate-400">Travaillées</p>
                  <p className="text-sm font-bold text-sky-700">{fmtHeures(baroTrav)}</p>
                </div>
                <div className="rounded-lg bg-white p-2 ring-1 ring-slate-200">
                  <p className="text-[10px] font-semibold uppercase text-slate-400">Jours présents</p>
                  <p className="text-sm font-bold text-slate-700">{baroJoursP ?? '—'} <span className="text-[10px] font-normal text-slate-400">/ {baroJoursL ?? '—'}</span></p>
                </div>
              </div>
              <p className="mt-3 text-center text-xs text-slate-400">
                {mode === 'mois' && baro?.debut
                  ? `${moisLabel(baro.mois)} : ${fmtDate(baro.debut)} → ${fmtDate(baro.fin)}`
                  : `Du ${fmtDate(baroPeriode.debut)} au ${fmtDate(baroPeriode.fin)}`}
              </p>
            </div>

            {/* Histogramme comparatif */}
            <div className="lg:col-span-2">
              <div className="h-72">
                {chartData.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-slate-400">
                    Aucune donnée sur cette période.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="libelle" tick={{ fontSize: 8 }} interval={mode === 'jour' ? 'preserveStartEnd' : 0} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip
                        formatter={(v, name) => [`${Math.round(Number(v) * 100) / 100} h`, name]}
                        labelFormatter={(label, payload) => {
                          const p = payload?.[0]?.payload;
                          if (mode === 'mois' && p?.periode) return p.periode;
                          if (mode === 'jour' && p?.date) {
                            const fete = p.label ? ` — ${p.label}` : '';
                            return `${fmtDate(p.date)} — ${SOURCE_LABELS[p.jour_type] || p.jour_type || ''}${fete}`;
                          }
                          return label;
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="Légales" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Travaillées" radius={[4, 4, 0, 0]}>
                        {chartData.map((entry, idx) => (
                          <Cell key={idx} fill={presenceColor(entry.pct)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-4 text-[11px] text-slate-500">
                <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-slate-400" /> Heures légales</span>
                <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm" style={{ background: '#10b981' }} /> Travaillées (≥ 100 %)</span>
                <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm" style={{ background: '#f59e0b' }} /> 90–99 %</span>
                <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm" style={{ background: '#f97316' }} /> 75–89 %</span>
                <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm" style={{ background: '#ef4444' }} /> &lt; 75 %</span>
              </div>
            </div>
          </div>

          {/* Tableau détaillé (mois ou jours) */}
          <div className="table-wrap mt-4 max-h-80 overflow-auto rounded-xl ring-1 ring-slate-200">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50">
                <tr className="border-b border-slate-200 text-start text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">{mode === 'mois' ? 'Mois' : 'Date'}</th>
                  <th className="px-4 py-3 text-center">Heures légales</th>
                  <th className="px-4 py-3 text-center">Heures travaillées</th>
                  <th className="px-4 py-3 text-center">Présence</th>
                </tr>
              </thead>
              <tbody>
                {mode === 'mois'
                  ? (data.parMois || []).map((m) => (
                    <tr key={m.mois} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-2.5 text-xs font-semibold text-slate-700">{moisLabel(m.mois)}</td>
                      <td className="px-4 py-2.5 text-center text-slate-600">{fmtHeures(m.legal_heures)}</td>
                      <td className="px-4 py-2.5 text-center font-semibold text-slate-700">{fmtHeures(m.travaille_heures)}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className="inline-flex rounded-md px-2 py-0.5 text-xs font-bold" style={{ background: presenceColor(m.presence_pct), color: '#fff' }}>
                          {m.presence_pct === null || m.presence_pct === undefined ? '—' : `${Math.round(m.presence_pct)}%`}
                        </span>
                      </td>
                    </tr>
                  ))
                  : (data.parJour || []).map((j) => (
                    <tr key={j.date} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-2.5">
                        <span className="font-semibold text-slate-700">{fmtDate(j.date)}</span>
                        <span className="ms-2 text-[11px] text-slate-400">{SOURCE_LABELS[j.jour_type] || ''}{j.label ? ` — ${j.label}` : ''}</span>
                      </td>
                      <td className="px-4 py-2.5 text-center text-slate-600">{fmtHeures(j.legal_heures)}</td>
                      <td className="px-4 py-2.5 text-center font-semibold text-slate-700">{fmtHeures(j.travaille_heures)}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className="inline-flex rounded-md px-2 py-0.5 text-xs font-bold" style={{ background: presenceColor(j.presence_pct), color: '#fff' }}>
                          {j.presence_pct === null || j.presence_pct === undefined ? '—' : `${Math.round(j.presence_pct)}%`}
                        </span>
                      </td>
                    </tr>
                  ))}
                {(mode === 'mois' ? data.parMois : data.parJour).length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400">Aucune donnée sur cette période.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
