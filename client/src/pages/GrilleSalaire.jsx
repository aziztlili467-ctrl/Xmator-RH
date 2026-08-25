import { useEffect, useState, useRef } from 'react';
import { api } from '../api';
import { IconSettings, IconTrash, IconEdit, IconUpload, IconDownload } from '../components/icons';

export default function GrilleSalaire() {
  const [lignes, setLignes] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Formulaire création / édition
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [fRubrique, setFRubrique] = useState('');
  const [fGrade, setFGrade] = useState('');
  const [fClasse, setFClasse] = useState('');
  const [fEchelon, setFEchelon] = useState('');
  const [fValeur, setFValeur] = useState('');
  const [saving, setSaving] = useState(false);

  // Suppression
  const [delTarget, setDelTarget] = useState(null);
  const [delSaving, setDelSaving] = useState(false);

  // Import
  const [importBusy, setImportBusy] = useState(false);
  const importRef = useRef(null);

  const load = () => api.grilleSalaire().then(setLignes).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  // --- Valeurs uniques pour suggestions ---
  const rubriques = [...new Set(lignes.map((l) => l.rubrique))].sort();
  const grades = [...new Set(lignes.map((l) => l.grade))].sort();
  const classes = [...new Set(lignes.map((l) => l.classe))].sort();
  const echelons = [...new Set(lignes.map((l) => l.echelon))].sort();

  // --- Helpers ---
  const resetForm = () => {
    setFRubrique(''); setFGrade(''); setFClasse(''); setFEchelon(''); setFValeur('');
    setEditTarget(null);
  };

  const ouvrirCreation = () => {
    setError(''); resetForm(); setFormOpen(true);
  };

  const ouvrirModification = (l) => {
    setError('');
    setEditTarget(l);
    setFRubrique(l.rubrique);
    setFGrade(l.grade);
    setFClasse(l.classe);
    setFEchelon(l.echelon);
    setFValeur(String(l.valeur));
    setFormOpen(true);
  };

  const soumettre = async (e) => {
    e.preventDefault();
    if (!fRubrique.trim() || !fGrade.trim() || !fClasse.trim() || !fEchelon.trim()) {
      return setError('Tous les champs sont requis.');
    }
    setSaving(true); setError(''); setSuccess('');
    try {
      const body = {
        rubrique: fRubrique.trim(),
        grade: fGrade.trim(),
        classe: fClasse.trim(),
        echelon: fEchelon.trim(),
        valeur: Number(fValeur) || 0,
      };
      if (editTarget) {
        await api.grilleSalaireModifier(editTarget.id, body);
        setSuccess('Ligne modifiée avec succès.');
      } else {
        await api.grilleSalaireCreer(body);
        setSuccess('Nouvelle ligne créée avec succès.');
      }
      setFormOpen(false); resetForm();
      load();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const supprimer = async () => {
    if (!delTarget) return;
    setDelSaving(true); setError(''); setSuccess('');
    try {
      await api.grilleSalaireSupprimer(delTarget.id);
      setSuccess('Ligne supprimée.');
      setDelTarget(null);
      load();
    } catch (err) { setError(err.message); }
    finally { setDelSaving(false); }
  };

  const gererImport = async (e) => {
    const fichier = e.target.files[0];
    if (!fichier) return;
    const ok = window.confirm(
      `Importer le fichier « ${fichier.name} » ?\n\n` +
      'Format attendu (séparateur ;) :\n' +
      'Rubrique;Grade;Classe;Echelon;Valeur\n' +
      'Personnel;Cadre;A;1;150000\n\n' +
      'Les lignes existantes ne sont PAS supprimées. Les doublons sont ajoutés en double.'
    );
    if (!ok) { e.target.value = ''; return; }
    setImportBusy(true); setError(''); setSuccess('');
    try {
      const r = await api.grilleSalaireImporter(fichier);
      setSuccess(r.message);
      if (r.erreurs > 0) {
        const details = r.detailsErreurs.slice(0, 5).map((e) => `Ligne ${e.ligne} : ${e.erreur}`).join('\n');
        setError(`${r.erreurs} erreur(s) ignorée(s) :\n${details}${r.erreurs > 5 ? `\n… et ${r.erreurs - 5} autre(s).` : ''}`);
      }
      load();
    } catch (err) { setError(err.message); }
    finally { setImportBusy(false); e.target.value = ''; }
  };

  const telecharger = async () => {
    try { await api.grilleSalaireExporter(); }
    catch (err) { setError(err.message); }
  };

  // Grouper par rubrique pour affichage
  const parRubrique = {};
  lignes.forEach((l) => {
    if (!parRubrique[l.rubrique]) parRubrique[l.rubrique] = [];
    parRubrique[l.rubrique].push(l);
  });

  const fmtValeur = (v) => {
    if (v == null) return '—';
    return Number(v).toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  };

  return (
    <div className="space-y-6">
        <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Grille de Salaire</h2>
          <p className="text-sm text-slate-500">
            Paramétrez la grille salariale par Rubrique, Grade, Classe, Echelon et Valeur. Chaque ligne est enregistrée en base et consultable par tous les super_admin.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={importRef}
            type="file"
            accept=".csv,.txt,.tsv"
            className="hidden"
            onChange={gererImport}
          />
          <button
            className="btn-secondary"
            onClick={() => importRef.current?.click()}
            disabled={importBusy}
          >
            <IconUpload /> {importBusy ? 'Import…' : 'Importer les lignes (CSV ou TXT)'}
          </button>
          <button className="btn-secondary" onClick={telecharger}>
            <IconDownload /> Télécharger les lignes (CSV)
          </button>
          <button className="btn-primary" onClick={ouvrirCreation}>
            <IconSettings /> Nouvelle ligne
          </button>
        </div>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}
      {success && <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700 ring-1 ring-emerald-200">{success}</p>}

      {/* Formulaire création / édition */}
      {formOpen && (
        <div className="card border-blue-200 p-6">
          <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-blue-600">
            {editTarget ? 'Modifier la ligne' : 'Nouvelle ligne de grille'}
          </h3>
          <form onSubmit={soumettre} className="grid gap-4 sm:grid-cols-5">
            <div>
              <label className="label">Rubrique</label>
              <input
                className="input"
                value={fRubrique}
                onChange={(e) => setFRubrique(e.target.value)}
                placeholder="ex. Personnel"
                list="lst-rubriques"
                required
              />
              <datalist id="lst-rubriques">
                {rubriques.map((r) => <option key={r} value={r} />)}
              </datalist>
            </div>
            <div>
              <label className="label">Grade</label>
              <input
                className="input"
                value={fGrade}
                onChange={(e) => setFGrade(e.target.value)}
                placeholder="ex. Cadre"
                list="lst-grades"
                required
              />
              <datalist id="lst-grades">
                {grades.map((g) => <option key={g} value={g} />)}
              </datalist>
            </div>
            <div>
              <label className="label">Classe</label>
              <input
                className="input"
                value={fClasse}
                onChange={(e) => setFClasse(e.target.value)}
                placeholder="ex. A"
                list="lst-classes"
                required
              />
              <datalist id="lst-classes">
                {classes.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div>
              <label className="label">Echelon</label>
              <input
                className="input"
                value={fEchelon}
                onChange={(e) => setFEchelon(e.target.value)}
                placeholder="ex. 1"
                list="lst-echelons"
                required
              />
              <datalist id="lst-echelons">
                {echelons.map((e) => <option key={e} value={e} />)}
              </datalist>
            </div>
            <div>
              <label className="label">Valeur (DT)</label>
              <input
                className="input"
                type="number"
                step="0.001"
                min="0"
                value={fValeur}
                onChange={(e) => setFValeur(e.target.value)}
                placeholder="0.000"
                required
              />
            </div>
            <div className="flex items-end gap-2 sm:col-span-5">
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Enregistrement…' : editTarget ? 'Enregistrer les modifications' : 'Ajouter à la grille'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => { setFormOpen(false); resetForm(); }}>
                Annuler
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tableau des lignes enregistrées */}
      <div className="card overflow-hidden">
        <div className="border-b border-slate-200 px-6 py-4">
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">
            Lignes enregistrées ({lignes.length})
          </h3>
        </div>
        {lignes.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate-400">
            Aucune ligne de grille de salaire pour le moment. Cliquez sur « Nouvelle ligne » pour commencer.
          </div>
        ) : (
          <div className="table-wrap">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-start text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Rubrique</th>
                  <th className="px-4 py-3">Grade</th>
                  <th className="px-4 py-3">Classe</th>
                  <th className="px-4 py-3">Echelon</th>
                  <th className="px-4 py-3 text-end">Valeur (DT)</th>
                  <th className="px-4 py-3 text-end">Actions</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(parRubrique).map(([rub, items]) => (
                  items.map((l, idx) => (
                    <tr key={l.id} className="border-b border-slate-100 hover:bg-slate-50">
                      {idx === 0 ? (
                        <td
                          className="px-4 py-2.5 font-semibold text-slate-800 align-top"
                          rowSpan={items.length}
                        >
                          {l.rubrique}
                        </td>
                      ) : null}
                      <td className="px-4 py-2.5 text-slate-700">{l.grade}</td>
                      <td className="px-4 py-2.5 text-slate-700">{l.classe}</td>
                      <td className="px-4 py-2.5 text-slate-700">{l.echelon}</td>
                      <td className="px-4 py-2.5 text-end font-mono text-slate-800">{fmtValeur(l.valeur)}</td>
                      <td className="px-4 py-2.5 text-end">
                        <button
                          className="me-3 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
                          onClick={() => ouvrirModification(l)}
                        >
                          <IconEdit /> Modifier
                        </button>
                        <button
                          className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:underline"
                          onClick={() => setDelTarget(l)}
                        >
                          <IconTrash /> Supprimer
                        </button>
                      </td>
                    </tr>
                  ))
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Boîte de confirmation suppression */}
      {delTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-red-200 bg-white p-6 shadow-xl">
            <div className="mb-3 flex items-start gap-3">
              <span className="mt-0.5 text-red-600"><IconTrash /></span>
              <div>
                <h3 className="text-lg font-bold text-red-700">Supprimer cette ligne</h3>
                <p className="text-sm text-slate-700">
                  <strong>{delTarget.rubrique}</strong> / {delTarget.grade} / {delTarget.classe} / {delTarget.echelon} — {fmtValeur(delTarget.valeur)} DT
                </p>
              </div>
            </div>
            <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
              Cette action est <b>irréversible</b>.
            </p>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setDelTarget(null)} disabled={delSaving}>Annuler</button>
              <button
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={supprimer}
                disabled={delSaving}
              >
                {delSaving ? 'Suppression…' : 'Confirmer la suppression'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
