import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';

export default function EmployePicker({ selected, onSelect, placeholder }) {
  const [employes, setEmployes] = useState([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const ref = useRef(null);

  useEffect(() => {
    api
      .employes()
      .then(setEmployes)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return employes
      .filter(
        (e) =>
          e.matricule.toLowerCase().includes(q) ||
          e.nom.toLowerCase().includes(q) ||
          e.prenom.toLowerCase().includes(q) ||
          `${e.nom} ${e.prenom}`.toLowerCase().includes(q)
      )
      .slice(0, 10);
  }, [employes, query]);

  const choose = (e) => {
    onSelect(e);
    setQuery('');
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <input
          type="text"
          className="input"
          value={selected ? `${selected.matricule} — ${selected.nom} ${selected.prenom}` : query}
          onChange={(e) => {
            onSelect(null);
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder || 'Rechercher un employé (matricule, nom, prénom)'}
          autoComplete="off"
        />
        {loading && (
          <span className="absolute end-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">Chargement…</span>
        )}
      </div>

      {open && !selected && query.trim() && (
        <ul className="absolute z-40 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-xl">
          {results.length === 0 && (
            <li className="px-4 py-3 text-sm text-slate-500">
              Aucun employé trouvé pour « {query} ». Vérifiez le matricule.
            </li>
          )}
          {results.map((e) => (
            <li
              key={e.id}
              onMouseDown={() => choose(e)}
              className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-brand-50"
            >
              <span className="flex h-8 w-14 shrink-0 items-center justify-center rounded-md bg-brand-700 font-mono text-xs font-bold text-white">
                {e.matricule}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-slate-800">
                  {e.nom} {e.prenom}
                </span>
                <span className="block truncate text-xs text-slate-500">{e.categorie}</span>
              </span>
              <span className="shrink-0 text-xs font-semibold text-slate-400">Solde : {e.solde} j</span>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <div className="mt-2 flex items-center gap-3 rounded-lg border border-brand-100 bg-brand-50 px-4 py-3">
          <span className="flex h-9 w-16 shrink-0 items-center justify-center rounded-md bg-brand-700 font-mono text-sm font-bold text-white">
            {selected.matricule}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-slate-800">
              {selected.nom} {selected.prenom}
            </p>
            <p className="truncate text-xs text-slate-500">{selected.categorie}</p>
          </div>
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-slate-400 hover:bg-white hover:text-slate-600"
          >
            Retirer
          </button>
        </div>
      )}
    </div>
  );
}