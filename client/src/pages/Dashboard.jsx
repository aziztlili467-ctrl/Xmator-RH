import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import { api, mediaSrc } from '../api';
import { getSocket } from '../socket';
import { fmtJours, fmtDate } from '../utils';
import CalendarJour from '../components/CalendarJour';
import {
  IconUsers, IconCalendarCheck, IconTrendUp, IconAlert, IconClock,
} from '../components/icons';
import HoursComboChart from '../components/ui/HoursComboChart';
import StairsStatsDiagram from '../components/ui/StairsStatsDiagram';
import AnimatedNumber, { fmtFr } from '../components/ui/AnimatedNumber';
import DonutPro from '../components/ui/DonutPro';
import RadialGauge from '../components/ui/RadialGauge';
import PresenceHeatmap from '../components/ui/PresenceHeatmap';
import TiroirContexte from '../components/ui/TiroirContexte';
import AvatarMenu from '../components/ui/AvatarMenu';
import SearchSema from '../components/ui/SearchSema';
import SegmentedControl from '../components/ui/SegmentedControl';
import { useAuth } from '../AuthContext';
import { demoCategories, demoDashboardPayload, demoEmployesList } from '../demo/demoData';

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

// Carte de présence (sémantique couleur en mode sombre premium)
function cartePresence(v) {
  if (v === null || v === undefined) return { cls: 'chip--neutral', label: '—' };
  if (v >= 100) return { cls: 'chip--emerald', label: 'Optimal' };
  if (v >= 90) return { cls: 'chip--amber', label: '90–99 %' };
  if (v >= 75) return { cls: 'chip--amber', label: '75–89 %' };
  return { cls: 'chip--rose', label: '< 75 %' };
}

function noteEtoiles(v) {
  if (v === null || v === undefined) return 0;
  const x = Math.max(0, Math.min(5, Math.round(v)));
  return x;
}

// ---- Étoiles dorées (0–5), version cockpit ----
function Star({ size, gold }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="block shrink-0" style={gold ? { filter: 'drop-shadow(0 0 4px rgba(227,185,77,0.55))' } : undefined}>
      <path fill={gold ? '#F3C53D' : 'rgba(148,163,199,0.22)'} d="M12 2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17.8l-6.1 3.6 1.5-6.8L2.2 9l6.9-.7z" />
    </svg>
  );
}
function Stars({ value, size = 14, label }) {
  if (value === null || value === undefined) return <span className="text-[11px]" style={{ color: 'var(--dp-text-3)' }} title="Non évalué">—</span>;
  const v = noteEtoiles(value);
  const unit = 24 / size; // ratio viewBox/px pour calculer la largeur du clip
  const totalW = size * 5 + (4 * 5) / unit;
  const pct = v / 5;
  return (
    <span className="inline-flex items-center gap-1.5" title={`${label || 'Note'} : ${v}/5`}>
      <span className="relative inline-flex overflow-hidden rounded" style={{ width: totalW }}>
        <span className="flex gap-1">{[1, 2, 3, 4, 5].map((i) => <Star key={i} size={size} gold={i <= v} />)}</span>
      </span>
      <span className="num text-[10px] font-bold" style={{ color: 'var(--dp-gold-deep)' }}>{v}/5</span>
    </span>
  );
}

// ---- Sparkline mini (12 périodes) sous les KPI ----
function Sparkbars({ values = [], color = 'var(--dp-gold)' }) {
  if (!values.length) return null;
  const max = Math.max(...values.map((v) => Math.abs(v) || 0), 1);
  const n = values.length;
  const w = 118; const h = 26; const bw = Math.max(2.5, w / n - 3);
  return (
    <svg width={w} height={h + 6} viewBox={`0 0 ${w} ${h + 6}`} className="kpi-spark opacity-80" aria-hidden="true">
      {values.map((v, i) => {
        const bh = Math.max(2, (Math.abs(v) / max) * h);
        return (
          <rect
            key={i}
            x={i * (w / n) + 1}
            y={h - bh + 3}
            width={bw}
            height={bh}
            rx={1.6}
            fill={i === n - 1 ? color : `${color}`}
            opacity={0.28 + (i / n) * 0.72}
          />
        );
      })}
    </svg>
  );
}

// ---- Widget KPI : verre + or, compteur animé, cliquable (tiroir) ----
function KpiWidget({ title, valueEl, sub, icon, chip, glow = 'rgba(217,168,63,0.55)', color = '#D9A83F', spark, delay = 0, onClick }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' && onClick) onClick(); }}
      className="panel glass--lift kpi-widget rise p-4 sm:p-[18px]"
      style={{ '--kpi-glow': glow, '--d': `${delay}ms` }}
      title="Cliquer pour ouvrir le détail dans le panneau contextuel"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="kpi-icon" style={{ color, borderColor: `${color}55` }}>{icon}</span>
        {chip ? <span className={`chip ${chip.cls}`}>{chip.label}</span> : <span className="spark-dot" />}
      </div>
      <p className="kpi-label mt-3">{title}</p>
      <p className="kpi-value mt-1.5">{valueEl}</p>
      {sub && <p className="kpi-sub mt-1.5 leading-snug">{sub}</p>}
      <div className="mt-2 flex items-end justify-between gap-2">
        {spark && <Sparkbars values={spark} color={color} />}
      </div>
    </div>
  );
}

// ---- En-tête de panneau ----
function PanelHead({ title, sub, right }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="sec-title">{title}</h2>
        {sub && <p className="sec-sub">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

// ---- Aperçu de la journée : horloge locale, météo, alertes critiques ----
function ApercuJournee({ nbAlertes, enInstance, onOpenAlertes }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const heure = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Africa/Tunis' }).format(now);
  const jour = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Tunis' }).format(now);
  const critiques = (nbAlertes || 0) + (enInstance?.demandes || 0) + (enInstance?.arrets || 0);
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <div className="day-pill" title="Heure locale du siège (fuseau Afrique/Tunis — GMT+1)">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--dp-gold)" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
        <div className="leading-tight">
          <p className="clock-value text-[13px]">{heure}</p>
          <p className="text-[9.5px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--dp-text-3)' }}>Tunis · {jour}</p>
        </div>
      </div>
      <div className="day-pill" title="Widget contextuel — à brancher sur l'API météo d'entreprise">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--dp-amber)" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4l1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4l1.4-1.4" /></svg>
        <div className="leading-tight">
          <p className="clock-value text-[13px]">31 °C</p>
          <p className="text-[9.5px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--dp-text-3)' }}>Ciel dégagé</p>
        </div>
      </div>
      <button type="button" className="day-pill" onClick={onOpenAlertes} title="Alertes critiques du jour — ouvrir le panneau">
        <span className="live-dot" style={{ background: critiques ? 'var(--dp-rose)' : 'var(--dp-emerald)', boxShadow: `0 0 10px ${critiques ? 'rgba(244,63,94,.9)' : 'rgba(16,185,129,.9)'}` }} />
        <div className="text-start leading-tight">
          <p className="clock-value text-[13px]" style={{ color: critiques ? '#E11D48' : '#10b981' }}>{critiques}</p>
          <p className="text-[9.5px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--dp-text-3)' }}>Alertes du jour</p>
        </div>
      </button>
    </div>
  );
}

// ---- Ligne de légende de donut ----
function DonutLegendRow({ d, onPick }) {
  return (
    <button
      type="button"
      onClick={() => onPick?.(d)}
      className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-start transition-all duration-200"
      style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(148,163,199,0.09)' }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(227,185,77,0.4)'; e.currentTarget.style.background = 'rgba(227,185,77,0.05)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(148,163,199,0.09)'; e.currentTarget.style.background = 'rgba(255,255,255,0.025)'; }}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.color, boxShadow: `0 0 8px ${d.color}99` }} />
        <span className="truncate text-[12px] font-semibold" style={{ color: 'var(--dp-text-2)' }}>{d.name}</span>
      </span>
      <span className="num shrink-0 text-[12px] font-bold" style={{ color: 'var(--dp-text)' }}>
        {new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(d.value).replace(/\u202f/g, '\u00a0')} j <span className="ms-1 text-[10.5px] font-semibold" style={{ color: 'var(--dp-text-3)' }}>{(Math.round(d.pct * 10) / 10).toLocaleString('fr-FR')} %</span>
      </span>
    </button>
  );
}

// ---- Carte « intention de recherche » active ----
function IntentChip({ it, onRemove }) {
  return (
    <span className="intent-chip">
      {it.text}
      <button type="button" onClick={() => onRemove(it)} aria-label={`Retirer le filtre ${it.text}`}>✕</button>
    </span>
  );
}

export default function Dashboard({ demo: demoProp = false }) {
  const DEMO = useMemo(() => {
    if (demoProp) return true;
    try { return new URLSearchParams(window.location.search).has('demo'); } catch { return false; }
  }, [demoProp]);

  const { user } = useAuth();
  const [preset, setPreset] = useState('annee');
  const [persoDebut, setPersoDebut] = useState(`${new Date().getFullYear()}-01-01`);
  const [persoFin, setPersoFin] = useState(`${new Date().getFullYear()}-12-31`);
  const [employeId, setEmployeId] = useState('');
  const [matricule, setMatricule] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0); // rejoue l'animation de swap à chaque chargement
  const [employesList, setEmployesList] = useState([]);
  const [recherche, setRecherche] = useState('');
  const [situation, setSituation] = useState(null); // { id, text }
  const [intentions, setIntentions] = useState([]);
  const [employesReady, setEmployesReady] = useState(false);
  const [photoErr, setPhotoErr] = useState(false);
  const [photosErreur, setPhotosErreur] = useState(() => new Set());
  const [filtresOuverts, setFiltresOuverts] = useState(false);
  const [categoriesList, setCategoriesList] = useState([]);
  const [categorieId, setCategorieId] = useState('');
  const [departement, setDepartement] = useState('');
  const [alea, setAlea] = useState(0);
  const [drawer, setDrawer] = useState(null);
  const [zoomCombo, setZoomCombo] = useState(false);
  const premierRendu = useRef(true);

  useEffect(() => {
    if (DEMO) {
      setEmployesList(demoEmployesList());
      setCategoriesList(demoCategories());
      setEmployesReady(true);
      return undefined;
    }
    api.employes().then((l) => { setEmployesList(l); setEmployesReady(true); }).catch(() => { setEmployesReady(true); });
    api.categories().then(setCategoriesList).catch(() => {});
    return undefined;
  }, [DEMO]);

  // Synchronisation temps réel : 'rh:donnees-change' rafraîchit listes et audit.
  useEffect(() => {
    if (DEMO) return undefined;
    const socket = getSocket();
    if (!socket) return undefined;
    const synchroniser = () => {
      api.employes().then((l) => { setEmployesList(l); setEmployesReady(true); }).catch(() => {});
      api.categories().then(setCategoriesList).catch(() => {});
      setAlea((a) => a + 1);
    };
    socket.on('rh:donnees-change', synchroniser);
    return () => { socket.off('rh:donnees-change', synchroniser); };
  }, [DEMO]);

  const filtreEmployeId = employeId ? Number(employeId) : null;

  const employeFiltre = useMemo(() => {
    if (filtreEmployeId) return employesList.find((e) => e.id === filtreEmployeId) || null;
    const m = matricule.trim();
    if (!m) return null;
    const n = Number(m);
    return employesList.find((e) => e.matricule === m || (!Number.isNaN(n) && Number(e.matricule) === n)) || null;
  }, [filtreEmployeId, matricule, employesList]);

  useEffect(() => { setPhotoErr(false); }, [employeFiltre && (employeFiltre.id || employeFiltre.matricule)]);

  const marquerPhotoErreur = (mat) => {
    setPhotosErreur((prev) => {
      if (prev.has(mat)) return prev;
      const s = new Set(prev);
      s.add(mat);
      return s;
    });
  };

  const matriculeIntrouvable = employesReady && !!matricule.trim() && !filtreEmployeId && !employeFiltre;

  const showCalendrier = (preset === 'mois' || preset === 'mois_dernier' || preset === 'perso') && !!employeFiltre && !!data && !!data.calendrier && data.calendrier.length > 0;

  const periode = useMemo(() => {
    if (preset === 'perso') return { debut: persoDebut, fin: persoFin };
    return periodePreset(preset) || { debut: persoDebut, fin: persoFin };
  }, [preset, persoDebut, persoFin]);

  const auditParams = useMemo(() => {
    if (matriculeIntrouvable) return null;
    return {
      debut: periode.debut,
      fin: periode.fin,
      categorie_id: categorieId ? Number(categorieId) : undefined,
      departement: departement || undefined,
      employe_id: filtreEmployeId || undefined,
      matricule: filtreEmployeId ? undefined : (employeFiltre ? employeFiltre.matricule : undefined),
      alea: alea || undefined,
    };
  }, [periode, categorieId, departement, filtreEmployeId, employeFiltre, matriculeIntrouvable, alea]);

  // Chargement des données — en démo, latence artificielle courte pour que le
  // fondu des anciennes données vers les nouvelles soit perceptible (pas de rechargement de page).
  useEffect(() => {
    if (!auditParams) { setData(null); setError(''); setLoading(false); return undefined; }
    if (DEMO) {
      setLoading(true);
      const t = setTimeout(() => {
        setData(demoDashboardPayload(periode));
        setError('');
        setLoading(false);
        setVersion((v) => v + 1);
      }, premierRendu.current ? 40 : 430);
      premierRendu.current = false;
      return () => clearTimeout(t);
    }
    setLoading(true);
    setError('');
    api.dashboardAudit(auditParams)
      .then((d) => { setData(d); setVersion((v) => v + 1); })
      .catch((e) => { setData(null); setError(e.message); })
      .finally(() => setLoading(false));
    return undefined;
  }, [auditParams, DEMO, periode]);

  // ---- Séries dérivées pour les graphiques ----
  const barData = useMemo(() => (data?.series || []).map((s) => ({
    label: s.label,
    'Heures légales': s.legal_heures,
    'Heures travaillées': s.travaille_heures,
    pct: s.presence_pct,
  })), [data]);

  const STACK_COLORS = {
    Présence: '#00E676',
    'Congé légal': '#2979FF',
    Maladie: '#FF4455',
    Absence: '#FFB300',
  };

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

  const donutData = useMemo(() => {
    const k = data?.kpis;
    if (!k) return [];
    const tot = k.jours_presence + k.jours_conge + k.jours_maladie + k.jours_absence;
    return [
      { name: 'Présence', value: k.jours_presence, color: STACK_COLORS['Présence'] },
      { name: 'Congé légal', value: k.jours_conge, color: STACK_COLORS['Congé légal'] },
      { name: 'Maladie', value: k.jours_maladie, color: STACK_COLORS.Maladie },
      { name: 'Absence', value: k.jours_absence, color: STACK_COLORS.Absence },
    ].filter((d) => d.value > 0).map((d) => ({ ...d, pct: tot > 0 ? Math.round((d.value / tot) * 1000) / 10 : 0 }));
  }, [data]);

  const retardData = useMemo(() => (data?.series || []).map((s) => ({
    label: s.label,
    'Jours en retard': s.retards,
    'Sorties anticipées': s.departs_anticipe || 0,
    minutes: Math.round((s.retard_secondes || 0) / 60),
  })), [data]);

  const topRetards = useMemo(() => (data?.employes || [])
    .filter((e) => (e.retard_secondes || 0) > 0)
    .sort((a, b) => (b.retard_secondes || 0) - (a.retard_secondes || 0))
    .slice(0, 8), [data]);
  const maxRetardsSec = topRetards.length ? topRetards[0].retard_secondes : 1;

  // Carte d'appartenance employé → département (source : liste Employés, sync temps réel)
  const deptParId = useMemo(() => new Map((employesList || []).map((e) => [String(e.id), (e.departement || '').trim()])), [employesList]);

  // Heatmap départements × situations (agrégat des lignes employés de la période)
  const heatRows = useMemo(() => {
    const list = data?.employes || [];
    if (!list.length) return [];
    const avecDept = list.filter((e) => deptParId.get(String(e.id)));
    const source = avecDept.length >= list.length * 0.5 ? avecDept : list;
    const keyOf = avecDept.length >= list.length * 0.5 ? (e) => deptParId.get(String(e.id)) : (e) => e.categorie || '—';
    const map = new Map();
    for (const e of source) {
      const d = keyOf(e) || '—';
      if (!map.has(d)) map.set(d, { key: d, label: d, nb: 0, presents: 0, conge: 0, maladie: 0, absence: 0, retards: 0, ouvrables: 0, heures: 0 });
      const r = map.get(d);
      r.nb += 1;
      r.presents += Number(e.jours_presents) || 0;
      r.conge += Number(e.jours_conge) || 0;
      r.maladie += Number(e.jours_maladie) || 0;
      r.absence += Number(e.jours_absence) || 0;
      r.retards += Number(e.retards) || 0;
      r.ouvrables += Number(e.jours_ouvrables) || 0;
      r.heures += Number(e.travaille_heures) || 0;
    }
    return [...map.values()].sort((a, b) => b.presents - a.presents);
  }, [data, deptParId]);

  const k = data?.kpis;

  // Recherche tableau + intention de situation
  const employesFiltres = useMemo(() => {
    let list = data?.employes || [];
    const q = recherche.trim().toLowerCase();
    if (q) {
      list = list.filter((e) => `${e.matricule} ${e.nom} ${e.prenom} ${e.categorie}`.toLowerCase().includes(q));
    }
    if (situation?.id === 'conge') list = list.filter((e) => (e.jours_conge || 0) > 0);
    if (situation?.id === 'retard') list = list.filter((e) => (e.retards || 0) > 0);
    if (situation?.id === 'maladie') list = list.filter((e) => (e.jours_maladie || 0) > 0);
    if (situation?.id === 'absence') list = list.filter((e) => (e.jours_absence || 0) > 0);
    if (situation?.id === 'present') list = list.filter((e) => (e.presence_pct ?? 0) >= 100);
    if (situation?.id === 'solde') list = list.filter((e) => (e.solde_conge ?? 0) < 5);
    return list;
  }, [data, recherche, situation]);

  const departementsList = useMemo(() => {
    const s = new Set((employesList || []).map((e) => (e.departement || '').trim()).filter(Boolean));
    return [...s].sort((a, b) => a.localeCompare(b, 'fr'));
  }, [employesList]);

  const employesParDepartement = useMemo(() => {
    const d = departement.trim().toLowerCase();
    if (!d) return employesList;
    return (employesList || []).filter((e) => ((e.departement || '').trim()).toLowerCase() === d);
  }, [employesList, departement]);

  const soldeRestantEmploye = useMemo(() => {
    if (!employeFiltre) return null;
    const detail = (data?.employes || []).find((e) => String(e.id) === String(employeFiltre.id));
    if (detail?.solde_conge_periode !== undefined && detail?.solde_conge_periode !== null) return detail.solde_conge_periode;
    if (detail?.solde_conge !== undefined && detail?.solde_conge !== null) return detail.solde_conge;
    return employeFiltre.solde;
  }, [employeFiltre, data]);

  // ---- Recherche sémantique : application des intentions ----
  const appliquerIntention = (intent) => {
    if (intent.categorieId !== undefined) { setCategorieId(intent.categorieId); setEmployeId(''); setMatricule(''); }
    if (intent.departement !== undefined) { setDepartement(intent.departement); setEmployeId(''); setMatricule(''); }
    if (intent.employeId !== undefined) { setEmployeId(intent.employeId); setMatricule(''); }
    if (intent.situation !== undefined) setSituation({ id: intent.situation, text: intent.text });
    if (intent.texte !== undefined) setRecherche(intent.texte);
    setIntentions((prev) => [{ ...intent, id: `${Date.now()}` }, ...prev.filter((p) => p.text !== intent.text)].slice(0, 6));
  };
  const retirerIntention = (it) => {
    if (it.categorieId !== undefined) setCategorieId('');
    if (it.departement !== undefined) setDepartement('');
    if (it.employeId !== undefined) setEmployeId('');
    if (it.situation !== undefined) setSituation(null);
    if (it.texte !== undefined) setRecherche('');
    setIntentions((prev) => prev.filter((p) => p.id !== it.id));
  };

  const reinitialiser = () => {
    setPreset('annee'); setCategorieId(''); setDepartement(''); setEmployeId(''); setMatricule('');
    setRecherche(''); setSituation(null); setIntentions([]);
  };

  // ---- Contenu du tiroir contextuel droit ----
  const drawerView = useMemo(() => {
    if (!drawer || !data) return null;
    const emps = data.employes || [];
    const listRow = (e, val, color = 'var(--dp-gold)') => ({ e, val, color });
    const topBy = (key, n = 8) => [...emps].sort((a, b) => (b[key] || 0) - (a[key] || 0)).slice(0, n);
    if (drawer.type === 'employe') {
      const e = emps.find((x) => String(x.id) === String(drawer.id)) || employeFiltre;
      if (!e) return null;
      return {
        badge: `Matricule ${e.matricule}`,
        title: `${e.nom} ${e.prenom}`,
        subtitle: `${e.categorie || ''} · ${deptParId.get(String(e.id)) || '—'}`,
        body: (
          <EmployeeDetail e={e} data={data} deptParId={deptParId}>
            <Link to={`/employes/${e.id}`} className="btn btn-cobalt w-full">Ouvrir la fiche complète →</Link>
          </EmployeeDetail>
        ),
      };
    }
    if (drawer.type === 'kpi') {
      const cfg = {
        effectif: {
          title: 'Effectif concerné',
          value: `${fmtFr(data.kpis.effectif)} employé(s)`,
          sub: 'Répartition par département sur la période filtrée.',
          metric: 'nb',
          rows: heatRows.map((r) => listRow({ nom: r.label, prenom: '', matricule: `${r.nb} pers.` }, r.nb, 'var(--dp-cobalt)')),
        },
        heures: {
          title: 'Heures travaillées',
          value: `${fmtFr(data.kpis.heures_travaillees, 2)} h`,
          sub: `sur ${fmtFr(data.kpis.heures_legales, 2)} h légales (${fmtPct(data.kpis.presence_pct)}).`,
          rows: topBy('travaille_heures').map((e) => listRow(e, e.travaille_heures, 'var(--dp-gold)')),
        },
        presence: {
          title: 'Taux de présence',
          value: fmtPct(data.kpis.presence_pct),
          sub: 'Heures travaillées / heures légales, tous pointages confondus.',
          rows: topBy('presence_pct').map((e) => listRow(e, e.presence_pct, 'var(--dp-emerald)')),
        },
        presents: {
          title: 'Jours présents',
          value: `${fmtFr(data.kpis.jours_presents)} j`,
          sub: `${fmtPct(data.kpis.jours_presents_pct)} des ${fmtFr(data.kpis.jours_ouvrables)} jours ouvrables.`,
          rows: topBy('jours_presents').map((e) => listRow(e, e.jours_presents, 'var(--dp-emerald)')),
        },
        absence: {
          title: "Jours d'absence",
          value: `${fmtFr(data.kpis.jours_absence)} j`,
          sub: 'Journées sans badge ni couverture (congé/maladie).',
          rows: topBy('jours_absence').map((e) => listRow(e, e.jours_absence, 'var(--dp-rose)')),
        },
        conges: {
          title: 'Congés sur période',
          value: `${fmtFr(data.kpis.jours_conge, 1)} j`,
          sub: `dont ${fmtFr(data.kpis.jours_conge_demi, 1)} j en demi-journées (codes CA/DJ du journal RMA).`,
          rows: topBy('jours_conge').map((e) => listRow(e, e.jours_conge, 'var(--dp-cobalt)')),
        },
        solde: {
          title: 'Solde congé restant',
          value: `${fmtFr(soldeRestantEmploye ?? 0, 1)} j`,
          sub: 'Solde initial + ajouts − prélèvements RMA sur la période.',
          rows: topBy('solde_conge').map((e) => listRow(e, e.solde_conge, 'var(--dp-amber)')),
        },
      }[drawer.key];
      if (!cfg) return null;
      const max = Math.max(...cfg.rows.map((r) => Number(r.val) || 0), 1);
      return {
        badge: 'DÉTAIL CONTEXTUEL',
        title: cfg.title,
        subtitle: cfg.sub,
        big: cfg.value,
        body: (
          <div className="space-y-2.5">
            {cfg.rows.map(({ e, val }, i) => (
              <div key={`${e.nom}-${i}`} className="rise rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(148,163,199,0.09)', '--d': `${i * 40}ms` }}>
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-[12.5px] font-bold" style={{ color: 'var(--dp-text)' }}>{e.nom}{e.prenom ? ` ${e.prenom}` : ''}</span>
                    <span className="num block text-[10px]" style={{ color: 'var(--dp-text-3)' }}>Mat. {e.matricule}</span>
                  </span>
                  <span className="num shrink-0 text-[13px] font-extrabold" style={{ color: drawer.key === 'presence' ? 'var(--dp-emerald)' : 'var(--dp-gold)' }}>
                    {typeof val === 'number' ? (drawer.key === 'presence' ? `${Math.round(val)} %` : fmtJours(val)) : val}
                  </span>
                </div>
                <div className="minibar mt-2"><i style={{ width: `${Math.min(100, ((Number(val) || 0) / max) * 100)}%`, background: `linear-gradient(90deg, ${cfg.rows[0]?.color || 'var(--dp-gold)'}, transparent)`, boxShadow: `0 0 10px ${cfg.rows[0]?.color || 'var(--dp-gold)'}` }} /></div>
              </div>
            ))}
            <p className="pt-1 text-center text-[10.5px]" style={{ color: 'var(--dp-text-3)' }}>Top 8 sur la période {fmtDate(data.periode.debut)} → {fmtDate(data.periode.fin)}</p>
          </div>
        ),
      };
    }
    if (drawer.type === 'situation') {
      const field = { Présence: 'jours_presents', 'Congé légal': 'jours_conge', Maladie: 'jours_maladie', Absence: 'jours_absence' }[drawer.name];
      const rows = topBy(field).filter((e) => (e[field] || 0) > 0);
      const max = Math.max(...rows.map((e) => e[field]), 1);
      return {
        badge: 'RÉPARTITION GLOBALE',
        title: drawer.name,
        subtitle: 'Employés les plus concernés sur la période filtrée.',
        body: (
          <div className="space-y-2.5">
            {rows.length === 0 && <p className="py-6 text-center text-sm" style={{ color: 'var(--dp-text-3)' }}>Aucun détail disponible.</p>}
            {rows.map((e, i) => (
              <div key={e.id} className="rise rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(148,163,199,0.09)', '--d': `${i * 40}ms` }}>
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-[12.5px] font-bold" style={{ color: 'var(--dp-text)' }}>{e.nom} {e.prenom}</span>
                    <span className="num block text-[10px]" style={{ color: 'var(--dp-text-3)' }}>Mat. {e.matricule} · {e.categorie}</span>
                  </span>
                  <span className="num shrink-0 text-[13px] font-extrabold" style={{ color: 'var(--dp-text)' }}>{fmtJours(e[field])} j</span>
                </div>
                <div className="minibar mt-2"><i style={{ width: `${(e[field] / max) * 100}%`, background: 'linear-gradient(90deg, var(--dp-gold), rgba(227,185,77,0.15))' }} /></div>
              </div>
            ))}
          </div>
        ),
      };
    }
    if (drawer.type === 'departement') {
      const rows = emps.filter((e) => (deptParId.get(String(e.id)) || e.categorie) === drawer.row.label);
      return {
        badge: 'DÉPARTEMENT',
        title: drawer.row.label,
        subtitle: `${drawer.row.nb} employé(s) · ${Math.round(drawer.row.heures)} h cumulées sur la période.`,
        body: (
          <div className="space-y-2.5">
            {rows.slice(0, 14).map((e, i) => (
              <button
                key={e.id}
                type="button"
                className="rise flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-start"
                style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(148,163,199,0.09)', '--d': `${i * 30}ms` }}
                onClick={() => setDrawer({ type: 'employe', id: e.id })}
              >
                <span className="min-w-0">
                  <span className="block truncate text-[12.5px] font-bold" style={{ color: 'var(--dp-text)' }}>{e.nom} {e.prenom}</span>
                  <span className="num block text-[10px]" style={{ color: 'var(--dp-text-3)' }}>Mat. {e.matricule} · {fmtJours(e.travaille_heures)} h</span>
                </span>
                <span className={`chip ${cartePresence(e.presence_pct).cls}`}>{fmtPct(e.presence_pct)}</span>
              </button>
            ))}
          </div>
        ),
      };
    }
    if (drawer.type === 'alertes') {
      return {
        badge: 'CRITIQUE DU JOUR',
        title: 'Alertes & files d’attente',
        subtitle: 'Tout ce qui requiert une décision aujourd’hui.',
        body: (
          <div className="space-y-4">
            <section>
              <p className="eyebrow mb-2">Soldes à risque ({(data.alertes || []).length})</p>
              <div className="space-y-2">
                {(data.alertes || []).map((e, i) => {
                  const det = data.employes.find((x) => x.id === e.id);
                  const solde = det ? det.solde_conge : 0;
                  return (
                    <button key={e.id} type="button" onClick={() => setDrawer({ type: 'employe', id: e.id })} className="w-full rounded-xl px-3 py-2.5 text-start" style={{ background: 'rgba(251,113,133,0.06)', border: '1px solid rgba(251,113,133,0.25)' }}>
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-[12.5px] font-bold" style={{ color: 'var(--dp-text)' }}>{e.nom} {e.prenom}</span>
                        <span className="num text-[12px] font-extrabold" style={{ color: solde < 0 ? '#E11D48' : 'var(--dp-amber)' }}>{solde < 0 ? `${fmtJours(solde)} j` : `${fmtJours(solde)} j restants`}</span>
                      </span>
                      <span className="num mt-0.5 block text-[10px]" style={{ color: 'var(--dp-text-3)' }}>Mat. {e.matricule} · {e.categorie}</span>
                    </button>
                  );
                })}
              </div>
            </section>
            <section>
              <p className="eyebrow mb-2">Flux d'activité récent</p>
              <div>
                <p className="tl-item" style={{ '--tl-color': 'var(--dp-cobalt)', '--tl-glow': 'rgba(59,130,246,.6)' }}>
                  <span className="block text-[12px] font-semibold" style={{ color: 'var(--dp-text)' }}>{data.kpis.en_instance.demandes} demandes de congé en instance</span>
                  <span className="block text-[10.5px]" style={{ color: 'var(--dp-text-3)' }}>À instruire par la commission</span>
                </p>
                <p className="tl-item" style={{ '--tl-color': 'var(--dp-rose)', '--tl-glow': 'rgba(244,63,94,.6)' }}>
                  <span className="block text-[12px] font-semibold" style={{ color: 'var(--dp-text)' }}>{data.kpis.en_instance.arrets} arrêts maladie en instance</span>
                  <span className="block text-[10.5px]" style={{ color: 'var(--dp-text-3)' }}>Justificatifs à valider sous 48 h</span>
                </p>
                <p className="tl-item" style={{ '--tl-color': 'var(--dp-amber)', '--tl-glow': 'rgba(245,158,11,.6)' }}>
                  <span className="block text-[12px] font-semibold" style={{ color: 'var(--dp-text)' }}>{k?.retards || 0} journées de retard cumulées</span>
                  <span className="block text-[10.5px]" style={{ color: 'var(--dp-text-3)' }}>Total {fmtDur(k?.retard_secondes)} sur la période</span>
                </p>
                <p className="tl-item" style={{ '--tl-color': 'var(--dp-emerald)', '--tl-glow': 'rgba(52,211,153,.6)' }}>
                  <span className="block text-[12px] font-semibold" style={{ color: 'var(--dp-text)' }}>{fmtFr(k?.pointages_uniques || 0)} pointages uniques synchronisés</span>
                  <span className="block text-[10.5px]" style={{ color: 'var(--dp-text-3)' }}>Bornes biométriques Xmator-Eye</span>
                </p>
              </div>
            </section>
          </div>
        ),
      };
    }
    return null;
  }, [drawer, data, employeFiltre, deptParId, heatRows, soldeRestantEmploye]);

  // ---- KPI widgets ----
  const sparkPres = (data?.series || []).map((s) => s.presence_pct);
  const sparkHeures = (data?.series || []).map((s) => s.travaille_heures);
  const sparkConges = (data?.series || []).map((s) => s.jours_conge);
  const sparkAbs = (data?.series || []).map((s) => s.jours_absence);
  const sparkPresents = (data?.series || []).map((s) => s.jours_presence);

  const kpis = k ? [
    {
      id: 'effectif',
      title: 'Effectif concerné',
      valueEl: <AnimatedNumber value={k.effectif} />,
      sub: 'employés actifs filtrés sur la période',
      icon: <IconUsers />,
      glow: 'rgba(59,130,246,0.6)',
      color: '#3B82F6',
      chip: { cls: 'chip--cobalt', label: `${k.en_instance.demandes + k.en_instance.arrets} en instance` },
    },
    {
      id: 'heures',
      title: 'Heures travaillées',
      valueEl: <AnimatedNumber value={k.heures_travaillees} decimals={2} unit="h" />,
      sub: `sur ${fmtFr(k.heures_legales, 2)} h légales`,
      icon: <IconClock />,
      glow: 'rgba(217,168,63,0.55)',
      color: '#D9A83F',
      spark: sparkHeures,
    },
    {
      id: 'presence',
      title: 'Taux de présence',
      valueEl: <AnimatedNumber value={k.presence_pct} unit="%" />,
      sub: 'heures travaillées / heures légales',
      icon: <IconTrendUp />,
      glow: 'rgba(16,185,129,0.6)',
      color: '#10b981',
      chip: cartePresence(k.presence_pct),
      spark: sparkPres,
    },
    {
      id: 'presents',
      title: 'Jours présents',
      valueEl: <AnimatedNumber value={k.jours_presents} unit="j" />,
      sub: `${fmtPct(k.jours_presents_pct)} des ${fmtFr(k.jours_ouvrables)} j ouvrables`,
      icon: <IconCalendarCheck />,
      glow: 'rgba(20,184,166,0.55)',
      color: '#14B8A6',
      spark: sparkPresents,
    },
    {
      id: 'absence',
      title: "Jours d'absence",
      valueEl: <AnimatedNumber value={k.jours_absence} unit="j" />,
      sub: `${fmtPct(k.jours_absence_pct)} des jours légaux`,
      icon: <IconAlert />,
      glow: 'rgba(244,63,94,0.55)',
      color: '#F43F5E',
      chip: { cls: 'chip--amber', label: `${(data.alertes || []).length} alertes solde` },
      spark: sparkAbs,
    },
    {
      id: 'conges',
      title: 'Congés sur période',
      valueEl: <AnimatedNumber value={k.jours_conge} decimals={1} unit="j" />,
      sub: `${fmtJours(k.jours_conge_demi)} j en demi-journée · ${fmtFr(k.jours_ouvrables)} j ouvrables`,
      icon: <IconCalendarCheck />,
      glow: 'rgba(96,165,250,0.55)',
      color: '#60A5FA',
      chip: { cls: 'chip--emerald', label: `${fmtPct(data.barometres.conge)} des ouvrables` },
      spark: sparkConges,
    },
    ...(employeFiltre ? [{
      id: 'solde',
      title: 'Solde congé restant',
      valueEl: <AnimatedNumber value={soldeRestantEmploye ?? 0} decimals={1} unit="j" />,
      sub: `${employeFiltre.nom} ${employeFiltre.prenom} · Mat. ${employeFiltre.matricule} — soldes & prélèvements RMA sur la période`,
      icon: <IconCalendarCheck />,
      glow: 'rgba(16,185,129,0.6)',
      color: '#10b981',
      chip: (soldeRestantEmploye ?? 0) < 0
        ? { cls: 'chip--rose', label: 'Solde négatif' }
        : (soldeRestantEmploye ?? 0) < 5
          ? { cls: 'chip--amber', label: 'Faible solde' }
          : { cls: 'chip--emerald', label: 'Disponible' },
    }] : []),
  ] : [];

  // ============================================================================
  return (
    <div data-theme="premium-light" className="relative -mx-3 -mt-4 -mb-6 px-3 pb-8 pt-4 sm:-mx-6 sm:px-6 min-h-full" style={{ background: 'var(--bg-app-gradient)', backgroundColor: 'var(--dp-ink)' }}>
      {/* ============================ BANDEAU COCKPIT ============================ */}
      <div className="rise relative z-[60] flex flex-wrap items-start justify-between gap-4 pb-5 pt-1" style={{ animationDelay: '30ms' }}>
        <div className="min-w-0">
          <p className="eyebrow flex items-center gap-2">Xmator RH · Poste de pilotage <span className="live-dot" /></p>
          <h1 className="mt-1.5 text-[26px] font-black leading-none tracking-tight gold-text sm:text-[30px]" style={{ fontFamily: 'var(--font-sans)', letterSpacing: '-0.03em' }}>
            Tableau de bord
          </h1>
          <p className="num mt-2 text-[11px] font-semibold" style={{ color: 'var(--dp-text-3)' }}>
            Période pilotée : {fmtDate(periode.debut)} → {fmtDate(periode.fin)}
            {(departement || categorieId || employeId || matricule) && <span style={{ color: 'var(--dp-gold)' }}> · {departement || ''}{departement && categorieId ? ' · ' : ''}{(categoriesList.find((c) => String(c.id) === categorieId) || {}).libelle || ''}</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <ApercuJournee
            nbAlertes={(data?.alertes || []).length}
            enInstance={k?.en_instance}
            onOpenAlertes={() => setDrawer({ type: 'alertes' })}
          />
          {DEMO && <AvatarMenu user={{ nom: 'Amale', prenom: 'Trabelsi', login: 'a.trabelsi', role: 'super_admin' }} onLogout={() => { window.location.href = '/login'; }} links={false} />}
        </div>
      </div>
      <div className="divider-gold" />

      {/* ============================ GRILLE PRINCIPALE ============================ */}
      <div className="relative z-10 mt-5 grid grid-cols-1 items-start gap-5 xl:grid-cols-[302px_minmax(0,1fr)]">
        {/* ------------------------- Panneau de filtres ------------------------- */}
        <aside className="rise xl:sticky xl:top-5" style={{ animationDelay: '80ms' }}>
          <div className="panel rule-gold p-4">
            <div className="flex items-center justify-between gap-2">
              <button type="button" className="flex min-w-0 items-center gap-2.5 text-start xl:pointer-events-none" onClick={() => setFiltresOuverts((v) => !v)}>
                <span className="kpi-icon" style={{ width: 34, height: 34, color: 'var(--dp-gold-bright)' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 5h16M7 12h10M10 19h4" /></svg>
                </span>
                <span>
                  <span className="block text-[12.5px] font-extrabold tracking-wide" style={{ color: 'var(--dp-text)' }}>Filtres d'audit</span>
                  <span className="block text-[10px] uppercase tracking-[0.14em]" style={{ color: 'var(--dp-text-3)' }}>Appliqués à tout le cockpit</span>
                </span>
              </button>
              <div className="flex items-center gap-1.5">
                {(departement || categorieId || employeId || matricule || situation || recherche) && (
                  <button type="button" onClick={reinitialiser} className="chip chip--neutral hover:!text-[var(--dp-gold-bright)]" title="Réinitialiser tous les filtres">Réinitialiser ✕</button>
                )}
                <svg className={`shrink-0 text-slate-400 transition-transform xl:hidden ${filtresOuverts ? 'rotate-180' : ''}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: 'var(--dp-text-3)' }}><path d="M6 9l6 6 6-6" /></svg>
              </div>
            </div>

            <div className={`mt-4 space-y-4 ${filtresOuverts ? 'block' : 'hidden'} xl:block`}>
              <div>
                <div className="field-label">Recherche intelligente</div>
                <SearchSema ctx={{ categoriesList, departementsList, employesList }} onApply={appliquerIntention} />
                {intentions.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {intentions.map((it) => <IntentChip key={it.id} it={it} onRemove={retirerIntention} />)}
                  </div>
                )}
              </div>

              <div>
                <div className="field-label">Période <span style={{ color: 'var(--dp-text-3)', letterSpacing: 0, textTransform: 'none', fontWeight: 600 }}>sans rechargement</span></div>
                <SegmentedControl
                  value={preset}
                  onChange={setPreset}
                  options={[
                    { id: 'annee', label: 'Année', title: 'Année en cours' },
                    { id: 'annee_prec', label: 'N−1', title: 'Année précédente' },
                    { id: 'mois', label: 'Mois', title: 'Mois de travail en cours (21→20)' },
                    { id: 'mois_dernier', label: 'M−1', title: 'Dernier mois de travail' },
                    { id: '12m', label: '12 m', title: '12 derniers mois' },
                    { id: 'perso', label: 'Perso', title: 'Période personnalisée' },
                  ]}
                />
                {preset === 'perso' && (
                  <div className="mt-2.5 grid grid-cols-2 gap-2 rise">
                    <label>
                      <span className="mb-1 block text-[9.5px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--dp-text-3)' }}>Du</span>
                      <input type="date" className="input num text-[12px]" value={persoDebut} onChange={(e) => setPersoDebut(e.target.value)} />
                    </label>
                    <label>
                      <span className="mb-1 block text-[9.5px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--dp-text-3)' }}>Au</span>
                      <input type="date" className="input num text-[12px]" value={persoFin} onChange={(e) => setPersoFin(e.target.value)} />
                    </label>
                  </div>
                )}
              </div>

              <div>
                <div className="field-label">Département</div>
                <select
                  className="input"
                  value={departement}
                  onChange={(e) => { setDepartement(e.target.value); setEmployeId(''); setMatricule(''); }}
                >
                  <option value="">Tous les départements</option>
                  {departementsList.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <div className="field-label">Catégorie</div>
                  <select
                    className="input"
                    value={categorieId}
                    onChange={(e) => { setCategorieId(e.target.value); setEmployeId(''); setMatricule(''); }}
                  >
                    <option value="">Toutes</option>
                    {categoriesList.map((c) => <option key={c.id} value={c.id}>{c.libelle}</option>)}
                  </select>
                </div>
                <div>
                  <div className="field-label">Matricule</div>
                  <input
                    className="input num"
                    style={{ fontSize: 12.5 }}
                    placeholder="ex : 35"
                    value={matricule}
                    onChange={(e) => { setMatricule(e.target.value); if (e.target.value.trim()) setEmployeId(''); }}
                  />
                </div>
              </div>

              <div>
                <div className="field-label">Employé</div>
                <select className="input" value={employeId} onChange={(e) => { setEmployeId(e.target.value); if (e.target.value) setMatricule(''); }}>
                  <option value="">Tous les employés</option>
                  {employesParDepartement.map((e) => (
                    <option key={e.id} value={e.id}>{e.matricule} — {e.nom} {e.prenom}</option>
                  ))}
                </select>
              </div>

              {/* Carte employé résolu (ou synthèse) */}
              {employeFiltre ? (
                <div className="rise overflow-hidden rounded-2xl" style={{ border: '1px solid rgba(227,185,77,0.28)', background: 'linear-gradient(160deg, rgba(227,185,77,0.10), rgba(10,14,24,0.6) 55%)' }}>
                  <div className="flex items-center gap-3 p-3.5">
                    {photoErr ? (
                      <span className="avatar-mini" style={{ width: 52, height: 52, fontSize: 16 }}>
                        {(employeFiltre.nom || '?').charAt(0)}{(employeFiltre.prenom || '').charAt(0)}
                      </span>
                    ) : (
                      <span className="avatar-mini overflow-hidden" style={{ width: 52, height: 52 }}>
                        <img src={mediaSrc(employeFiltre.photo_url || `/photos/${employeFiltre.matricule}.webp`)} alt="" className="h-full w-full object-cover" onError={() => setPhotoErr(true)} style={{ borderRadius: 999 }} />
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-extrabold" style={{ color: 'var(--dp-text)' }}>{employeFiltre.nom} {employeFiltre.prenom}</p>
                      <p className="num text-[10.5px]" style={{ color: 'var(--dp-gold)' }}>Mat. {employeFiltre.matricule} · {employeFiltre.departement || '—'}</p>
                    </div>
                  </div>
                  <div className="space-y-1.5 px-3.5 pb-3.5 pt-1">
                    {[
                      ['Intitulé', employeFiltre.intitule_poste],
                      ['Rub. / Gr. / Cl. / Éch.', [employeFiltre.rubrique, employeFiltre.grade, employeFiltre.classe, employeFiltre.echelon].filter(Boolean).join(' / ')],
                      ['Embauche', employeFiltre.date_embauche ? fmtDate(employeFiltre.date_embauche) : null],
                      ['Téléphone', employeFiltre.gsm || employeFiltre.telephone],
                      ['Solde congé', `${fmtJours(employeFiltre.solde ?? 0)} j`],
                      ['Solde maladie', `${fmtJours(employeFiltre.solde_maladie ?? 0)} j`],
                    ].filter(([, v]) => v).map(([l, v]) => (
                      <p key={l} className="flex items-center justify-between gap-2 text-[11px]">
                        <span style={{ color: 'var(--dp-text-3)' }}>{l}</span>
                        <span className="num max-w-[58%] truncate font-bold" style={{ color: 'var(--dp-text)' }}>{v}</span>
                      </p>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between rounded-xl px-3.5 py-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--dp-hairline-soft)' }}>
                  <span className="text-[11.5px] font-semibold" style={{ color: 'var(--dp-text-2)' }}>Périmètre</span>
                  <span className="num text-[15px] font-extrabold" style={{ color: 'var(--dp-gold-bright)' }}>{k?.effectif ?? '—'} <span className="text-[10px] font-bold" style={{ color: 'var(--dp-text-3)' }}>employé(s)</span></span>
                </div>
              )}

              {matriculeIntrouvable && (
                <p className="rounded-xl px-3.5 py-2.5 text-[11.5px] font-semibold" style={{ background: 'rgba(251,113,133,0.1)', border: '1px solid rgba(251,113,133,0.35)', color: '#E11D48' }}>
                  Aucun employé ne correspond au matricule « {matricule.trim()} ».
                </p>
              )}
              <p className="num text-center text-[10px]" style={{ color: 'var(--dp-text-3)' }}>
                {data ? <>Données consolidées · {fmtDate(data.periode.debut)} → {fmtDate(data.periode.fin)}</> : '—'}
              </p>
            </div>
          </div>
        </aside>

        {/* ----------------------------- Contenu ----------------------------- */}
        <div className={`min-w-0 space-y-5 dp-darkfix ${loading && data ? 'data-switching' : ''}`}>
          <div key={version} className="data-swap-area space-y-5">
            {/* Squelette de premier chargement */}
            {loading && !data && !DEMO && (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="panel p-4"><div className="dp-skel h-9 w-9 rounded-xl" /><div className="dp-skel mt-4 h-3 w-24" /><div className="dp-skel mt-3 h-7 w-32" /><div className="dp-skel mt-3 h-3 w-40" /></div>
                ))}
              </div>
            )}
            {error && !data && (
              <div className="panel flex flex-col items-center gap-4 p-10 text-center" style={{ borderColor: 'rgba(251,113,133,0.4)' }}>
                <p className="text-sm" style={{ color: '#BE123C' }}>{error}</p>
                <button className="btn btn-gold" type="button" onClick={() => setAlea((a) => a + 1)}>Réessayer</button>
              </div>
            )}
            {!data && !loading && !error && (
              <p className="panel p-10 text-center text-sm" style={{ color: 'var(--dp-text-2)' }}>
                {matriculeIntrouvable ? 'Aucune donnée à afficher pour ce matricule.' : 'Aucune donnée à afficher.'}
              </p>
            )}

            {data && (
              <>
                {/* ===== Widgets KPI ===== */}
                <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">
                  {kpis.map((w, i) => (
                    <KpiWidget
                      key={w.id}
                      title={w.title}
                      valueEl={w.valueEl}
                      sub={w.sub}
                      icon={w.icon}
                      chip={w.chip}
                      glow={w.glow}
                      color={w.color}
                      spark={w.spark}
                      delay={i * 70}
                      onClick={() => setDrawer({ type: 'kpi', key: w.id })}
                    />
                  ))}
                </div>

                {/* ===== Calendrier de présence (filtre employé, période mensuelle) ===== */}
                {showCalendrier && (
                  <div className="rise">
                    <CalendarJour
                      debut={data.periode.debut}
                      fin={data.periode.fin}
                      jours={data.calendrier}
                      codes={data.codes || []}
                      nom={employeFiltre.nom}
                      prenom={employeFiltre.prenom}
                      matricule={employeFiltre.matricule}
                    />
                  </div>
                )}

                {/* ===== Donut + Baromètres radiaux + Heatmap ===== */}
                <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[1fr_1.15fr_1.35fr]">
                  {/* Donut */}
                  <div className="panel rule-gold rise p-5" style={{ '--d': '60ms' }}>
                    <PanelHead
                      title="Répartition globale"
                      sub="journées cumulées sur la période — survol & clic détaillent"
                      right={<span className="chip chip--gold">{fmtFr(donutData.reduce((s, d) => s + d.value, 0), 1)} j</span>}
                    />
                    {donutData.length === 0 ? (
                      <p className="py-8 text-center text-sm" style={{ color: 'var(--dp-text-3)' }}>Aucune donnée sur cette période.</p>
                    ) : (
                      <div className="flex flex-col items-center gap-4">
                        <DonutPro
                          data={donutData}
                          size={208}
                          onSelect={(s) => setDrawer({ type: 'situation', name: s.name })}
                        />
                        <div className="w-full space-y-1.5">
                          {donutData.map((d) => (
                            <DonutLegendRow key={d.name} d={d} onPick={() => setDrawer({ type: 'situation', name: d.name })} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Baromètres radiaux */}
                  <div className="panel rise p-5" style={{ '--d': '120ms' }} onClick={() => setDrawer({ type: 'kpi', key: 'presence' })}>
                    <PanelHead
                      title="Cockpit barométrique"
                      sub={`barème de conformité — ${k.journees_presence} journée(s) pointée(s)`}
                      right={<span className="chip chip--rose">{k.retards} retard(s) · {fmtDur(k.retard_secondes)}</span>}
                    />
                    <div className="grid grid-cols-2 items-center gap-x-2 gap-y-4 pt-1">
                      <RadialGauge pct={data.barometres.presence} label="Présence (heures)" sub={`${fmtHeures(k.heures_travaillees)} / ${fmtHeures(k.heures_legales)}`} color="#D9A83F" size={150} />
                      <RadialGauge pct={data.barometres.ponctualite} label="Ponctualité" sub={`${k.journees_presence - k.retards} / ${k.journees_presence} j sans retard`} color="#10b981" size={150} />
                      <div className="col-span-2 grid grid-cols-3 gap-2.5">
                        <RadialGauge mini pct={data.barometres.jours_presence} label="Jours présents" color="#14B8A6" size={96} />
                        <RadialGauge mini pct={data.barometres.conge} label="Congés" color="#3B82F6" size={96} />
                        <RadialGauge mini pct={data.barometres.maladie} label="Maladie" color="#F43F5E" size={96} />
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-center gap-3 text-[10.5px]" style={{ color: 'var(--dp-text-3)' }}>
                      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: '#10b981' }} /> ≥ 100 %</span>
                      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: '#F59E0B' }} /> 90–99 %</span>
                      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: '#F43F5E' }} /> &lt; 90 %</span>
                    </div>
                  </div>

                  {/* Heatmap départements */}
                  <div className="panel rule-gold rise p-5" style={{ '--d': '180ms' }}>
                    <PanelHead
                      title="Intensité par département"
                      sub="heatmap — présence / congé / maladie / absence / retards (jours)"
                      right={<span className="chip chip--neutral">{heatRows.length} dept(s)</span>}
                    />
                    <PresenceHeatmap rows={heatRows} onSelectRow={(p) => { if (p?.row) setDrawer({ type: 'departement', row: p.row }); }} />
                  </div>
                </div>

                {/* ===== Combo heures (zoom au clic) + Courbe empilée ===== */}
                <div className={`grid grid-cols-1 items-stretch gap-4 ${zoomCombo ? 'xl:grid-cols-1' : 'xl:grid-cols-2'}`}>
                  <div
                    className={`panel glass--lift rise p-5 cursor-pointer ${zoomCombo ? 'ring-1 ring-[rgba(227,185,77,0.55)]' : ''}`}
                    style={{ '--d': '220ms', transition: 'all .4s cubic-bezier(.22,1,.36,1)' }}
                    onClick={() => setZoomCombo((v) => !v)}
                    title={zoomCombo ? 'Cliquer pour réduire' : 'Cliquer pour zoomer'}
                  >
                    <PanelHead
                      title="Heures légales vs travaillées"
                      sub={`${barData.length} période(s) · cumul mensuel (règle 21→20)`}
                      right={<span className="chip chip--gold"><AnimatedNumber value={k.heures_travaillees} decimals={2} unit="h" duration={900} /></span>}
                    />
                    <div style={{ height: zoomCombo ? 430 : 260, transition: 'height .45s cubic-bezier(.22,1,.36,1)' }}>
                      <HoursComboChart data={barData} height={zoomCombo ? 400 : 230} />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[10.5px]" style={{ color: 'var(--dp-text-2)' }}>
                      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'rgba(100,116,139,0.65)' }} /> Heures légales</span>
                      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--dp-gold)' }} /> Travaillées</span>
                      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: '#10b981' }} /> ≥ 100 %</span>
                      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: '#F59E0B' }} /> 90–99 %</span>
                      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: '#F43F5E' }} /> &lt; 90 %</span>
                      <span className="text-faint">· {zoomCombo ? 'cliquer pour réduire' : 'cliquer pour zoomer'}</span>
                    </div>
                  </div>

                  {!zoomCombo && (
                    <div className="panel rise p-5" style={{ '--d': '260ms' }}>
                      <PanelHead
                        title="Répartition du temps"
                        sub="100 % empilé — présence / congé / maladie / absence par période"
                        right={<span className="chip chip--emerald">100 %</span>}
                      />
                      <ResponsiveContainer width="100%" height={262}>
                        <AreaChart data={stackData} margin={{ top: 6, right: 6, left: -16, bottom: 0 }}>
                          <defs>
                            {Object.entries(STACK_COLORS).map(([name, color]) => (
                              <linearGradient key={name} id={`stack-${name}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={color} stopOpacity={1} />
                                <stop offset="100%" stopColor={color} stopOpacity={0.72} />
                              </linearGradient>
                            ))}
                          </defs>
                          <CartesianGrid strokeDasharray="3 4" stroke="rgba(148,163,199,0.16)" vertical={false} />
                          <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--dp-text-3)' }} tickLine={false} axisLine={{ stroke: 'rgba(148,163,199,0.26)' }} />
                          <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--dp-text-3)' }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                          <Tooltip
                            content={({ active, payload, label }) => {
                              if (!active || !payload?.length) return null;
                              return (
                                <div className="tip" style={{ position: 'relative' }}>
                                  <p className="tip-title">{label}</p>
                                  {payload.map((p) => (
                                    <div key={p.name} className="tip-row"><span>{p.name}</span><b style={{ color: p.color }}>{Math.min(100, Math.round(Number(p.value) * 10) / 10)} %</b></div>
                                  ))}
                                </div>
                              );
                            }}
                            cursor={{ stroke: 'rgba(217,168,63,0.55)', strokeDasharray: '3 3' }}
                          />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          {Object.entries(STACK_COLORS).map(([name, color]) => (
                            <Area key={name} type="monotone" dataKey={name} stackId="1" stroke={color} fill={`url(#stack-${name})`} strokeWidth={1.6} />
                          ))}
                        </AreaChart>
                      </ResponsiveContainer>
                      <p className="mt-1 text-center text-[10.5px]" style={{ color: 'var(--dp-text-3)' }}>
                        Part de chaque situation dans les journées de la période filtrée.
                      </p>
                    </div>
                  )}
                </div>

                {/* ===== Retards : escalier + Top 8 + Évaluation ===== */}
                <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[1.1fr_1fr_0.9fr]">
                  <div className="panel rise p-5" style={{ '--d': '300ms' }}>
                    <PanelHead
                      title="Retards & sorties anticipées"
                      sub="journées concernées par période"
                      right={<span className="chip chip--rose">{k.retards + k.departs_anticipe} événement(s)</span>}
                    />
                    <div className="max-h-[268px] overflow-y-auto pe-1">
                      <StairsStatsDiagram data={retardData} colors={{ retards: '#F59E0B', sorties: '#8B5CF6' }} />
                    </div>
                  </div>

                  <div className="panel rise p-5" style={{ '--d': '340ms' }}>
                    <PanelHead title="Top des employés en retard" sub="cumul décroissant du temps de retard" right={<Stars value={k.note_retards} label="Note retards globale" />} />
                    {topRetards.length === 0 ? (
                      <p className="py-10 text-center text-sm" style={{ color: 'var(--dp-text-3)' }}>Aucun retard sur cette période. ✨</p>
                    ) : (
                      <div className="space-y-2.5">
                        {topRetards.map((e, i) => (
                          <button
                            key={e.id}
                            type="button"
                            className="group flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-start transition-all"
                            style={{ background: i === 0 ? 'rgba(251,113,133,0.06)' : 'transparent' }}
                            onMouseEnter={(ev) => { ev.currentTarget.style.background = 'rgba(227,185,77,0.06)'; ev.currentTarget.style.transform = 'translateX(2px)'; }}
                            onMouseLeave={(ev) => { ev.currentTarget.style.background = i === 0 ? 'rgba(251,113,133,0.06)' : 'transparent'; ev.currentTarget.style.transform = 'none'; }}
                            onClick={() => setDrawer({ type: 'employe', id: e.id })}
                          >
                            <span className="num flex shrink-0 items-center justify-center rounded-lg text-[11px] font-black" style={{ width: 26, height: 26, background: i === 0 ? 'rgba(251,113,133,0.16)' : 'rgba(148,163,199,0.09)', color: i === 0 ? '#E11D48' : 'var(--dp-text-3)', border: i === 0 ? '1px solid rgba(251,113,133,0.4)' : '1px solid rgba(148,163,199,0.12)' }}>{i + 1}</span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center justify-between gap-2">
                                <span className="truncate text-[12.5px] font-bold group-hover:text-[var(--dp-gold-bright)]" style={{ color: 'var(--dp-text)' }}>{e.nom} {e.prenom}</span>
                                <span className="num shrink-0 text-[11px] font-extrabold" style={{ color: '#BE123C' }}>{e.retards} j · {fmtDur(e.retard_secondes)}</span>
                              </span>
                              <span className="minibar mt-1.5 block"><i style={{ width: `${Math.min(100, (e.retard_secondes / maxRetardsSec) * 100)}%`, background: 'linear-gradient(90deg, #F43F5E, rgba(251,113,133,0.2))', boxShadow: '0 0 8px rgba(244,63,94,0.55)' }} /></span>
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Évaluation ponctualité */}
                  <div className="panel rule-gold rise flex flex-col p-5" style={{ '--d': '380ms' }}>
                    <PanelHead title="★ Évaluation ponctualité" sub="0–5 étoiles · % de journées conformes" />
                    <div className="flex flex-1 flex-col justify-center gap-3">
                      {[
                        { l: 'Retards (entrées)', pct: data.barometres.ponctualite, v: `${k.journees_presence - k.retards}/${k.journees_presence}`, stars: k.note_retards, color: '#F43F5E' },
                        { l: 'Sorties conformes', pct: data.barometres.sorties_conformes, v: `${k.journees_presence - k.departs_anticipe}/${k.journees_presence}`, stars: k.note_sorties, color: '#14B8A6' },
                      ].map((row) => (
                        <div key={row.l} className="rounded-xl p-3.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(148,163,199,0.1)' }}>
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[10.5px] font-extrabold uppercase tracking-[0.14em]" style={{ color: row.color }}>{row.l}</p>
                            <Stars value={row.stars} label={row.l} />
                          </div>
                          <p className="num mt-1 text-[19px] font-extrabold" style={{ color: 'var(--dp-text)' }}>{fmtPct(row.pct)}</p>
                          <p className="num mt-0.5 text-[10.5px]" style={{ color: 'var(--dp-text-3)' }}>{row.v} journée(s) conformes</p>
                          <div className="minibar mt-2"><i style={{ width: `${row.pct || 0}%`, background: `linear-gradient(90deg, ${row.color}, rgba(255,255,255,0.12))` }} /></div>
                        </div>
                      ))}
                      <p className="text-[9.5px] leading-relaxed" style={{ color: 'var(--dp-text-3)' }}>
                        Échelle : 5★ ≥ 97,5 % · 4★ ≥ 92 % · 3★ ≥ 82 % · 2★ ≥ 65 % · 1★ ≥ 40 % de journées conformes.
                      </p>
                    </div>
                  </div>
                </div>

                {/* ===== Alertes de solde ===== */}
                {(data.alertes || []).length > 0 && (
                  <div className="panel rise p-5" style={{ borderColor: 'rgba(251,191,36,0.35)', '--d': '420ms' }}>
                    <PanelHead
                      title={<span className="flex items-center gap-2" style={{ color: 'var(--dp-amber)' }}><IconAlert /> Alertes de solde ({data.alertes.length})</span>}
                      sub="soldes de congé sous le seuil — cliquer pour ouvrir la fiche contextuelle"
                      right={<button type="button" className="chip chip--gold" onClick={() => setDrawer({ type: 'alertes' })}>Tout voir →</button>}
                    />
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                      {data.alertes.map((e) => {
                        const det = data.employes.find((x) => x.id === e.id);
                        const solde = det ? det.solde_conge : 0;
                        return (
                          <button
                            key={e.id}
                            type="button"
                            onClick={() => setDrawer({ type: 'employe', id: e.id })}
                            className="flex items-center justify-between gap-3 rounded-xl px-3.5 py-3 text-start transition-all duration-300"
                            style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(251,191,36,0.22)' }}
                            onMouseEnter={(ev) => { ev.currentTarget.style.borderColor = 'rgba(251,191,36,0.6)'; ev.currentTarget.style.boxShadow = '0 0 22px -8px rgba(251,191,36,0.5)'; }}
                            onMouseLeave={(ev) => { ev.currentTarget.style.borderColor = 'rgba(251,191,36,0.22)'; ev.currentTarget.style.boxShadow = 'none'; }}
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-[12.5px] font-bold" style={{ color: 'var(--dp-text)' }}>{e.nom} {e.prenom}</span>
                              <span className="num block text-[10.5px]" style={{ color: 'var(--dp-text-3)' }}>Mat. {e.matricule} · {e.categorie}</span>
                            </span>
                            <span className={`chip shrink-0 ${solde < 0 ? 'chip--rose' : 'chip--amber'}`}>{solde < 0 ? 'Négatif' : `${fmtJours(solde)} j`}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ===== Détail par employé ===== */}
                <div className="panel rise overflow-hidden p-0" style={{ '--d': '460ms' }}>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4 sm:px-5" style={{ borderColor: 'var(--dp-hairline)' }}>
                    <div>
                      <h2 className="sec-title">Détail par employé</h2>
                      <p className="num text-[10.5px]" style={{ color: 'var(--dp-text-3)' }}>
                        {employesFiltres.length} / {data.employes.length} employé(s) affiché(s){situation ? ` · ${situation.text}` : ''}
                      </p>
                    </div>
                    <div className="flex w-full items-center gap-2 sm:w-auto">
                      <div className="sema-box flex-1 sm:w-72 sm:flex-none" style={{ borderRadius: 12 }}>
                        <span className="sema-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg></span>
                        <input
                          className="input"
                          style={{ minHeight: 36, paddingBlock: 6 }}
                          placeholder="Matricule / nom…"
                          value={recherche}
                          onChange={(e) => setRecherche(e.target.value)}
                        />
                      </div>
                      <Link to="/employes" className="btn btn-ghost shrink-0 !px-3 !py-1.5 text-[11.5px]">Voir tout →</Link>
                    </div>
                  </div>
                  <div className="max-h-[460px] overflow-auto">
                    <table className="dash-table w-full min-w-[1080px] border-collapse">
                      <thead>
                        <tr>
                          <th>Employé</th>
                          <th>Heures trav.</th>
                          <th>Présence</th>
                          <th>J. présents</th>
                          <th>Congé (j)</th>
                          <th>Maladie (j)</th>
                          <th>Absence (j)</th>
                          <th>Retards</th>
                          <th>Sorties ant.</th>
                          <th>Solde congé</th>
                          <th>Solde maladie</th>
                        </tr>
                      </thead>
                      <tbody>
                        {employesFiltres.length === 0 && (
                          <tr><td colSpan={11} className="!py-8 text-center" style={{ color: 'var(--dp-text-3)' }}>Aucun employé ne correspond.</td></tr>
                        )}
                        {employesFiltres.map((e) => (
                          <tr key={e.id} onClick={() => setDrawer({ type: 'employe', id: e.id })}>
                            <td>
                              <div className="flex items-center gap-2.5">
                                {e.photo_url && !photosErreur.has(e.matricule) ? (
                                  <img src={mediaSrc(e.photo_url)} alt="" className="avatar-mini !rounded-full" onError={() => marquerPhotoErreur(e.matricule)} />
                                ) : (
                                  <span className="avatar-mini">{(e.nom || '?').charAt(0)}{(e.prenom || '').charAt(0)}</span>
                                )}
                                <span className="min-w-0">
                                  <span className="emp-name block truncate">{e.nom} {e.prenom}</span>
                                  <span className="emp-sub num block">Mat. {e.matricule} · {e.categorie}</span>
                                </span>
                              </div>
                            </td>
                            <td className="td-num font-semibold" style={{ color: 'var(--dp-text)' }}>{fmtHeures(e.travaille_heures)}</td>
                            <td><span className={`chip ${cartePresence(e.presence_pct).cls}`}>{fmtPct(e.presence_pct)}</span></td>
                            <td><span className="num font-semibold" style={{ color: 'var(--dp-emerald-deep)' }} title={`${e.jours_presents} j sur ${e.jours_ouvrables} j légaux`}>{e.jours_presents} j</span></td>
                            <td className="num">{e.jours_conge ? fmtJours(e.jours_conge) : '—'}</td>
                            <td className="num">{e.jours_maladie ? fmtJours(e.jours_maladie) : '—'}</td>
                            <td>{e.jours_absence ? <span className="num font-bold" style={{ color: 'var(--dp-amber)' }}>{e.jours_absence} j</span> : <span className="num" style={{ color: 'var(--dp-emerald-deep)' }}>0</span>}</td>
                            <td>
{e.retards ? (
<span className="num font-bold" style={{ color: '#BE123C' }} title={`cumul ${fmtDur(e.retard_secondes)}`}>{e.retards} j</span>
) : <span className="num" style={{ color: 'var(--dp-emerald-deep)' }}>0</span>}
                            </td>
                            <td className="num">{e.departs_anticipe || '—'}</td>
                            <td><span className="num font-extrabold" style={{ color: e.solde_conge < 0 ? '#E11D48' : e.solde_conge < 5 ? 'var(--dp-amber)' : '#10b981' }}>{fmtJours(e.solde_conge)} j</span></td>
                            <td><span className="num font-extrabold" style={{ color: e.solde_maladie < 0 ? '#E11D48' : 'var(--dp-cobalt)' }}>{fmtJours(e.solde_maladie)} j</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <p className="num pb-2 text-center text-[10px]" style={{ color: 'var(--dp-text-3)' }}>
                  Xmator RH · cockpit dark premium — les données se rafraîchissent en continu (WebSocket), sans rechargement de page.
                </p>
              </>
            )}
          </div>

          {/* CTA principal — or brossé, halo au survol (jamais un bloc de couleur uni) */}
          <div className="sticky bottom-4 z-40 flex justify-end pointer-events-none">
            <Link to="/demandes/nouvelle" className="btn btn-gold pointer-events-auto" style={{ padding: '12px 20px', fontSize: 13.5, borderRadius: 14 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              Nouvelle demande de congé
            </Link>
          </div>
        </div>
      </div>

      {/* ============================ TIROIR CONTEXTUEL ============================ */}
      {data && (
        <TiroirContexte
          open={!!drawer && !!drawerView}
          onClose={() => setDrawer(null)}
          title={drawerView?.title}
          subtitle={drawerView?.subtitle}
          badge={drawerView?.badge}
        >
          {drawerView?.big && (
            <p className="num mb-4 text-[26px] font-black leading-none gold-text">{drawerView.big}</p>
          )}
          {drawerView?.body}
        </TiroirContexte>
      )}
    </div>
  );
}

// ---- Détail employé dans le tiroir ----
function EmployeeDetail({ e, deptParId, children }) {
  if (!e) return null;
  const stats = [
    { l: 'Heures travaillées', v: fmtHeures(e.travaille_heures) },
    { l: 'Présence', v: fmtPct(e.presence_pct) },
    { l: 'Jours présents', v: `${e.jours_presents} j` },
    { l: 'Retards', v: e.retards ? `${e.retards} j · ${fmtDur(e.retard_secondes)}` : '0' },
    { l: 'Sorties anticipées', v: e.departs_anticipe ? `${e.departs_anticipe} j` : '0' },
    { l: 'Solde congé', v: `${fmtJours(e.solde_conge)} j` },
  ];
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3.5 rounded-2xl p-4" style={{ background: 'linear-gradient(150deg, rgba(227,185,77,0.12), rgba(10,14,24,0.4))', border: '1px solid rgba(227,185,77,0.3)' }}>
        <span className="avatar-mini" style={{ width: 56, height: 56, fontSize: 18 }}>{(e.nom || '?').charAt(0)}{(e.prenom || '').charAt(0)}</span>
        <div className="min-w-0">
          <p className="text-[15px] font-black" style={{ color: 'var(--dp-text)' }}>{e.nom} {e.prenom}</p>
          <p className="num text-[11px]" style={{ color: 'var(--dp-gold)' }}>Mat. {e.matricule} · {e.categorie}</p>
          <p className="num mt-0.5 text-[10.5px]" style={{ color: 'var(--dp-text-3)' }}>{deptParId?.get(String(e.id)) || '—'}</p>
        </div>
        <span className={`chip ms-auto ${cartePresence(e.presence_pct).cls}`}>{fmtPct(e.presence_pct)}</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {stats.map((s) => (
          <div key={s.l} className="rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(148,163,199,0.1)' }}>
            <p className="text-[9px] font-extrabold uppercase tracking-[0.16em]" style={{ color: 'var(--dp-text-3)' }}>{s.l}</p>
            <p className="num mt-1 text-[14px] font-extrabold" style={{ color: 'var(--dp-text)' }}>{s.v}</p>
          </div>
        ))}
      </div>

      <div>
        <p className="eyebrow mb-2.5">Activité sur la période</p>
        <p className="tl-item" style={{ '--tl-color': 'var(--dp-emerald)' }}>
          <span className="block text-[12px] font-semibold" style={{ color: 'var(--dp-text)' }}>{e.jours_presents} journée(s) badgée(s)</span>
          <span className="num block text-[10.5px]" style={{ color: 'var(--dp-text-3)' }}>{fmtHeures(e.travaille_heures)} travaillées / {fmtHeures(e.legal_heures)} légales</span>
        </p>
        <p className="tl-item" style={{ '--tl-color': 'var(--dp-cobalt)' }}>
          <span className="block text-[12px] font-semibold" style={{ color: 'var(--dp-text)' }}>{fmtJours(e.jours_conge)} jour(s) de congé posés</span>
          <span className="num block text-[10.5px]" style={{ color: 'var(--dp-text-3)' }}>solde restant : {fmtJours(e.solde_conge_periode ?? e.solde_conge)} j (selon calendrier)</span>
        </p>
        {(e.jours_maladie || 0) > 0 && (
          <p className="tl-item" style={{ '--tl-color': 'var(--dp-amber)' }}>
            <span className="block text-[12px] font-semibold" style={{ color: 'var(--dp-text)' }}>{fmtJours(e.jours_maladie)} jour(s) de maladie</span>
          </p>
        )}
        {(e.jours_absence || 0) > 0 && (
          <p className="tl-item" style={{ '--tl-color': 'var(--dp-rose)' }}>
            <span className="block text-[12px] font-semibold" style={{ color: 'var(--dp-text)' }}>{e.jours_absence} jour(s) d'absence sans justification</span>
          </p>
        )}
        <p className="tl-item" style={{ '--tl-color': 'var(--dp-gold)', paddingBottom: 4 }}>
          <span className="block text-[12px] font-semibold" style={{ color: 'var(--dp-text)' }}>Cotation ponctualité</span>
          <span className="mt-1 block"><Stars value={e.etoiles_retard} size={15} label="Retards" /> <Stars value={e.etoiles_sortie} size={15} label="Sorties" /></span>
        </p>
      </div>
      {children}
    </div>
  );
}
