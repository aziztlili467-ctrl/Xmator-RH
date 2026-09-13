import { useMemo, useState } from 'react';
import { fmtJours } from '../../utils';

// Échelle de couleur d'intensité : rouge profond → ambre → émeraude lumineuse
export function heatColor(v /* 0..1 */, alpha = 1) {
  const x = Math.max(0, Math.min(1, v));
  const mix = (a, b, t) => Math.round(a + (b - a) * t);
  let r, g, b;
  if (x < 0.5) {
    const t = x / 0.5; // rose → ambre
    r = mix(190, 251, t); g = mix(60, 191, t); b = mix(80, 36, t);
  } else {
    const t = (x - 0.5) / 0.5; // ambre → émeraude
    r = mix(251, 52, t); g = mix(191, 211, t); b = mix(36, 153, t);
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * PresenceHeatmap — grille départements × situations (présence / congé /
 * maladie / absence / retards). Chaque cellule est intensité + valeur, le
 * survol zoome la cellule et ouvre une bulle sophistiquée (jours réels +
 * part des jours ouvrables).
 *
 * rows: [{ key, label, nb, presents, conge, maladie, absence, retards, ouvrables, heures }]
 */
const COLS = [
  { id: 'presents', label: 'Prés.', key: 'presents', good: true },
  { id: 'conge', label: 'Congé', key: 'conge' },
  { id: 'maladie', label: 'Maladie', key: 'maladie' },
  { id: 'absence', label: 'Absence', key: 'absence' },
  { id: 'retards', label: 'Retards', key: 'retards' },
];

export default function PresenceHeatmap({ rows = [], onSelectRow }) {
  const [hover, setHover] = useState(null);

  const maxima = useMemo(() => {
    const m = {};
    for (const c of COLS) m[c.key] = Math.max(1, ...rows.map((r) => Number(r[c.key]) || 0));
    return m;
  }, [rows]);

  if (!rows.length) {
    return <p className="py-8 text-center text-sm" style={{ color: 'var(--dp-text-3)' }}>Aucun département rattaché aux données filtrées.</p>;
  }

  const cell = rows[hover?.r]?.[COLS[hover?.c]?.key];

  return (
    <div className="relative">
      <div
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `minmax(110px, 1.35fr) repeat(${COLS.length}, minmax(0, 1fr))` }}
      >
        <span />
        {COLS.map((c) => (
          <span key={c.id} className="whitespace-nowrap pb-1 text-center text-[9px] font-extrabold uppercase tracking-[0.14em]" style={{ color: 'var(--dp-text-3)' }}>
            {c.label}
          </span>
        ))}

        {rows.map((r, ri) => (
          <RowCells
            key={r.key}
            row={r}
            ri={ri}
            maxima={maxima}
            hover={hover}
            setHover={setHover}
            onSelectRow={onSelectRow}
          />
        ))}
      </div>

      {/* Légende dégradée */}
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-[10.5px] font-semibold" style={{ color: 'var(--dp-text-3)' }}>
          Intensité relative par colonne · cliquer une ligne pour le détail
        </p>
        <span className="flex shrink-0 items-center gap-2 text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--dp-text-3)' }}>
          Faible
          <span className="h-2 w-24 rounded-full" style={{ background: 'linear-gradient(90deg, rgba(190,60,80,0.9), rgba(251,191,36,0.85), rgba(52,211,153,0.95))' }} />
          Forte
        </span>
      </div>

      {hover && cell != null && (
        <div className="tip" style={{ left: '50%', top: -10, transform: 'translate(-50%, -100%)' }}>
          <p className="tip-title">{rows[hover.r].label}</p>
          <div className="tip-row"><span>{COLS[hover.c].label}</span><b>{fmtJours(cell)} j</b></div>
          <div className="tip-row"><span>Part ouvrables</span><b>{rows[hover.r].ouvrables ? `${Math.round((cell / rows[hover.r].ouvrables) * 1000) / 10} %` : '—'}</b></div>
          <div className="tip-row"><span>Effectif</span><b>{rows[hover.r].nb}</b></div>
        </div>
      )}
    </div>
  );
}

function RowCells({ row, ri, maxima, hover, setHover, onSelectRow }) {
  return (
    <>
      <button
        type="button"
        onClick={() => onSelectRow && onSelectRow({ type: 'departement', row })}
        className="group flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-start transition-colors"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid transparent' }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(227,185,77,0.35)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'transparent'; }}
      >
        <span className="min-w-0">
          <span className="block truncate text-[11.5px] font-bold" style={{ color: 'var(--dp-text)' }}>{row.label}</span>
          <span className="num block text-[9.5px]" style={{ color: 'var(--dp-text-3)' }}>{row.nb} pers. · {Math.round(row.heures || 0)} h</span>
        </span>
      </button>
      {COLS.map((c, ci) => {
        const v = Number(row[c.key]) || 0;
        const intensity = v / (maxima[c.key] || 1);
        const isHover = hover && hover.r === ri && hover.c === ci;
        return (
          <div
            key={c.id}
            className={`heat-cell grid place-items-center ${c.good ? '' : ''}`}
            style={{
              background: v > 0
                ? heatColor(c.good ? 0.35 + intensity * 0.65 : (1 - intensity) * 0.42 + (intensity * 0.58), 0.16 + intensity * 0.55)
                : 'rgba(148,163,199,0.05)',
              '--cell-glow': heatColor(c.good ? 1 : 0.1, 0.55),
              boxShadow: isHover ? `0 0 0 1px rgba(255,233,168,.5) inset, 0 8px 22px -8px rgba(0,0,0,.85)` : `0 0 0 1px rgba(148,163,199,.07) inset`,
            }}
            onMouseEnter={() => setHover({ r: ri, c: ci })}
            onMouseLeave={() => setHover(null)}
          >
            <span>{v > 0 ? fmtJours(v) : '·'}</span>
          </div>
        );
      })}
    </>
  );
}
