import { useEffect, useMemo, useRef, useState } from 'react';

// Normalisation pour la recherche « intelligente » : minuscules + sans accents.
export const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

// Intent de situation reconnu dans la phrase libre (ex. « tous les ingénieurs
// en congé » ⇒ catégorie Ingénieurs + situation « en congé »).
const SITUATIONS = [
  { id: 'conge', label: 'En congé', mots: ['conge', 'conges', 'en conge', 'vacances'], color: '#4c7dff' },
  { id: 'retard', label: 'En retard', mots: ['retard', 'retards', 'ponctualite'], color: '#fb7185' },
  { id: 'maladie', label: 'En maladie', mots: ['maladie', 'arret maladie', 'arrets'], color: '#f59e0b' },
  { id: 'absence', label: 'Absent (sans justification)', mots: ['absent', 'absence', 'absences'], color: '#fb7185' },
  { id: 'present', label: 'Présents', mots: ['present', 'presents', 'a l heure', 'a l’heure'], color: '#34d399' },
  { id: 'solde', label: 'Solde faible ou négatif', mots: ['solde', 'solde faible', 'solde negatif'], color: '#e3b94d' },
];

function analyseQuery(q, ctx) {
  const n = norm(q);
  if (!n) return { mots: [], categories: [], departements: [], employes: [], situations: [], reliquat: '' };
  const motsLibres = new Set(n.split(/[\s,;]+/).filter(Boolean));
  const eat = (...words) => { for (const w of words) motsLibres.delete(norm(w)); };

  const categories = (ctx.categoriesList || []).filter((c) => c.libelle && n.includes(norm(c.libelle).split(' ')[0]) && norm(c.libelle).split(' ')[0].length > 3);
  categories.forEach((c) => eat(c.libelle));

  const departements = (ctx.departementsList || []).filter((d) => d && n.includes(norm(d)));
  departements.forEach((d) => eat(d));

  const employes = (ctx.employesList || [])
    .filter((e) => {
      const full = norm(`${e.nom} ${e.prenom}`);
      const hitNom = full.length > 5 && n.includes(full);
      const hitMat = !!e.matricule && norm(q).includes(e.matricule) && String(e.matricule).length > 2;
      return hitNom || hitMat;
    })
    .slice(0, 4);
  employes.forEach((e) => eat(`${e.nom} ${e.prenom}`));

  const situations = SITUATIONS.filter((s) => s.mots.some((m) => n.includes(norm(m))));
  situations.forEach((s) => { for (const m of s.mots) if (n.includes(m)) eat(m); });

  // stop-words usuels d'une demande naturelle
  ['tous', 'toutes', 'tout', 'les', 'les', 'du', 'de', 'des', 'en', 'au', 'aux', 'qui', 'sont', 'est', 'sont', 'et', 'la', 'le', 'un', 'une', 'sur', 'periode', 'personnel', 'employe', 'employes', 'trouvez', 'trouver', 'cherche'].forEach((w) => motsLibres.delete(w));

  return {
    categories,
    departements,
    employes,
    situations,
    reliquat: [...motsLibres].join(' '),
  };
}

/**
 * SearchSema — recherche sémantique du panneau de filtres :
 * « Trouver tous les ingénieurs en congé » → filtre catégorie + situation,
 * puces d'intention supprimables, suggestions live (catégories, départements,
 * employés), et repli texte libre pour le tableau.
 */
export default function SearchSema({ ctx, onApply, placeholder = 'Trouver tous les ingénieurs en congé…' }) {
  const [q, setQ] = useState('');
  const [focus, setFocus] = useState(false);
  const [selIdx, setSelIdx] = useState(0);
  const boxRef = useRef(null);

  const parsed = useMemo(() => analyseQuery(q, ctx), [q, ctx]);

  const suggestions = useMemo(() => {
    if (!q.trim()) return [];
    const out = [];
    parsed.employes.slice(0, 3).forEach((e) => out.push({ type: 'employe', label: `${e.nom} ${e.prenom}`, sub: `Mat. ${e.matricule}`, intent: { employeId: String(e.id), text: `Employé : ${e.nom} ${e.prenom}` } }));
    parsed.categories.slice(0, 3).forEach((c) => out.push({ type: 'categorie', label: c.libelle, sub: 'Catégorie', intent: { categorieId: String(c.id), text: `Catégorie : ${c.libelle}` } }));
    parsed.departements.slice(0, 3).forEach((d) => out.push({ type: 'departement', label: d, sub: 'Département', intent: { departement: d, text: `Département : ${d}` } }));
    parsed.situations.slice(0, 3).forEach((s) => out.push({ type: 'situation', label: s.label, sub: 'Situation sur la période', intent: { situation: s.id, text: `Situation : ${s.label}`, color: s.color } }));
    if (parsed.reliquat) out.push({ type: 'texte', label: `Texte libre : « ${parsed.reliquat} »`, sub: 'Recherche dans le tableau', intent: { texte: parsed.reliquat, text: `Texte : ${parsed.reliquat}` } });
    return out;
  }, [q, parsed]);

  useEffect(() => setSelIdx(0), [suggestions.length]);

  useEffect(() => {
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setFocus(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const appliquer = (sug) => {
    onApply?.(sug.intent);
    setQ('');
    setFocus(false);
  };

  return (
    <div ref={boxRef} className="sema-box">
      <span className="sema-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
      </span>
      <input
        className="input"
        value={q}
        onChange={(e) => { setQ(e.target.value); setFocus(true); }}
        onFocus={() => setFocus(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && suggestions.length) {
            e.preventDefault();
            if (selIdx === 0 && suggestions.length > 1) suggestions.forEach((sg) => onApply?.(sg.intent));
            else if (suggestions[selIdx]) appliquer(suggestions[selIdx]);
            setQ('');
            setFocus(false);
          }
          if (e.key === 'ArrowDown') { e.preventDefault(); setSelIdx((i) => Math.min(i + 1, suggestions.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setSelIdx((i) => Math.max(i - 1, 0)); }
        }}
        placeholder={placeholder}
        aria-label="Recherche sémantique"
      />
      {focus && suggestions.length > 0 && (
        <div className="sema-pop glass">
          <p className="px-3 pb-1 pt-2 text-[9px] font-extrabold uppercase tracking-[0.18em]" style={{ color: 'var(--dp-gold)' }}>
            Intentions détectées — Entrée pour appliquer
          </p>
          {suggestions.map((s, i) => (
            <button
              key={`${s.type}-${s.label}`}
              type="button"
              className={`sema-row ${i === selIdx ? 'is-active' : ''}`}
              onMouseEnter={() => setSelIdx(i)}
              onClick={() => appliquer(s)}
            >
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[11px]"
                style={{ background: 'rgba(227,185,77,0.12)', border: '1px solid rgba(227,185,77,0.3)' }}
              >
                {s.type === 'employe' ? '👤' : s.type === 'categorie' ? '🏷️' : s.type === 'departement' ? '🏢' : s.type === 'situation' ? '⚡' : '🔎'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-bold" style={{ color: 'var(--dp-text)' }}>{s.label}</span>
                <span className="block text-[10px]" style={{ color: 'var(--dp-text-3)' }}>{s.sub}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      {!q && (
        <p className="sema-hint px-3 pb-2 pt-0.5">
          Langage naturel : « ingénieurs en congé », « retards au Comptoir », « solde faible »…
        </p>
      )}
    </div>
  );
}

export { SITUATIONS };
