import { useEffect, useState } from 'react';
import { api } from '../api';
import EmployePicker from '../components/EmployePicker';

export default function FicheIndemnites() {
  const [id, setId] = useState('');
  const [employe, setEmploye] = useState(null);
  const [grille, setGrille] = useState([]);
  useEffect(() => { api.grilleSalaire().then(setGrille).catch(()=>{}); }, []);
  useEffect(() => {
    if (!id) { setEmploye(null); return; }
    api.employe(id).then(setEmploye).catch(()=>setEmploye(null));
  }, [id]);
  const lignes = employe ? grille.filter(g => g.rubrique === employe.rubrique || !employe.rubrique) : [];
  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">Fiche Signalétique — Consultation Détaillée Indemnités</div>
      <div className="card p-4">
        <label className="label">Choisir un employé</label>
        <EmployePicker value={id} onChange={setId} />
      </div>
      {!employe && <p className="text-sm text-slate-500">Sélectionnez un employé pour afficher le détail de ses indemnités.</p>}
      {employe && (
        <div className="card p-4">
          <h3 className="font-bold text-slate-800">{employe.nom} {employe.prenom} — Mat. {employe.matricule}</h3>
          <p className="text-xs text-slate-500">{employe.rubrique} / {employe.grade} / {employe.classe} / {employe.echelon}</p>
          <div className="mt-3 table-wrap">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-slate-50 text-xs font-semibold text-slate-500"><th className="px-3 py-2">Rubrique</th><th className="px-3 py-2">Grade</th><th className="px-3 py-2">Classe</th><th className="px-3 py-2">Echelon</th><th className="px-3 py-2 text-end">Valeur</th></tr></thead>
              <tbody>
                {lignes.length===0 ? <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400">Aucune ligne correspondante dans la Grille de Salaire.</td></tr> :
                lignes.map(l=> <tr key={l.id} className="border-b hover:bg-slate-50"><td className="px-3 py-2">{l.rubrique}</td><td className="px-3 py-2">{l.grade}</td><td className="px-3 py-2">{l.classe}</td><td className="px-3 py-2">{l.echelon}</td><td className="px-3 py-2 text-end font-mono">{Number(l.valeur).toLocaleString('fr-FR',{minimumFractionDigits:3})}</td></tr>)}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
