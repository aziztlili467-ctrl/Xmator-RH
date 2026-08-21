import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  AreaChart, Area, PieChart, Pie, Cell,
} from 'recharts';
import { api, mediaSrc } from '../api';
import { fmtJours, fmtDate } from '../utils';
import { presenceColor } from '../components/PresenceHeures';
import CalendarJour from '../components/CalendarJour';
import {
  IconUsers, IconCalendarCheck, IconTrendUp, IconAlert, IconClock,
} from '../components/icons';

// Mois de travail (règle 21 → 20) — cohérent avec la rubrique Calendrier et le module heures
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
  if (preset === '12m') {
    const d = new Date(y, now.getMonth(), now.getDate() + 1);
    d.setFullYear(d.getFullYear() - 1);
    return { debut: iso(d), fin: tIso };
  }
  return null;
}

function fmtHeures(v) {
  if (v === null || v === undefined) return '—';
  return `${Math.round(v * 100) / 100} h`;
}

function fmtPct(v) {
  if (v === null || v === undefined) return '—';
  return `${Math.round(v)} %`;
}

function fmtDur(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return [h, m, r].map((x) => String(x).padStart(2, '0')).join(':');
}

function cartePresence(v) {
  if (v === null || v === undefined) return { bg: '#e2e8f0', text: '#64748b' };
  if (v >= 100) return { bg: '#d1fae5', text: '#065f46' };
  if (v >= 90) return { bg: '#fef3c7', text: '#92400e' };
  if (v >= 75) return { bg: '#ffedd5', text: '#9a3412' };
  return { bg: '#fee2e2', text: '#991b1b' };
}

// ---- Carte KPI moderne avec dégradé + badge ----
function KpiCard({ title, value, sub, icon, chip, accent }) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg">
      <div className="flex items-start justify-between">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-sm" style={{ background: `linear-gradient(135deg, ${accent.from}, ${accent.to})` }}>
          {icon}
        </div>
        {chip !== undefined && chip !== null && (
          <span className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: chip.bg, color: chip.text }}>
            {chip.label}
          </span>
        )}
      </div>
      <p className="mt-4 truncate text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <p className="mt-1 text-2xl font-black tracking-tight text-slate-900">{value}</p>
      {sub && <p className="mt-1 truncate text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

// ---- Baromètre circulaire (jauge) ----
function Barometre({ pct, label, sub, color }) {
  const R = 34;
  const C = 2 * Math.PI * R;
  const val = Math.max(0, Math.min(100, pct === null || pct === undefined ? 0 : pct));
  const angle = val / 100;
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card">
      <div className="relative h-24 w-24 shrink-0">
        <svg viewBox="0 0 84 84" className="h-full w-full">
          <circle cx="42" cy="42" r={R} fill="none" stroke="#e2e8f0" strokeWidth="9" />
          <circle
            cx="42" cy="42" r={R} fill="none"
            stroke={color} strokeWidth="9" strokeLinecap="round"
            strokeDasharray={`${C * angle} ${C}`}
            transform="rotate(-90 42 42)"
            style={{ transition: 'stroke-dasharray 0.7s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-black" style={{ color }}>{fmtPct(pct)}</span>
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-sm font-bold text-slate-800">{label}</p>
        <p className="mt-0.5 text-xs text-slate-500">{sub}</p>
      </div>
    </div>
  );
}

// ---- Étoiles dorées d'évaluation (0 à 5) ----
function Stars({ value, size = 16, label }) {
  if (value === null || value === undefined) {
    return <span className="text-xs font-medium text-slate-400" title="Non évalué (aucun badge)">—</span>;
  }
  const v = Math.max(0, Math.min(5, Math.round(value)));
  const pct = v >= 5 ? 100 : v >= 4 ? 80 : v >= 3 ? 60 : v >= 2 ? 40 : v >= 1 ? 20 : 0;
  return (
    <span className="inline-flex flex-col items-center gap-0.5" title={`${label || 'Note'} : ${v}/5`}>
      <span className="relative inline-flex">
        <span className="flex gap-0.5 text-slate-300">
          {[1, 2, 3, 4, 5].map((i) => (
            <svg key={i} width={size} height={size} viewBox="0 0 24 24" className="block">
              <path fill="currentColor" d="M12 2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17.8l-6.1 3.6 1.5-6.8L2.2 9l6.9-.7z" />
            </svg>
          ))}
        </span>
        <span className="absolute inset-0 flex gap-0.5 overflow-hidden" style={{ width: `${pct}%` }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <svg key={i} width={size} height={size} viewBox="0 0 24 24" className="block shrink-0 text-amber-400 drop-shadow-[0_0_3px_rgba(251,191,36,0.6)]">
              <path fill="currentColor" d="M12 2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17.8l-6.1 3.6 1.5-6.8L2.2 9l6.9-.7z" />
            </svg>
          ))}
        </span>
      </span>
      <span className="text-[10px] font-bold text-amber-600">{v}/5</span>
    </span>
  );
}

// ---- En-tête de carte avec sous-titre ----
function CardTitle({ title, sub, right }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">{title}</h2>
        {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

// Couleurs des segments de la courbe empilée 100 %
const STACK_COLORS = {
  Présence: '#10b981',
  'Congé légal': '#3860ea',
  'Demi-journées de congé': '#8b5cf6',
  Maladie: '#f43f5e',
  Absence: '#f59e0b',
};

export default function Dashboard() {
  const [granularite, setGranularite] = useState('mois');
  const [preset, setPreset] = useState('annee');
  const [persoDebut, setPersoDebut] = useState(`${new Date().getFullYear()}-01-01`);
  const [persoFin, setPersoFin] = useState(`${new Date().getFullYear()}-12-31`);
  const [employeId, setEmployeId] = useState('');
  const [matricule, setMatricule] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [employesList, setEmployesList] = useState([]);
  const [recherche, setRecherche] = useState('');
  const [employesReady, setEmployesReady] = useState(false);
  const [photoErr, setPhotoErr] = useState(false);
  // Matricules dont la photo est introuvable (404/erreur) → bascule sur les initiales dans le tableau
  const [photosErreur, setPhotosErreur] = useState(() => new Set());
  const [filtresOuverts, setFiltresOuverts] = useState(false);

  useEffect(() => {
    api.employes().then((l) => { setEmployesList(l); setEmployesReady(true); }).catch(() => { setEmployesReady(true); });
  }, []);

  const filtreEmployeId = employeId ? Number(employeId) : null;

  // Employé résolu depuis la liste (par id ou matricule, avec tolérance numérique « 035 » = « 35 »)
  const employeFiltre = useMemo(() => {
    if (filtreEmployeId) return employesList.find((e) => e.id === filtreEmployeId) || null;
    const m = matricule.trim();
    if (!m) return null;
    const n = Number(m);
    return employesList.find((e) => e.matricule === m || (!Number.isNaN(n) && Number(e.matricule) === n)) || null;
  }, [filtreEmployeId, matricule, employesList]);

  useEffect(() => { setPhotoErr(false); }, [employeFiltre && (employeFiltre.id || employeFiltre.matricule)]);

  const marquerPhotoErreur = (matricule) => {
    setPhotosErreur((prev) => {
      if (prev.has(matricule)) return prev;
      const s = new Set(prev);
      s.add(matricule);
      return s;
    });
  };

  const matriculeIntrouvable = employesReady && !!matricule.trim() && !filtreEmployeId && !employeFiltre;

  // Calendrier de présence : mois en cours / mois dernier / période personnalisée, avec filtre employé
  const showCalendrier = (preset === 'mois' || preset === 'mois_dernier' || preset === 'perso') && !!employeFiltre && !!data && !!data.calendrier;

  const periode = useMemo(() => {
    if (preset === 'perso') return { debut: persoDebut, fin: persoFin };
    return periodePreset(preset) || { debut: persoDebut, fin: persoFin };
  }, [preset, persoDebut, persoFin]);

  // Requête uniquement si le filtre est résolu : jamais de 404 qui écrase le dashboard.
  // Les paramètres sont mémorisés : quand employesList se charge (employesReady), le fetch
  // n'est PAS relancé si le filtre est inchangé (évite un double appel inutile).
  const auditParams = useMemo(() => {
    if (matriculeIntrouvable) return null;
    return {
      granularite,
      debut: periode.debut,
      fin: periode.fin,
      employe_id: filtreEmployeId || undefined,
      matricule: filtreEmployeId ? undefined : (employeFiltre ? employeFiltre.matricule : undefined),
    };
  }, [granularite, periode, filtreEmployeId, employeFiltre, matriculeIntrouvable]);

  useEffect(() => {
    if (!auditParams) {
      setData(null);
      setError('');
      return;
    }
    setLoading(true);
    setError('');
    api.dashboardAudit(auditParams)
      .then((d) => { setData(d); })
      .catch((e) => { setData(null); setError(e.message); })
      .finally(() => setLoading(false));
  }, [auditParams]);

  // Données de l'histogramme heures légales vs travaillées
  const barData = useMemo(() => (data?.series || []).map((s) => ({
    label: s.label,
    'Heures légales': s.legal_heures,
    'Heures travaillées': s.travaille_heures,
    pct: s.presence_pct,
  })), [data]);

  // Données de la courbe empilée 100 % (répartition des journées)
  const stackData = useMemo(() => (data?.series || []).map((s) => {
    const tot = s.jours_presence + s.jours_conge + s.jours_maladie + s.jours_absence;
    const p = (v) => (tot > 0 ? Math.round((v / tot) * 1000) / 10 : 0);
    return {
      label: s.label,
      Présence: p(s.jours_presence),
      'Congé légal': p(s.jours_conge),
      Maladie: p(s.jours_maladie),
      Absence: p(s.jours_absence),
      tot,
    };
  }), [data]);

  // Donut répartition globale — les demi-journées de congé forment une tranche dédiée (violet)
  const donutData = useMemo(() => {
    const k = data?.kpis;
    if (!k) return [];
    const demi = k.jours_conge_demi || 0;
    const plein = Math.max(0, (k.jours_conge || 0) - demi);
    const tot = k.jours_presence + k.jours_conge + k.jours_maladie + k.jours_absence;
    return [
      { name: 'Présence', value: k.jours_presence, color: STACK_COLORS['Présence'] },
      { name: 'Congé légal', value: plein, color: STACK_COLORS['Congé légal'] },
      { name: 'Demi-journées de congé', value: demi, color: STACK_COLORS['Demi-journées de congé'] },
      { name: 'Maladie', value: k.jours_maladie, color: STACK_COLORS.Maladie },
      { name: 'Absence', value: k.jours_absence, color: STACK_COLORS.Absence },
    ].filter((d) => d.value > 0).map((d) => ({ ...d, pct: tot > 0 ? Math.round((d.value / tot) * 1000) / 10 : 0 }));
  }, [data]);

  // Données de l'histogramme retards / sorties anticipées
  const retardData = useMemo(() => (data?.series || []).map((s) => ({
    label: s.label,
    'Jours en retard': s.retards,
    'Sorties anticipées': s.departs_anticipe,
    minutes: Math.round((s.retard_secondes || 0) / 60),
  })), [data]);

  // Top des employés en retard (cumul sur la période)
  const topRetards = useMemo(() => (data?.employes || [])
    .filter((e) => (e.retard_secondes || 0) > 0)
    .sort((a, b) => (b.retard_secondes || 0) - (a.retard_secondes || 0))
    .slice(0, 8), [data]);
  const maxRetardsSec = topRetards.length ? topRetards[0].retard_secondes : 1;

  const k = data?.kpis;
  const presenceChip = k ? cartePresence(k.presence_pct) : null;

  // Filtres sur le tableau des employés
  const employesFiltres = useMemo(() => {
    const list = data?.employes || [];
    if (!recherche.trim()) return list;
    const s = recherche.trim().toLowerCase();
    return list.filter((e) =>
      `${e.matricule} ${e.nom} ${e.prenom} ${e.categorie}`.toLowerCase().includes(s));
  }, [data, recherche]);

  return (
    <div className="space-y-6">
      {/* ===== Panneau de filtres global (sidebar) ===== */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-4">
        <aside className="xl:col-span-1">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card xl:sticky xl:top-24">
            <button
              type="button"
              onClick={() => setFiltresOuverts(!filtresOuverts)}
              className="flex w-full items-center justify-between gap-2 border-b border-slate-100 pb-3 text-start xl:pointer-events-none xl:cursor-default"
            >
              <span className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-700/10 text-brand-700"><IconTrendUp /></span>
                <span>
                  <h2 className="text-sm font-bold text-slate-800">Filtres d'audit</h2>
                  <p className="text-[11px] text-slate-400">Appliqués à tous les graphiques</p>
                </span>
              </span>
              <svg className={`shrink-0 text-slate-400 transition-transform xl:hidden ${filtresOuverts ? 'rotate-180' : ''}`} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 9l6 6 6-6" /></svg>
            </button>

            <div className={`mt-4 space-y-4 ${filtresOuverts ? 'block' : 'hidden'} xl:block`}>
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Granularité</label>
                <div className="grid grid-cols-3 overflow-hidden rounded-lg ring-1 ring-slate-200">
                  {[['jour', 'Jour'], ['mois', 'Mois'], ['annee', 'Année']].map(([v, l]) => (
                    <button
                      key={v}
                      onClick={() => setGranularite(v)}
                      className={`px-2 py-2 text-xs font-semibold transition ${
                        granularite === v ? 'bg-brand-700 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Période</label>
                <select className="input w-full text-sm" value={preset} onChange={(e) => setPreset(e.target.value)}>
                  <option value="annee">Année en cours</option>
                  <option value="annee_prec">Année précédente</option>
                  <option value="mois">Mois en cours</option>
                  <option value="mois_dernier">Mois dernier</option>
                  <option value="12m">12 derniers mois</option>
                  <option value="perso">Personnalisée</option>
                </select>
              </div>

              {preset === 'perso' && (
                <div className="space-y-2">
                  <input type="date" className="input text-sm" value={persoDebut} onChange={(e) => setPersoDebut(e.target.value)} />
                  <input type="date" className="input text-sm" value={persoFin} onChange={(e) => setPersoFin(e.target.value)} />
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Employé</label>
                <select className="input w-full text-sm" value={employeId} onChange={(e) => { setEmployeId(e.target.value); if (e.target.value) setMatricule(''); }}>
                  <option value="">Tous les employés</option>
                  {employesList.map((e) => (
                    <option key={e.id} value={e.id}>{e.matricule} — {e.nom} {e.prenom}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">ou Matricule</label>
                <input
                  className="input text-sm"
                  placeholder="ex : 35"
                  value={matricule}
                  onChange={(e) => { setMatricule(e.target.value); if (e.target.value.trim()) setEmployeId(''); }}
                />
              </div>

              {employeFiltre ? (
                <div className="overflow-hidden rounded-xl ring-1 ring-slate-200">
                  <div className="flex items-center gap-3 bg-gradient-to-br from-brand-700 to-violet-700 p-3">
                    {photoErr ? (
                      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/20 text-lg font-black text-white">
                        {(employeFiltre.nom || '?').charAt(0)}{(employeFiltre.prenom || '').charAt(0)}
                      </span>
                    ) : (
                      <img
                        src={mediaSrc(employeFiltre.photo_url || `/photos/${employeFiltre.matricule}.webp`)}
                        alt="Photo"
                        className="h-14 w-14 shrink-0 rounded-full object-cover ring-2 ring-white/60"
                        onError={() => setPhotoErr(true)}
                      />
                    )}
                    <div className="min-w-0 text-white">
                      <p className="truncate text-sm font-bold">{employeFiltre.nom} {employeFiltre.prenom}</p>
                      <p className="text-xs text-white/80">Mat. {employeFiltre.matricule}</p>
                    </div>
                  </div>
                  <div className="space-y-1.5 bg-slate-50 px-3 py-2.5 text-xs">
                    <p className="flex items-center justify-between text-slate-600">
                      <span className="text-slate-400">Catégorie</span>
                      <span className="max-w-[55%] truncate font-semibold text-slate-800">{employeFiltre.categorie}</span>
                    </p>
                    <p className="flex items-center justify-between text-slate-600">
                      <span className="text-slate-400">Solde congé</span>
                      <span className="font-semibold text-emerald-600">{fmtJours(employeFiltre.solde ?? 0)} j</span>
                    </p>
                    <p className="flex items-center justify-between text-slate-600">
                      <span className="text-slate-400">Solde maladie</span>
                      <span className="font-semibold text-[#27C5F5]">{fmtJours(employeFiltre.solde_maladie ?? 0)} j</span>
                    </p>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600 ring-1 ring-slate-100">
                  <p className="font-semibold text-slate-700">{k?.effectif ?? 0} employé(s)</p>
                  <p className="mt-0.5 capitalize text-slate-400">
                    Granularité : {granularite === 'jour' ? 'par jour' : granularite === 'mois' ? 'par mois' : 'par année'}
                  </p>
                </div>
              )}

              {matriculeIntrouvable && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 ring-1 ring-red-200">
                  Aucun employé ne correspond au matricule « {matricule.trim()} ».
                </p>
              )}
              {data && (
                <p className="text-[11px] text-slate-400">
                  Période du {fmtDate(data.periode.debut)} au {fmtDate(data.periode.fin)}
                </p>
              )}
            </div>
          </div>
        </aside>

        {/* ===== Contenu principal ===== */}
        <div className="space-y-6 xl:col-span-3">
          {loading && !data && (
            <p className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 shadow-card">
              Chargement du tableau de bord…
            </p>
          )}
          {error && !data && (
            <p className="rounded-2xl border border-red-200 bg-red-50 p-10 text-center text-sm text-red-600 shadow-card">{error}</p>
          )}
          {!data && !loading && !error && (
            <p className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 shadow-card">
              {matriculeIntrouvable ? 'Aucune donnée à afficher pour ce matricule.' : 'Aucune donnée à afficher.'}
            </p>
          )}
          {data && (
            <>
          {/* ===== Cartes KPI ===== */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <KpiCard
              title="Effectif concerné"
              value={k.effectif}
              sub="employés actifs filtrés"
              icon={<IconUsers />}
              accent={{ from: '#3860ea', to: '#8b5cf6' }}
              chip={{ label: `${k.en_instance.demandes + k.en_instance.arrets} en instance`, bg: '#eef4ff', text: '#1c34cc' }}
            />
            <KpiCard
              title="Heures travaillées"
              value={fmtHeures(k.heures_travaillees)}
              sub={`sur ${fmtHeures(k.heures_legales)} légales`}
              icon={<IconClock />}
              accent={{ from: '#10b981', to: '#06b6d4' }}
            />
            <KpiCard
              title="Taux de présence"
              value={fmtPct(k.presence_pct)}
              sub="heures travaillées / légales"
              icon={<IconTrendUp />}
              accent={{ from: '#f59e0b', to: '#f97316' }}
              chip={presenceChip ? { label: fmtPct(k.presence_pct), bg: presenceChip.bg, text: presenceChip.text } : undefined}
            />
            <KpiCard
              title="Jours présents"
              value={`${k.jours_presents} j`}
              sub={`${fmtPct(k.jours_presents_pct)} des jours légaux (${k.jours_ouvrables * k.effectif} j)`}
              icon={<IconCalendarCheck />}
              accent={{ from: '#0d9488', to: '#10b981' }}
              chip={k.jours_presents_pct !== null ? { label: fmtPct(k.jours_presents_pct), bg: cartePresence(k.jours_presents_pct).bg, text: cartePresence(k.jours_presents_pct).text } : undefined}
            />
            <KpiCard
              title="Jours d'absence"
              value={`${k.jours_absence} j`}
              sub={`${fmtPct(k.jours_absence_pct)} des jours légaux`}
              icon={<IconAlert />}
              accent={{ from: '#f59e0b', to: '#ef4444' }}
              chip={k.jours_absence_pct !== null ? { label: fmtPct(k.jours_absence_pct), bg: '#ffedd5', text: '#9a3412' } : undefined}
            />
            <KpiCard
              title="Congés consommés"
              value={`${fmtJours(k.consomme_conge)} j`}
              sub={`sur ${fmtJours(k.accorde_conge)} j accordés`}
              icon={<IconCalendarCheck />}
              accent={{ from: '#f43f5e', to: '#ec4899' }}
            />
          </div>

          {/* ===== Calendrier de présence (mois en cours / mois précédent / période personnalisée, filtre par matricule) ===== */}
          {showCalendrier && (
            <CalendarJour
              debut={data.periode.debut}
              fin={data.periode.fin}
              jours={data.calendrier}
              nom={employeFiltre.nom}
              prenom={employeFiltre.prenom}
              matricule={employeFiltre.matricule}
            />
          )}

          {/* ===== Baromètres ===== */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Barometre pct={data.barometres.presence} label="Présence (heures)" sub={`${fmtHeures(k.heures_travaillees)} / ${fmtHeures(k.heures_legales)}`} color="#10b981" />
            <Barometre pct={data.barometres.jours_presence} label="Jours présents" sub={`${k.jours_presents} / ${k.jours_ouvrables * k.effectif} jours légaux`} color="#0d9488" />
            <Barometre pct={data.barometres.absence_jours} label="Jours d'absence" sub={`${k.jours_absence} jour(s) sans badge ni couverture`} color="#f59e0b" />
            <Barometre pct={data.barometres.conge} label="Congés utilisés" sub={`${fmtJours(k.consomme_conge)} / ${fmtJours(k.accorde_conge)} j`} color="#3860ea" />
            <Barometre pct={data.barometres.maladie} label="Maladie utilisée" sub={`${fmtJours(k.consomme_maladie)} / ${fmtJours(k.accorde_maladie)} j`} color="#f43f5e" />
            <Barometre pct={data.barometres.ponctualite} label="Ponctualité globale" sub={`${k.journees_presence - k.retards} / ${k.journees_presence} journée(s) sans retard`} color="#8b5cf6" />
          </div>

          {/* ===== Évaluation des employés (étoiles dorées) ===== */}
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-5 text-white shadow-card">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-amber-300">
                  ★ Évaluation de la ponctualité
                </h2>
                <p className="mt-1 text-xs text-slate-300">
                  Note de 0 à 5 étoiles selon le % de journées conformes (sans retard / sortie régulière) — période filtrée.
                </p>
              </div>
              <span className="rounded-lg bg-white/10 px-2.5 py-1 text-xs font-semibold text-amber-200 ring-1 ring-white/20">
                {k.journees_presence} journée(s) évaluée(s)
              </span>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex items-center justify-between gap-4 rounded-xl bg-white/10 p-4 ring-1 ring-white/15 backdrop-blur">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-rose-200">Retards (entrées)</p>
                  <p className="mt-1 text-2xl font-black text-white">{fmtPct(data.barometres.ponctualite)}</p>
                  <p className="mt-0.5 text-[11px] text-slate-300">{k.journees_presence - k.retards} jour(s) sans retard / {k.journees_presence}</p>
                </div>
                <Stars value={k.note_retards} size={26} label="Note retards" />
              </div>
              <div className="flex items-center justify-between gap-4 rounded-xl bg-white/10 p-4 ring-1 ring-white/15 backdrop-blur">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-sky-200">Sorties anticipées</p>
                  <p className="mt-1 text-2xl font-black text-white">{fmtPct(data.barometres.sorties_conformes)}</p>
                  <p className="mt-0.5 text-[11px] text-slate-300">{k.journees_presence - k.departs_anticipe} sortie(s) régulière(s) / {k.journees_presence}</p>
                </div>
                <Stars value={k.note_sorties} size={26} label="Note sorties" />
              </div>
            </div>
            <p className="mt-3 text-[11px] text-slate-400">
              Échelle : 5 ★ ≥ 97,5 % · 4 ★ ≥ 92 % · 3 ★ ≥ 82 % · 2 ★ ≥ 65 % · 1 ★ ≥ 40 % · 0 ★ &lt; 40 % de journées conformes.
            </p>
          </div>

          {/* ===== Présence & ponctualité (pointages) ===== */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
            <CardTitle
              title="Présence & ponctualité"
              sub={`${k.journees_presence} journée(s) pointée(s) sur la période filtrée`}
              right={
                <span className="rounded-lg bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-600">
                  {k.retards} retard(s) · {fmtDur(k.retard_secondes)}
                </span>
              }
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Barometre pct={data.barometres.ponctualite} label="Ponctualité entrée" sub={`${k.journees_presence - k.retards} / ${k.journees_presence} journée(s) sans retard`} color="#f43f5e" />
              <Barometre pct={data.barometres.sorties_conformes} label="Sorties conformes" sub={`${k.journees_presence - k.departs_anticipe} / ${k.journees_presence} sortie(s) régulière(s)`} color="#0ea5e9" />
              <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Retards cumulés</p>
                <p className="mt-1 text-2xl font-black text-slate-900">{k.retards} <span className="text-sm font-semibold text-slate-400">jour(s)</span></p>
                <p className="mt-1 text-xs text-slate-500">total {fmtDur(k.retard_secondes)}</p>
                <div className="mt-2"><Stars value={k.note_retards} size={14} label="Note retards" /></div>
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Sorties anticipées</p>
                <p className="mt-1 text-2xl font-black text-slate-900">{k.departs_anticipe} <span className="text-sm font-semibold text-slate-400">jour(s)</span></p>
                <p className="mt-1 text-xs text-slate-500">total {fmtDur(k.sortie_anticipee_secondes)}</p>
                <div className="mt-2"><Stars value={k.note_sorties} size={14} label="Note sorties" /></div>
              </div>
            </div>
          </div>

          {/* ===== Graphiques principaux ===== */}
          <div className="grid grid-cols-1 gap-6 2xl:grid-cols-2">
            {/* Histogramme heures */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
              <CardTitle
                title="Heures légales vs travaillées"
                sub={`${data.series.length} période(s) • heures cumulées`}
                right={<span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">{fmtHeures(k.heures_travaillees)}</span>}
              />
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={barData} margin={{ top: 5, right: 5, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(v) => [fmtHeures(v), '']} cursor={{ fill: '#f1f5f9' }} labelStyle={{ fontWeight: 700 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Heures légales" fill="#cbd5e1" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="Heures travaillées" radius={[4, 4, 0, 0]} maxBarSize={28}>
                    {barData.map((entry, i) => (
                      <Cell key={i} fill={presenceColor(entry.pct)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-4 text-[11px] text-slate-500">
                <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-slate-300" /> Heures légales</span>
                <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm" style={{ background: '#10b981' }} /> ≥ 100 %</span>
                <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm" style={{ background: '#f59e0b' }} /> 90–99 %</span>
                <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm" style={{ background: '#f97316' }} /> 75–89 %</span>
                <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm" style={{ background: '#ef4444' }} /> &lt; 75 %</span>
              </div>
            </div>

            {/* Courbe empilée 100 % */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
              <CardTitle
                title="Répartition du temps (100 % empilé)"
                sub="présence / congé / maladie / absence par période"
                right={<span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">100 %</span>}
              />
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={stackData} margin={{ top: 5, right: 5, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                  <Tooltip formatter={(v, n) => [`${v}%`, n]} cursor={{ stroke: '#cbd5e1', strokeDasharray: '3 3' }} labelStyle={{ fontWeight: 700 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {Object.entries(STACK_COLORS).map(([name, color]) => (
                    <Area key={name} type="monotone" dataKey={name} stackId="1" stroke={color} fill={color} fillOpacity={0.85} strokeWidth={1} />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
              <div className="mt-2 text-center text-[11px] text-slate-400">
                Part de chaque situation dans les journées de la période filtrée.
              </div>
            </div>
          </div>

          {/* ===== Retards : histogramme + top employés ===== */}
          <div className="grid grid-cols-1 gap-6 2xl:grid-cols-2">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
              <CardTitle
                title="Retards & sorties anticipées"
                sub="journées concernées par période"
                right={<span className="rounded-lg bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-600">{k.retards + k.departs_anticipe} événement(s)</span>}
              />
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={retardData} margin={{ top: 5, right: 5, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} />
                  <Tooltip
                    formatter={(v, n) => (n === 'minutes' ? [`${v} min`, ''] : [v, n])}
                    cursor={{ fill: '#f1f5f9' }}
                    labelStyle={{ fontWeight: 700 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Jours en retard" fill="#f43f5e" radius={[4, 4, 0, 0]} maxBarSize={26} />
                  <Bar dataKey="Sorties anticipées" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={26} />
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-4 text-[11px] text-slate-500">
                <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-rose-500" /> Retards (entrée)</span>
                <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-amber-500" /> Sorties anticipées</span>
              </div>
            </div>

            {/* Top employés en retard */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
              <CardTitle title="Top des employés en retard" sub="cumul de retard décroissant (max 8)" />
              {topRetards.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-400">Aucun retard sur cette période.</p>
              ) : (
                <div className="space-y-3">
                  {topRetards.map((e, i) => (
                    <div key={e.id} className="flex items-center gap-3">
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${i === 0 ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-500'}`}>{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <Link to={`/employes/${e.id}`} className="truncate text-sm font-semibold text-slate-800 hover:text-brand-700">
                            {e.nom} {e.prenom}
                          </Link>
                          <span className="shrink-0 text-xs font-bold text-rose-600">{e.retards} j · {fmtDur(e.retard_secondes)}</span>
                        </div>
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full" style={{ width: `${Math.min(100, (e.retard_secondes / maxRetardsSec) * 100)}%`, background: 'linear-gradient(90deg, #fb7185, #f43f5e)' }} />
                        </div>
                      </div>
                      <Stars value={e.etoiles_retard} size={14} label="Note retards" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ===== Donut + Répartition par catégorie ===== */}
          <div className="grid grid-cols-1 gap-6 2xl:grid-cols-2">
            {/* Donut global */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
              <CardTitle title="Répartition globale" sub="journées cumulées sur la période" />
              <div className="flex flex-col items-center gap-4 sm:flex-row">
                <div className="h-52 w-52 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={88} paddingAngle={3} strokeWidth={0}>
                        {donutData.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Pie>
                      <Tooltip formatter={(v, n, p) => [`${fmtJours(v)} j (${p.payload.pct} %)`, n]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="w-full space-y-2">
                  {donutData.map((d) => (
                    <div key={d.name} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-100">
                      <span className="flex items-center gap-2 text-sm text-slate-700">
                        <span className="h-3 w-3 rounded-full" style={{ background: d.color }} /> {d.name}
                      </span>
                      <span className="text-sm font-bold text-slate-800">{fmtJours(d.value)} j <span className="font-normal text-slate-400">({fmtPct(d.pct)})</span></span>
                    </div>
                  ))}
                  {donutData.length === 0 && <p className="py-6 text-center text-sm text-slate-400">Aucune donnée sur cette période.</p>}
                </div>
              </div>
            </div>

            {/* Répartition par catégorie */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
              <CardTitle title="Répartition par catégorie" sub={`${data.parCategorie.length} catégorie(s)`} />
              <div className="max-h-72 space-y-3 overflow-auto pe-1">
                {data.parCategorie.map((c) => (
                  <div key={c.categorie} className="rounded-xl border border-slate-100 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-800">{c.categorie}</p>
                        <p className="text-xs text-slate-500">
                          {c.nb_employes} employé(s) · {c.jours_presents} j présents · {c.jours_absence} j abs · {fmtHeures(c.travaille_heures)}{c.retards ? ` · ${c.retards} retard(s)` : ''}
                        </p>
                        <div className="mt-1.5 flex items-center gap-3">
                          <span className="flex items-center gap-1 text-[11px] text-slate-500"><span className="text-rose-500">Retards</span><Stars value={c.etoiles_retard} size={12} /></span>
                          <span className="flex items-center gap-1 text-[11px] text-slate-500"><span className="text-sky-500">Sorties</span><Stars value={c.etoiles_sortie} size={12} /></span>
                        </div>
                      </div>
                      <span className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold" style={cartePresence(c.presence_pct)}>
                        {fmtPct(c.presence_pct)}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, c.presence_pct ?? 0)}%`, background: presenceColor(c.presence_pct) }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ===== Alertes ===== */}
          {(data.alertes || []).length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-amber-800">
                <IconAlert /> Alertes de solde ({data.alertes.length})
              </h2>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {data.alertes.map((e) => {
                  const det = data.employes.find((x) => x.id === e.id);
                  const solde = det ? det.solde_conge : 0;
                  return (
                    <Link
                      key={e.id}
                      to={`/employes/${e.id}`}
                      className="flex items-center justify-between rounded-xl border border-amber-200 bg-white px-4 py-3 transition hover:border-amber-300 hover:shadow-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-800">{e.nom} {e.prenom}</p>
                        <p className="text-xs text-slate-500">Mat. {e.matricule} · {e.categorie}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${solde < 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                        {solde < 0 ? 'Solde négatif' : `${fmtJours(solde)} j restants`}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* ===== Tableau des employés ===== */}
          <div className="rounded-2xl border border-slate-200/80 bg-white shadow-card">
            <div className="flex w-full flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-5">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">Détail par employé</h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  {employesFiltres.length} / {data.employes.length} employé(s) affiché(s)
                </p>
              </div>
              <div className="flex w-full items-center gap-2 sm:w-auto">
                <input
                  className="input w-full text-sm sm:w-64"
                  placeholder="Rechercher matricule / nom…"
                  value={recherche}
                  onChange={(e) => setRecherche(e.target.value)}
                />
                <Link to="/employes" className="shrink-0 text-xs font-semibold text-brand-700 hover:underline">Voir tout →</Link>
              </div>
            </div>
            <div className="table-wrap max-h-[480px] overflow-auto">
              <table className="w-max-table text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50">
                  <tr className="text-start text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3">Employé</th>
                    <th className="px-4 py-3 text-center">Heures trav.</th>
                    <th className="px-4 py-3 text-center">Présence</th>
                    <th className="px-4 py-3 text-center">J. présents</th>
                    <th className="px-4 py-3 text-center">Congé (j)</th>
                    <th className="px-4 py-3 text-center">Maladie (j)</th>
                    <th className="px-4 py-3 text-center">Absence (j)</th>
                    <th className="px-4 py-3 text-center">Retards</th>
                    <th className="px-4 py-3 text-center">Sorties ant.</th>
                    <th className="px-4 py-3 text-center">Solde congé</th>
                    <th className="px-4 py-3 text-center">Solde maladie</th>
                  </tr>
                </thead>
                <tbody>
                  {employesFiltres.length === 0 && (
                    <tr><td colSpan={11} className="px-4 py-8 text-center text-slate-400">Aucun employé ne correspond.</td></tr>
                  )}
                  {employesFiltres.map((e) => (
                    <tr key={e.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          {e.photo_url && !photosErreur.has(e.matricule) ? (
                            <img
                              src={mediaSrc(e.photo_url)}
                              alt="Photo"
                              className="h-9 w-9 rounded-full object-cover ring-1 ring-slate-200"
                              onError={() => marquerPhotoErreur(e.matricule)}
                            />
                          ) : (
                            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-400">
                              {(e.nom || '?').charAt(0)}{(e.prenom || '').charAt(0)}
                            </span>
                          )}
                          <div className="min-w-0">
                            <Link to={`/employes/${e.id}`} className="block truncate font-semibold text-slate-800 hover:text-brand-700">
                              {e.nom} {e.prenom}
                            </Link>
                            <span className="text-[11px] text-slate-400">Mat. {e.matricule} · {e.categorie}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-center font-semibold text-slate-700">{fmtHeures(e.travaille_heures)}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className="inline-flex rounded-md px-2 py-0.5 text-xs font-bold" style={cartePresence(e.presence_pct)}>
                          {fmtPct(e.presence_pct)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className="inline-flex rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700" title={`${e.jours_presents} j sur ${e.jours_ouvrables} jours légaux`}>
                          {e.jours_presents} j · {fmtPct(e.jours_presents_pct)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center text-slate-600">{e.jours_conge || '—'}</td>
                      <td className="px-4 py-2.5 text-center text-slate-600">{e.jours_maladie || '—'}</td>
                      <td className="px-4 py-2.5 text-center">
                        {e.jours_absence ? (
                          <span className="inline-flex rounded-md bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700" title={`${e.jours_absence} j sans badge ni couverture sur ${e.jours_ouvrables} jours légaux`}>
                            {e.jours_absence} j · {fmtPct(e.jours_absence_pct)}
                          </span>
                        ) : <span className="text-emerald-600">0</span>}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {e.retards ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="inline-flex rounded-md bg-rose-50 px-2 py-0.5 text-xs font-bold text-rose-600" title={`cumul ${fmtDur(e.retard_secondes)}`}>
                              {e.retards} j · {fmtDur(e.retard_secondes)}
                            </span>
                            <Stars value={e.etoiles_retard} size={12} label="Note retards" />
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-emerald-600">0</span>
                            <Stars value={e.etoiles_retard} size={12} label="Note retards" />
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {e.departs_anticipe ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="inline-flex rounded-md bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-600" title={`cumul ${fmtDur(e.sortie_anticipee_secondes)}`}>
                              {e.departs_anticipe} j · {fmtDur(e.sortie_anticipee_secondes)}
                            </span>
                            <Stars value={e.etoiles_sortie} size={12} label="Note sorties" />
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-emerald-600">0</span>
                            <Stars value={e.etoiles_sortie} size={12} label="Note sorties" />
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`font-bold ${e.solde_conge < 0 ? 'text-red-600' : e.solde_conge < 5 ? 'text-amber-600' : 'text-emerald-600'}`}>
                          {fmtJours(e.solde_conge)} j
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`font-bold ${e.solde_maladie < 0 ? 'text-red-600' : e.solde_maladie < 5 ? 'text-amber-600' : 'text-[#27C5F5]'}`}>
                          {fmtJours(e.solde_maladie)} j
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}