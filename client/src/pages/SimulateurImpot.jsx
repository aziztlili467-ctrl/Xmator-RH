import { useMemo, useState } from 'react';
import { IconCalculator, IconUsers, IconCalendarDays, IconBanknotes } from '../components/icons';
import { calculerIRPP } from '../utils/irpp';

const fmt = (n) => {
  const v = Number(n) || 0;
  const s = v.toFixed(3).replace('.', ',');
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
};

function Champ({ corps, label, badge, children, defaut }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1.5">
        <span className="rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-white" style={{ background: '#eab308' }}>
          {badge}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</span>
        {defaut && <span className="text-[9px] text-slate-400">({defaut})</span>}
      </span>
      {children}
      <span className="mt-0.5 block text-[9px] text-slate-400">{corps}</span>
    </label>
  );
}

function LigneResultat({ label, valeur, fond }) {
  return (
    <div
      className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
      style={fond ? { background: fond, color: '#fff' } : { background: '#ffffff' }}
    >
      <span className={fond ? 'text-[12px] font-bold uppercase tracking-wide' : 'text-[12px] font-semibold uppercase tracking-wide text-slate-500'}>
        {label}
      </span>
      <span className={`tabular-nums ${fond ? 'font-black' : 'font-bold'} ${fond ? '' : 'text-slate-800'}`}>{valeur} <span className={fond ? 'text-white/80' : 'text-slate-400'}>TND</span></span>
    </div>
  );
}

export default function SimulateurImpot() {
  const [mois, setMois] = useState(12);
  const [salaire, setSalaire] = useState('2736.837');
  const [cf, setCf] = useState('non');
  const [enfants, setEnfants] = useState(0);
  const [autres, setAutres] = useState('0');

  const c = useMemo(() => {
    const r = calculerIRPP(salaire, {
      mois: Number(mois) || 1,
      cf: cf === 'oui' ? 1 : 0,
      enfants: Number(enfants) || 0,
      autres: Number(autres) || 0,
    });
    return { ...r, tranches: r.tranches.map((t) => ({ ...t, actif: r.F12 > t.borne })) };
  }, [mois, salaire, cf, enfants, autres]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Simulateur IRPP</h2>
        <p className="text-sm text-slate-500">
          Estimation de l'impôt sur le revenu (IRPP) et de la Contribution Sociale de Solidarité (CSS) selon la
          législation fiscale tunisienne 2026.
        </p>
      </div>

      <div className="card p-4" style={{ background: '#f8fafc' }}>
        <p className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
          <IconCalculator /> Paramètres de la simulation
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Champ badge="F1" label="Nombre de mois" corps="Période d'imposition" defaut="12">
            <input
              className="input w-full"
              type="number"
              min="1"
              max="12"
              value={mois}
              onChange={(e) => setMois(e.target.value)}
            />
          </Champ>
          <Champ badge="F3" label="Salaire imposable mensuel" corps="En Dinars Tunisiens (TND)" defaut="Ex : 2 736,837">
            <input
              className="input w-full"
              type="number"
              min="0"
              step="0.001"
              value={salaire}
              onChange={(e) => setSalaire(e.target.value)}
            />
          </Champ>
          <Champ badge="D8" label="Chef de famille (CF)" corps="Marié / Divorcé / Veuf avec enfants à charge">
            <select className="input w-full" value={cf} onChange={(e) => setCf(e.target.value)}>
              <option value="non">Non</option>
              <option value="oui">Oui</option>
            </select>
          </Champ>
          <Champ badge="D9" label="Enfants à charge" corps="Enfants de moins de 20 ans" defaut="0">
            <input
              className="input w-full"
              type="number"
              min="0"
              max="20"
              step="1"
              value={enfants}
              onChange={(e) => setEnfants(e.target.value)}
            />
          </Champ>
          <Champ badge="F10" label="Autres abattements" corps="Assurance vie, crédit 1er logement, enfant infirme..." defaut="0,000 TND">
            <input
              className="input w-full"
              type="number"
              min="0"
              step="0.001"
              value={autres}
              onChange={(e) => setAutres(e.target.value)}
            />
          </Champ>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold text-white" style={{ background: '#eab308' }}>
          <IconCalendarDays /> Mois : {c.F1}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold text-white" style={{ background: '#eab308' }}>
          <IconBanknotes /> Enfants : {c.D9}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold text-white" style={{ background: '#eab308' }}>
          <IconUsers /> Chef de famille : {c.D8 === 1 ? 'Oui (300 TND)' : 'Non'}
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
        <div className="border-b border-slate-200 px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">
          Salaire & déductions annuelles
        </div>
        <LigneResultat label="Salaire imposable mensuel (F3)" valeur={fmt(c.F3)} fond="#dc2626" />
        <LigneResultat label="Salaire imposable annuel réel (F4)" valeur={fmt(c.F4)} fond="#6b21a8" />
        <LigneResultat label="Salaire imposable annuel arrondi (F6)" valeur={fmt(c.F6)} />
        <LigneResultat label="Frais professionnels − 10 % plafonné 2 000 (F7)" valeur={fmt(c.F7)} />
        <LigneResultat label="Abattement chef de famille − 300 (F8)" valeur={fmt(c.F8)} />
        <LigneResultat label="Abattement enfants à charge − 100 / enfant (F9)" valeur={fmt(c.F9)} />
        <LigneResultat label="Autres abattements (F10)" valeur={fmt(c.F10)} />
        <LigneResultat label="Salaire imposable annuel théorique (F12)" valeur={fmt(c.F12)} fond="#0284c7" />

        <div className="border-t border-slate-200 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
          Barème IRPP — tranches (F13 à F20)
        </div>
        <div className="px-4 pb-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400">
                <th className="px-3 py-1.5">Intervalle (TND)</th>
                <th className="px-3 py-1.5 text-end">Taux (%)</th>
                <th className="px-3 py-1.5 text-end">Montant retenu (TND)</th>
              </tr>
            </thead>
            <tbody>
              {c.tranches.map((t, i) => (
                <tr key={t.borne} className={`border-b border-slate-100 last:border-0 ${t.actif && t.retenu !== 0 ? 'bg-slate-50 font-semibold' : ''}`}>
                  <td className="px-3 py-1.5 text-slate-600">T{i + 1} — {t.intervalle}</td>
                  <td className="px-3 py-1.5 text-end tabular-nums text-slate-600">{Math.round(t.taux * 100)} %</td>
                  <td className="px-3 py-1.5 text-end tabular-nums font-bold text-slate-700">{fmt(t.retenu)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <LigneResultat label="Total IRPP annuel (F21)" valeur={fmt(c.F21)} />
        <LigneResultat label="Contribution Sociale de Solidarité CSS 0,5 % (F22)" valeur={fmt(c.F22)} />
        <LigneResultat label="TOTAL retenues annuelles (F23)" valeur={fmt(c.F23)} fond="#1e3a8a" />
        <LigneResultat label="Impôt mensuel (F24)" valeur={fmt(c.F24)} />
        <LigneResultat label="Contribution sociale mensuelle (F25)" valeur={fmt(c.F25)} />
      </div>

      <div className="flex flex-col items-center justify-between gap-3 rounded-xl px-6 py-6 text-white shadow-card sm:flex-row" style={{ background: '#16a34a' }}>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-white/80">Salaire net mensuel (F26)</p>
          <p className="text-xs text-white/70">Salaire imposable mensuel + impôt + contribution sociale</p>
        </div>
        <p className="text-4xl font-black tabular-nums">{fmt(c.F26)} <span className="text-lg font-semibold text-white/80">TND</span></p>
      </div>
    </div>
  );
}