import { useState } from 'react';

function hexToRgb(hex){ const m=/^#?([0-9a-f]{6})$/i.exec(hex); if(!m) return {r:6,g:182,b:212}; const v=parseInt(m[1],16); return {r:(v>>16)&255,g:(v>>8)&255,b:v&255};}
function lighten(hex, a=0.28){ const {r,g,b}=hexToRgb(hex); const mix=(c)=>Math.round(c+(255-c)*a); return `rgb(${mix(r)},${mix(g)},${mix(b)})`; }
function darken(hex, a=0.22){ const {r,g,b}=hexToRgb(hex); const mix=(c)=>Math.round(c*(1-a)); return `rgb(${mix(r)},${mix(g)},${mix(b)})`; }

export default function StairsStatsDiagram({ data = [], colors = { retards: '#06b6d4', sorties: '#8b5cf6' } }) {
  const [active, setActive] = useState(null);
  const [hidden, setHidden] = useState({ retards: false, sorties: false });
  const filtered = data.filter(d => (d['Jours en retard'] || 0) + (d['Sorties anticipées'] || 0) > 0);
  if (!filtered.length) return <p className="py-8 text-center text-sm" style={{color:'var(--text-secondary)'}}>Aucune donnée sur la période.</p>;
  const maxVal = Math.max(...filtered.map(d => Math.max(hidden.retards?0:d['Jours en retard']||0, hidden.sorties?0:d['Sorties anticipées']||0)),1);
  return (
    <div className="space-y-3">
      <div className="space-y-2.5">
        {filtered.map((d, idx) => {
          const ret = hidden.retards ? 0 : (d['Jours en retard']||0);
          const sor = hidden.sorties ? 0 : (d['Sorties anticipées']||0);
          const wRet = Math.max(6, (ret/maxVal)*100);
          const wSor = Math.max(6, (sor/maxVal)*100);
          const isActive = active===idx;
          return (
            <div key={d.label} onMouseEnter={()=>setActive(idx)} onMouseLeave={()=>setActive(null)} onClick={()=>setActive(active===idx?null:idx)}
              className="relative flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer transition-all" style={{ background: isActive ? 'var(--bg-panel-hover)' : 'var(--bg-panel)', borderColor: isActive ? 'var(--border-panel-glow)' : 'var(--border-panel)', transform: isActive ? 'translateX(2px)' : 'none' }}>
              <span className="w-20 shrink-0 text-[11px] font-semibold truncate" style={{ color: 'var(--text-secondary)' }}>{d.label}</span>
              <div className="flex flex-1 flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <div className="relative h-3.5 flex-1 overflow-hidden rounded-full" style={{ background: 'rgba(0,0,0,0.06)' }}>
                    <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${wRet}%`, background: `linear-gradient(90deg, ${colors.retards}, ${lighten(colors.retards,0.18)})`, boxShadow: `0 2px 6px ${colors.retards}50`, transition: 'width 0.5s ease' }} />
                  </div>
                  <span className="w-6 text-right text-[11px] font-bold" style={{ color: colors.retards }}>{ret}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative h-3.5 flex-1 overflow-hidden rounded-full" style={{ background: 'rgba(0,0,0,0.06)' }}>
                    <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${wSor}%`, background: `linear-gradient(90deg, ${colors.sorties}, ${lighten(colors.sorties,0.18)})`, boxShadow: `0 2px 6px ${colors.sorties}50`, transition: 'width 0.5s ease' }} />
                  </div>
                  <span className="w-6 text-right text-[11px] font-bold" style={{ color: colors.sorties }}>{sor}</span>
                </div>
              </div>
              {isActive && (
                <div className="absolute right-2 -top-10 whitespace-nowrap rounded-lg border bg-white px-2.5 py-1.5 text-xs font-semibold shadow-xl z-10" style={{ borderColor: 'var(--border)' }}>
                  <p className="font-bold">{d.label}</p>
                  <p style={{ color: colors.retards }}>Retards: {d['Jours en retard']}</p>
                  <p style={{ color: colors.sorties }}>Sorties: {d['Sorties anticipées']}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap justify-center gap-4 text-xs">
        <button onClick={()=>setHidden(s=>({...s, retards:!s.retards}))} className={`flex items-center gap-1.5 rounded-full border px-3 py-1 font-semibold ${hidden.retards?'opacity-40':''}`} style={{ borderColor: hidden.retards?'var(--border)':colors.retards, background: hidden.retards?'transparent':`${colors.retards}18`, color: hidden.retards?'var(--text-muted)':colors.retards }}>
          <span className="h-3 w-3 rounded-sm" style={{ background: colors.retards }} /> Jours en retard
        </button>
        <button onClick={()=>setHidden(s=>({...s, sorties:!s.sorties}))} className={`flex items-center gap-1.5 rounded-full border px-3 py-1 font-semibold ${hidden.sorties?'opacity-40':''}`} style={{ borderColor: hidden.sorties?'var(--border)':colors.sorties, background: hidden.sorties?'transparent':`${colors.sorties}18`, color: hidden.sorties?'var(--text-muted)':colors.sorties }}>
          <span className="h-3 w-3 rounded-sm" style={{ background: colors.sorties }} /> Sorties anticipées
        </button>
      </div>
    </div>
  );
}
