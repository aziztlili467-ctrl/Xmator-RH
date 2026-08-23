import { useMemo } from 'react';
import { fmtDate } from '../utils';
import { IconCalendarCheck } from './icons';

const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

const LEGENDE = [
  { st: 'present', label: 'Présent (P1)', dot: '#10b981' },
  { st: 'conge', label: 'Congé', dot: '#3860ea' },
  { st: 'conge_demi', label: 'Demi-journée de congé', dot: '#000000' },
  { st: 'maladie', label: 'Maladie', dot: '#f43f5e' },
  { st: 'absence', label: 'Absent', dot: '#f59e0b' },
  { st: 'repos', label: 'Repos / férié', dot: '#cbd5e1' },
  { st: 'rma_A1', label: 'A1 — Absent', dot: '#f59e0b' },
  { st: 'rma_CA', label: 'CA — Congé Annuel', dot: '#0ea5e9' },
  { st: 'rma_MA', label: 'MA — Maladie', dot: '#f43f5e' },
  { st: 'rma_R3', label: 'R3 — Repos Payé', dot: '#8b5cf6' },
  { st: 'rma_RP', label: 'RP — Repos', dot: '#64748b' },
];

const CELLS = {
  present: 'bg-emerald-500 text-white shadow-sm ring-1 ring-emerald-600/40',
  conge: 'bg-blue-600 text-white shadow-sm ring-1 ring-blue-700/40',
  conge_demi: 'bg-black text-white shadow-sm ring-1 ring-black/40',
  maladie: 'bg-rose-500 text-white shadow-sm ring-1 ring-rose-600/40',
  absence: 'bg-amber-500 text-white shadow-sm ring-1 ring-amber-600/40',
  repos: 'bg-slate-200 text-slate-500',
  rma: 'text-white shadow-sm ring-1 ring-black/10',
  vide: 'bg-transparent',
};

// Couleur des heures travaillées dans la case : lisible et distincte sur chaque fond
const HEURES_TXT = {
  present: 'text-emerald-950/80',
  conge: 'text-blue-100',
  conge_demi: 'text-white/90',
  maladie: 'text-rose-100',
  absence: 'text-amber-950/80',
  repos: 'text-slate-600',
  rma: 'text-white/90',
  vide: '',
};

// Secondes → « 8h35 » (ou « 6h » si minutes nulles) ; 0 → '' (rien d'affiché)
const fmtH = (sec) => {
  if (!sec || sec <= 0) return '';
  const m = Math.round(sec / 60);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm ? `${h}h${String(mm).padStart(2, '0')}` : `${h}h`;
};

const statutJour = (j) => {
  if (!j) return { st: 'vide', day: '' };
  const day = Number(j.date.slice(8, 10));
  // Codifications RMA (Journal RMA → Journal de paie) : prioritaires, affichées avec leur couleur paramétrée
  // Demi-journée CA : CA en noir (même si RMA)
  if (j.rma_code) {
    if (j.rma_code.includes('CA') && (j.rma_demi || (j.demi && j.conge > 0))) return { st: 'rma', day, code: j.rma_code, couleur: '#000000' };
    return { st: 'rma', day, code: j.rma_code, couleur: j.rma_couleur || '#64748b' };
  }
  // Demi-journée de congé : prioritaire sur « présent » pour rester visible même si l'agent a badgeé
  if (j.demi && j.conge > 0) return { st: 'conge_demi', day };
  if (j.badge > 0) return { st: 'present', day };
  if (j.conge > 0) return { st: 'conge', day };
  if (j.maladie > 0) return { st: 'maladie', day };
  if (j.ouvrable && j.heures > 0) return { st: 'absence', day };
  return { st: 'repos', day };
};

export default function CalendarJour({ debut, fin, jours, nom, prenom, matricule }) {
  const parMois = useMemo(() => {
    const index = new Map((jours || []).map((j) => [j.date, j]));
    const debutDate = new Date(debut + 'T00:00:00');
    const finDate = new Date(fin + 'T00:00:00');
    const moisList = [];
    const mCur = new Date(debutDate.getFullYear(), debutDate.getMonth(), 1);
    const mEnd = new Date(finDate.getFullYear(), finDate.getMonth(), 1);
    while (mCur <= mEnd) {
      moisList.push(new Date(mCur));
      mCur.setMonth(mCur.getMonth() + 1);
    }
    const map = new Map();
    for (const first of moisList) {
      const y = first.getFullYear();
      const m = first.getMonth();
      const key = `${y}-${String(m + 1).padStart(2, '0')}`;
      const daysInMonth = new Date(y, m + 1, 0).getDate();
      const cells = [];
      for (let d = 1; d <= daysInMonth; d++) {
        const isoD = `${key}-${String(d).padStart(2, '0')}`;
        cells.push(index.get(isoD) || null);
      }
      map.set(key, { cle: key, cells });
    }
    return [...map.values()];
  }, [debut, fin, jours]);

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-700">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-700/10 text-brand-700"><IconCalendarCheck /></span>
            Calendrier de présence
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            {nom} {prenom} · Mat. {matricule} · du {fmtDate(debut)} au {fmtDate(fin)}
          </p>
          <p className="mt-0.5 text-[11px] italic text-slate-400">
            Durée travaillée affichée dans chaque case = dernier badgeage − premier badgeage du jour.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-medium text-slate-600">
          {LEGENDE.map((l) => (
            <span key={l.st} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: l.dot }} />
              {l.label}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {parMois.map((m) => {
          const premier = new Date(`${m.cle}-01T00:00:00`);
          const debutCol = (premier.getDay() + 6) % 7;
          return (
            <div key={m.cle}>
              <p className="mb-2 text-sm font-bold capitalize text-slate-700">
                {MOIS[Number(m.cle.slice(5, 7)) - 1]} {m.cle.slice(0, 4)}
              </p>
              <div className="grid grid-cols-7 gap-1.5">
                {JOURS.map((j) => (
                  <div key={j} className="pb-0.5 text-center text-[10px] font-bold uppercase tracking-wide text-slate-400">{j}</div>
                ))}
                {Array.from({ length: debutCol }).map((_, i) => (
                  <div key={`b${i}`} />
                ))}
                {m.cells.map((j, i) => {
                  const { st, day, code, couleur } = statutJour(j);
                  const heuresTxt = fmtH(j && j.travaille_secondes);
                  const rma = j && j.rma_code;
                  const styleRma = st === 'rma' ? { backgroundColor: couleur } : undefined;
                  return (
                    <div
                      key={`${m.cle}-${i}`}
                      title={j ? `${fmtDate(j.date)}${rma ? ` · ${rma}` : ''}${j.demi && j.conge > 0 ? ' · demi-journée de congé' : ''}${heuresTxt ? ` · ${heuresTxt} travaillées` : ''}` : ''}
                      className={`flex h-11 w-full flex-col items-center justify-center rounded-lg leading-none sm:h-12 md:h-14 ${CELLS[st]}`}
                      style={styleRma}
                    >
                      <span className="text-[11px] font-bold sm:text-xs">{rma ? rma.split('/')[0] : day}</span>
                      {rma && rma.includes('/') ? (
                        <span className="text-[7px] font-bold leading-none opacity-90">{rma}</span>
                      ) : heuresTxt ? (
                        <span className={`mt-1 text-[8px] font-semibold sm:text-[9px] md:text-[10px] ${HEURES_TXT[st]}`}>
                          {heuresTxt}
                        </span>
                      ) : rma ? (
                        <span className="text-[10px] font-bold sm:text-xs">{day}</span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}