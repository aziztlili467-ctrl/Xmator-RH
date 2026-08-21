import { useMemo } from 'react';
import { fmtDate } from '../utils';
import { IconCalendarCheck } from './icons';

const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

const LEGENDE = [
  { st: 'present', label: 'Présent', dot: '#10b981' },
  { st: 'conge', label: 'Congé', dot: '#3860ea' },
  { st: 'conge_demi', label: 'Demi-journée de congé', dot: '#8b5cf6' },
  { st: 'maladie', label: 'Maladie', dot: '#f43f5e' },
  { st: 'absence', label: 'Absent', dot: '#f59e0b' },
  { st: 'repos', label: 'Repos / férié', dot: '#cbd5e1' },
];

const CELLS = {
  present: 'bg-emerald-500 text-white shadow-sm ring-1 ring-emerald-600/40',
  conge: 'bg-blue-600 text-white shadow-sm ring-1 ring-blue-700/40',
  conge_demi: 'bg-violet-500 text-white shadow-sm ring-1 ring-violet-600/40',
  maladie: 'bg-rose-500 text-white shadow-sm ring-1 ring-rose-600/40',
  absence: 'bg-amber-500 text-white shadow-sm ring-1 ring-amber-600/40',
  repos: 'bg-slate-200 text-slate-500',
  vide: 'bg-transparent',
};

const statutJour = (j) => {
  if (!j) return { st: 'vide', day: '' };
  const day = Number(j.date.slice(8, 10));
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
                  const { st, day } = statutJour(j);
                  return (
                    <div
                      key={`${m.cle}-${i}`}
                      title={j ? `${fmtDate(j.date)}${j.demi && j.conge > 0 ? ' · demi-journée de congé' : ''}` : ''}
                      className={`flex h-9 w-full items-center justify-center rounded-lg text-xs font-bold ${CELLS[st]}`}
                    >
                      {day}
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