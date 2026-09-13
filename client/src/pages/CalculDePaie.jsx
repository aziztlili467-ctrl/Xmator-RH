import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { IconCalculator, IconFilter, IconUserCheck, IconClipboardList } from '../components/icons';
import BulletinDePaie from '../components/BulletinDePaie';

const fmtNombre = (n) => {
  const v = Number(n) || 0;
  return v.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
};

export default function CalculDePaie() {
  const [employes, setEmployes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filtre, setFiltre] = useState('');
  const [selId, setSelId] = useState(null);

  useEffect(() => {
    let mort = false;
    api.employes()
      .then((rows) => { if (!mort) setEmployes(Array.isArray(rows) ? rows : []); })
      .catch((e) => { if (!mort) setError(e.message || 'Une erreur est survenue.'); })
      .finally(() => { if (!mort) setLoading(false); });
    return () => { mort = true; };
  }, []);

  const trie = useMemo(
    () => [...employes].sort((a, b) => {
      const diff = (Number(a.matricule) || 0) - (Number(b.matricule) || 0);
      return diff !== 0 ? diff : String(a.matricule).localeCompare(String(b.matricule));
    }),
    [employes]
  );

  const filtres = useMemo(() => {
    const f = filtre.trim().toLowerCase();
    if (!f) return trie;
    const exacts = trie.filter((e) => String(e.matricule).toLowerCase() === f);
    return (exacts.length ? exacts : trie).filter((e) =>
      String(e.matricule).toLowerCase().startsWith(f) ||
      String(e.nom || '').toLowerCase().includes(f) ||
      String(e.prenom || '').toLowerCase().includes(f) ||
      `${e.nom} ${e.prenom}`.toLowerCase().includes(f)
    );
  }, [trie, filtre]);

  useEffect(() => {
    if (filtre.trim() && String(filtre).trim() === String(filtres[0]?.matricule || '').trim() && filtres.length === 1) {
      setSelId(filtres[0].id);
    }
  }, [filtres, filtre]);

  const selection = useMemo(() => employes.find((e) => String(e.id) === String(selId)) || null, [employes, selId]);

  const synchro = useMemo(() => selection ? {
    'Salaire de base (Grille de salaire)': Number(selection.salaire_base) || 0,
    'Indemnité de présence (Indemnités F&V)': Number(selection.fv_presence) || 0,
    'Indemnité de transport (Indemnités F&V)': Number(selection.fv_transport) || 0,
    'Indemnité de fonction (Fiche employé)': Number(selection.indemnite_fonction) || 0,
  } : null, [selection]);

  const brutEstime = useMemo(() => synchro ? Object.values(synchro).reduce((s, v) => s + v, 0) : 0, [synchro]);

  const employeBulletin = useMemo(() => selection ? {
    matricule: String(selection.matricule),
    nom: `${selection.nom || ''} ${selection.prenom || ''}`.trim(),
    cnss: selection.cnss || '',
    qualification: selection.intitule_poste || selection.categorie || '',
    affectation: selection.departement || '',
    situationFamille: selection.situation_familiale || '',
    categorieEchelon: [
      selection.categorie,
      selection.grade ? `Grd. ${selection.grade}` : '',
      selection.classe ? `Cl. ${selection.classe}` : '',
      selection.echelon ? `Éch. ${selection.echelon}` : '',
    ].filter(Boolean).join(' / '),
    situationAdmin: selection.actif ? 'Titulaire' : 'Non actif',
  } : null, [selection]);

  const montants = useMemo(() => selection ? {
    '5011': Number(selection.salaire_base) || 0,
    '10011': Number(selection.fv_presence) || 0,
    '10021': Number(selection.fv_transport) || 0,
    '25011': Number(selection.indemnite_fonction) || 0,
  } : null, [selection]);

  const d = new Date();
  const moisActuel = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="print:hidden flex items-start justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Calcul de Paie</h2>
          <p className="text-sm text-slate-500">
            Sélectionnez un employé par matricule : sa fiche, son salaire de base (grille) et ses indemnités
            (présence, transport, fonction) sont synchronisés automatiquement, puis le bulletin calcule le
            salaire brut jusqu'au salaire net. Seules les lignes avec des valeurs sont affichées.
          </p>
        </div>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}

      {loading ? (
        <div className="card p-10 text-center text-sm text-slate-400">Chargement des employés…</div>
      ) : (
        <>
          {/* Sélection par matricule */}
          <div className="print:hidden card p-4">
            <p className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
              <IconFilter /> Filtrage par matricule — {trie.length} employé(s), période F&V : {moisActuel}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="input w-full sm:max-w-xs"
                placeholder="Matricule ou nom… Ex : 0042, BEN"
                value={filtre}
                onChange={(e) => { setFiltre(e.target.value); }}
              />
              <select className="input sm:min-w-[300px]" value={selId ?? ''} onChange={(e) => setSelId(e.target.value || null)} disabled={filtres.length === 0}>
                <option value="">— Choisissez un employé —</option>
                {filtres.map((e) => (
                  <option key={e.id} value={e.id}>
                    {String(e.matricule).padStart(4, '0')} — {e.nom} {e.prenom} ({e.categorie || 'sans catégorie'})
                  </option>
                ))}
              </select>
              {filtres.length === 0 && <span className="text-xs text-red-600">Aucun employé ne correspond au filtre.</span>}
            </div>
            {filtre.trim() && filtres.length === 1 && (
              <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                <IconUserCheck /> Matricule identifié : {filtres[0].nom} {filtres[0].prenom} — données synchronisées automatiquement.
              </p>
            )}
          </div>

          {selection && synchro && (
            <>
              {/* Données synchronisées */}
              <div className="print:hidden card overflow-hidden">
                <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/60 px-4 py-3">
                  <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-700">
                    <IconClipboardList /> Données insérées automatiquement — Mat. {String(selection.matricule).padStart(4, '0')}
                  </p>
                  <span className="text-xs text-slate-500">
                    <b className="text-slate-700">{fmtNombre(brutEstime)}</b> DT — salaire brut estimé
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-px bg-slate-200 sm:grid-cols-3 lg:grid-cols-4">
                  {Object.entries(synchro).map(([label, valeur]) => (
                    <div key={label} className="bg-white px-4 py-3">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
                      <p className="mt-1 text-sm font-bold text-slate-800">{fmtNombre(valeur)} <span className="text-[10px] font-normal text-slate-400">DT</span></p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Fiche de paie calculée */}
              <BulletinDePaie
                key={selection.id}
                employe={employeBulletin}
                montants={montants}
                masquerSansValeur
                chefFamille={/mari|divorc|veuf/i.test(selection.situation_familiale || '')}
                nbEnfants={Number(selection.nombre_enfants) || 0}
              />
            </>
          )}

          {!selection && !loading && (
            <div className="card p-10 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                <IconCalculator />
              </div>
              <p className="mt-3 text-sm font-bold uppercase tracking-wide text-slate-700">Aucun employé sélectionné</p>
              <p className="mt-1 text-sm text-slate-500">
                Filtrez par matricule ou choisissez un employé dans la liste : la fiche de paie se génère automatiquement.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}