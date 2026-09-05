import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';

export default function EmployePicker({ selected, onSelect, value, onChange, placeholder }) {
  const [employes, setEmployes] = useState([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const ref = useRef(null);

  useEffect(() => {
    api.employes().then(setEmployes).catch(()=>{}).finally(()=>setLoading(false));
  }, []);

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const selectedObj = useMemo(() => {
    if (selected) return selected;
    if (value !== undefined && value !== '' && value !== null) {
      return employes.find(e => String(e.id) === String(value) || String(e.matricule) === String(value)) || null;
    }
    return null;
  }, [selected, value, employes]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return employes.slice(0, 50);
    return employes.filter(e =>
      e.matricule.toLowerCase().includes(q) ||
      e.nom.toLowerCase().includes(q) ||
      e.prenom.toLowerCase().includes(q) ||
      `${e.nom} ${e.prenom}`.toLowerCase().includes(q)
    ).slice(0, 50);
  }, [employes, query]);

  const choose = (e) => {
    if (onSelect) onSelect(e);
    else if (onChange) onChange(e ? e.id : '');
    setQuery('');
    setOpen(false);
  };

  const clear = () => {
    if (onSelect) onSelect(null);
    else if (onChange) onChange('');
    setQuery('');
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <input
          type="text"
          className="input"
          value={selectedObj ? `${selectedObj.matricule} — ${selectedObj.nom} ${selectedObj.prenom}` : query}
          onChange={(e) => {
            if (onSelect) onSelect(null);
            else if (onChange) onChange('');
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder || 'Rechercher un employé (matricule, nom, prénom) — liste complète disponible'}
          autoComplete="off"
        />
        {loading && <span className="absolute end-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">Chargement…</span>}
        {!loading && !selectedObj && (
          <button type="button" onClick={()=>setOpen(v=>!v)} className="absolute end-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100">▼</button>
        )}
      </div>

      {open && !selectedObj && (
        <ul className="absolute z-40 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-xl">
          {results.length === 0 ? (
            <li className="px-4 py-3 text-sm text-slate-500">Aucun employé trouvé pour « {query} ».</li>
          ) : (
            <>
              <li className="px-4 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">{results.length} employé(s) synchronisé(s) — tapez pour filtrer</li>
              {results.map((e) => (
                <li key={e.id} onMouseDown={() => choose(e)} className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-brand-50">
                  <span className="flex h-8 w-14 shrink-0 items-center justify-center rounded-md bg-brand-700 font-mono text-xs font-bold text-white">{e.matricule}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-800">{e.nom} {e.prenom}</span>
                    <span className="block truncate text-xs text-slate-500">{e.categorie}</span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-slate-400">Solde : {e.solde} j</span>
                </li>
              ))}
            </>
          )}
        </ul>
      )}

      {selectedObj && (
        <div className="mt-2 flex items-center gap-3 rounded-lg border border-brand-100 bg-brand-50 px-4 py-3">
          <span className="flex h-9 w-16 shrink-0 items-center justify-center rounded-md bg-brand-700 font-mono text-sm font-bold text-white">{selectedObj.matricule}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-slate-800">{selectedObj.nom} {selectedObj.prenom}</p>
            <p className="truncate text-xs text-slate-500">{selectedObj.categorie}</p>
          </div>
          <button type="button" onClick={clear} className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-slate-400 hover:bg-white hover:text-slate-600">Retirer</button>
        </div>
      )}
    </div>
  );
}
