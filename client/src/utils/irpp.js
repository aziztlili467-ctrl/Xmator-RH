export const TRANCHES_IRPP_2026 = [
  { borne: 0, largeur: 5000, taux: 0, intervalle: '0 — 5 000' },
  { borne: 5000, largeur: 5000, taux: 0.15, intervalle: '5 000 — 10 000' },
  { borne: 10000, largeur: 10000, taux: 0.25, intervalle: '10 000 — 20 000' },
  { borne: 20000, largeur: 10000, taux: 0.30, intervalle: '20 000 — 30 000' },
  { borne: 30000, largeur: 10000, taux: 0.33, intervalle: '30 000 — 40 000' },
  { borne: 40000, largeur: 10000, taux: 0.36, intervalle: '40 000 — 50 000' },
  { borne: 50000, largeur: 20000, taux: 0.38, intervalle: '50 000 — 70 000' },
  { borne: 70000, largeur: Infinity, taux: 0.40, intervalle: 'Plus de 70 000' },
];

export function calculerIRPP(salaireMensuel, { mois = 12, cf = 0, enfants = 0, autres = 0 } = {}) {
  const F1 = Math.max(1, Math.floor(Number(mois) || 1));
  const F3 = Number(salaireMensuel) || 0;
  const D8 = cf ? 1 : 0;
  const D9 = Math.max(0, Math.floor(Number(enfants) || 0));
  const F10 = Number(autres) || 0;
  const F4 = F3 * F1;
  const F6 = Math.ceil(F4);
  const F7 = -1 * Math.min(F6 * 0.10, 2000);
  const F8 = -1 * (D8 * 300);
  const F9 = -1 * (D9 * 100);
  const F12 = F6 + F7 + F8 + F9 + F10;
  const tranches = TRANCHES_IRPP_2026.map((t) => ({
    ...t,
    retenu: t.taux === 0 ? 0 : F12 > t.borne ? -1 * Math.min(F12 - t.borne, t.largeur) * t.taux : 0,
  }));
  const F21 = tranches.reduce((s, t) => s + t.retenu, 0);
  const F22 = -1 * (F12 * 0.005);
  const F23 = F21 + F22;
  const F24 = F21 / F1;
  const F25 = F22 / F1;
  const F26 = F3 + F24 + F25;
  return { F1, F3, D8, D9, F10, F4, F6, F7, F8, F9, F12, tranches, F21, F22, F23, F24, F25, F26 };
}

export function parseSituationFamille(s) {
  const str = String(s || '').toLowerCase();
  const cf = /mari|divorc|veuf/.test(str) ? 1 : 0;
  const m = str.match(/(\d+)\s*enfants?/);
  const enfants = m ? Math.max(0, parseInt(m[1], 10)) : 0;
  return { cf, enfants };
}