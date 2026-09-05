import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { fmtDate, fmtJours, today } from '../utils';
import BadgeType from '../components/BadgeType';
import SoldeJauge from '../components/SoldeJauge';
import PresenceHeures from '../components/PresenceHeures';
import CalendrierPresenceEmploye from '../components/CalendrierPresenceEmploye';
import { IconArrowDown, IconCalendarCheck, IconAlert } from '../components/icons';

export default function EmployeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [emp, setEmp] = useState(null);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [editError, setEditError] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const [delOpen, setDelOpen] = useState(false);
  const [delError, setDelError] = useState('');
  const [delSaving, setDelSaving] = useState(false);

  const [corrOpen, setCorrOpen] = useState(false);
  const [corrForm, setCorrForm] = useState({ nouveau_solde: '', date_operation: today(), motif: '' });
  const [corrError, setCorrError] = useState('');
  const [corrSaving, setCorrSaving] = useState(false);

  useEffect(() => {
    api.categories().then(setCategories).catch(() => {});
  }, []);

  const load = () => api.employe(id).then(setEmp).catch((e) => setError(e.message));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!emp) return <p className="py-10 text-center text-sm text-slate-500">Chargement…</p>;

  const openEdit = () => {
    setEditForm({ matricule: emp.matricule, nom: emp.nom, prenom: emp.prenom, categorie_id: emp.categorie_id, actif: !!emp.actif });
    setEditError('');
    setEditOpen(true);
  };

  const submitEdit = async (e) => {
    e.preventDefault();
    setEditError('');
    setEditSaving(true);
    try {
      await api.updateEmploye(emp.id, {
        matricule: editForm.matricule,
        nom: editForm.nom,
        prenom: editForm.prenom,
        categorie_id: Number(editForm.categorie_id),
        actif: editForm.actif,
      });
      setEditOpen(false);
      setSuccess('Fiche employé modifiée avec succès.');
      await load();
    } catch (err) {
      setEditError(err.message);
    } finally {
      setEditSaving(false);
    }
  };

  const submitDelete = async () => {
    setDelError('');
    setDelSaving(true);
    try {
      await api.deleteEmploye(emp.id);
      navigate('/employes', { state: { msg: `L'employé ${emp.nom} ${emp.prenom} (mat. ${emp.matricule}) et son historique ont été supprimés.` } });
    } catch (err) {
      setDelError(err.message);
    } finally {
      setDelSaving(false);
    }
  };

  const submitCorrection = async (e) => {
    e.preventDefault();
    setCorrError('');
    setCorrSaving(true);
    try {
      await api.correctionSolde({
        employe_id: emp.id,
        nouveau_solde: Number(corrForm.nouveau_solde),
        date_operation: corrForm.date_operation,
        motif: corrForm.motif,
      });
      setCorrOpen(false);
      setCorrForm({ nouveau_solde: '', date_operation: today(), motif: '' });
      setSuccess('Solde corrigé et tracé dans le journal des mouvements.');
      await load();
    } catch (err) {
      setCorrError(err.message);
    } finally {
      setCorrSaving(false);
    }
  };

  const corrDiff = corrForm.nouveau_solde !== '' && Number.isFinite(Number(corrForm.nouveau_solde))
    ? Math.round((Number(corrForm.nouveau_solde) - emp.solde) * 1000) / 1000
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="text-sm font-semibold text-brand-700 hover:underline">
          ← Retour
        </button>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={openEdit}>Modifier</button>
          <button className="btn-secondary" onClick={() => { setCorrError(''); setCorrOpen(true); }}>Corriger le solde</button>
          <button className="btn-secondary text-red-600 hover:bg-red-50" onClick={() => { setDelError(''); setDelOpen(true); }}>
            Supprimer
          </button>
        </div>
      </div>

      {success && <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700 ring-1 ring-emerald-200">{success}</p>}

      <div className="card flex flex-col gap-5 p-6 lg:flex-row lg:items-center">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-20 items-center justify-center rounded-xl bg-brand-700 font-mono text-lg font-bold text-white">
            {emp.matricule}
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">{emp.nom} {emp.prenom}</h2>
            <p className="text-sm text-slate-500">
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">{emp.categorie}</span>
              {' '}
              {emp.actif ? (
                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">Actif</span>
              ) : (
                <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-600">Inactif</span>
              )}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:ms-auto lg:w-[420px] w-full">
          <div className="rounded-lg bg-slate-50 p-3 text-center">
            <p className="text-[11px] font-semibold uppercase text-slate-400">Accordé</p>
            <p className="text-lg font-bold text-slate-800">{fmtJours(emp.accorde)} j</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3 text-center">
            <p className="text-[11px] font-semibold uppercase text-slate-400">Consommé</p>
            <p className="text-lg font-bold text-amber-600">{fmtJours(emp.consomme)} j</p>
          </div>
          <div className={`rounded-lg p-3 text-center ${emp.solde < 0 ? 'bg-red-50' : 'bg-emerald-50'}`}>
            <p className="text-[11px] font-semibold uppercase text-slate-400">Solde restant</p>
            <p className={`text-lg font-bold ${emp.solde < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{fmtJours(emp.solde)} j</p>
          </div>
        </div>
      </div>

      <div className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-[11px] font-semibold uppercase text-slate-400">Date de naissance</p>
          <p className="mt-1 text-base font-bold text-slate-800">{fmtDate(emp.date_naissance)}</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-[11px] font-semibold uppercase text-slate-400">Date d'embauche</p>
          <p className="mt-1 text-base font-bold text-slate-800">{fmtDate(emp.date_embauche)}</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-[11px] font-semibold uppercase text-slate-400">Années de service</p>
          <p className="mt-1 text-base font-bold text-slate-800">
            {emp.annees_service !== null && emp.annees_service !== undefined ? `${emp.annees_service} an(s)` : '—'}
          </p>
        </div>
      </div>

      <div className="card flex flex-col gap-3 border-rose-100 bg-rose-50/40 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-rose-600">Solde maladie</p>
          <p className="text-sm text-slate-600">Droit annuel : 20 jours payés. Le solde maladie est séparé du solde de congé.</p>
        </div>
        <div className="grid grid-cols-1 gap-3 xs:grid-cols-3">
          <div className="rounded-lg bg-white p-3 text-center ring-1 ring-rose-100">
            <p className="text-[11px] font-semibold uppercase text-slate-400">Accordé</p>
            <p className="text-lg font-bold text-slate-800">{fmtJours(emp.accorde_maladie)} j</p>
          </div>
          <div className="rounded-lg bg-white p-3 text-center ring-1 ring-rose-100">
            <p className="text-[11px] font-semibold uppercase text-slate-400">Consommé</p>
            <p className="text-lg font-bold text-rose-600">{fmtJours(emp.consomme_maladie)} j</p>
          </div>
          <div className={`rounded-lg p-3 text-center ring-1 ${emp.solde_maladie < 0 ? 'bg-red-50 ring-red-100' : 'bg-white ring-rose-100'}`}>
            <p className="text-[11px] font-semibold uppercase text-slate-400">Restant</p>
            <p className={`text-lg font-bold ${emp.solde_maladie < 0 ? 'text-red-600' : 'text-rose-700'}`}>{fmtJours(emp.solde_maladie)} j</p>
          </div>
        </div>
      </div>

      <div className="card p-5">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Jauge du solde</p>
        <SoldeJauge solde={emp.solde} reference={emp.accorde || 30} />
      </div>

      <PresenceHeures matricule={emp.matricule} />

      <CalendrierPresenceEmploye
        employeId={emp.id}
        matricule={emp.matricule}
        nom={emp.nom}
        prenom={emp.prenom}
      />

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-600">Historique des mouvements</h3>
          <div className="flex gap-2">
            <Link to={`/ajout-annuel?employe=${emp.id}`} className="btn-secondary">
              <IconCalendarCheck /> Ajout annuel
            </Link>
            <Link to={`/prelevement?employe=${emp.id}`} className="btn-primary">
              <IconArrowDown /> Prélèvement
            </Link>
            <Link to={`/maladie/nouvel-arret?employe=${emp.id}`} className="btn-secondary border-rose-200 text-rose-700 hover:bg-rose-50">
              Arrêt maladie
            </Link>
          </div>
        </div>
        <div className="table-wrap">
          <table className="w-max-table text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-start text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3">Jours</th>
                <th className="px-5 py-3">Solde après</th>
                <th className="px-5 py-3">Motif</th>
              </tr>
            </thead>
            <tbody>
              {emp.mouvements.map((m) => (
                <tr key={m.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-5 py-3 text-slate-600">{fmtDate(m.date_operation)}</td>
                  <td className="px-5 py-3">
                    <BadgeType type={m.type_operation} />
                    {String(m.motif || '').toLowerCase().includes('correction') && (
                      <span className="ms-1 rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-700 ring-1 ring-purple-200">Correction</span>
                    )}
                  </td>
                  <td className={`px-5 py-3 font-semibold ${m.type_operation === 'prelevement' ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {m.type_operation === 'prelevement' ? '−' : '+'}{fmtJours(m.jours)}
                  </td>
                  <td className="px-5 py-3 font-mono text-slate-700">{fmtJours(m.solde_apres)} j</td>
                  <td className="px-5 py-3 text-slate-500">{m.motif || '—'}</td>
                </tr>
              ))}
              {emp.mouvements.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-500">Aucun mouvement enregistré.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editOpen && editForm && (
        <Modal onClose={() => setEditOpen(false)} title={`Modifier l'employé — mat. ${emp.matricule}`}>
          <form onSubmit={submitEdit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="label">Matricule *</label>
                <input className="input" value={editForm.matricule} onChange={(e) => setEditForm({ ...editForm, matricule: e.target.value })} required />
              </div>
              <div>
                <label className="label">Nom *</label>
                <input className="input" value={editForm.nom} onChange={(e) => setEditForm({ ...editForm, nom: e.target.value })} required />
              </div>
              <div>
                <label className="label">Prénom *</label>
                <input className="input" value={editForm.prenom} onChange={(e) => setEditForm({ ...editForm, prenom: e.target.value })} required />
              </div>
            </div>
            <div>
              <label className="label">Catégorie professionnelle *</label>
              <select className="input" value={editForm.categorie_id} onChange={(e) => setEditForm({ ...editForm, categorie_id: e.target.value })} required>
                <option value="">Sélectionner…</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.libelle}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={editForm.actif} onChange={(e) => setEditForm({ ...editForm, actif: e.target.checked })} />
              Employé actif (changement de statut)
            </label>
            {editError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{editError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setEditOpen(false)}>Annuler</button>
              <button className="btn-primary" disabled={editSaving}>{editSaving ? 'Enregistrement…' : 'Enregistrer'}</button>
            </div>
          </form>
        </Modal>
      )}

      {corrOpen && (
        <Modal onClose={() => setCorrOpen(false)} title={`Corriger le solde de congé — ${emp.nom} ${emp.prenom}`}>
          <form onSubmit={submitCorrection} className="space-y-4">
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
              Solde courant : {fmtJours(emp.solde)} j.
              <br />
              Saisissez le nouveau solde cible. La différence sera ajoutée ou prélevée automatiquement et tracée dans le journal.
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Nouveau solde (en jours) *</label>
                <input
                  type="number"
                  className="input"
                  step="0.5"
                  min="0"
                  value={corrForm.nouveau_solde}
                  onChange={(e) => setCorrForm({ ...corrForm, nouveau_solde: e.target.value })}
                  placeholder={String(emp.solde)}
                  required
                />
              </div>
              <div>
                <label className="label">Date de la correction *</label>
                <input type="date" className="input" value={corrForm.date_operation} onChange={(e) => setCorrForm({ ...corrForm, date_operation: e.target.value })} required />
              </div>
            </div>
            <div>
              <label className="label">Motif de la correction</label>
              <textarea className="input" rows={2} value={corrForm.motif} onChange={(e) => setCorrForm({ ...corrForm, motif: e.target.value })} placeholder="Ex. Erreur de saisie du solde initial" />
            </div>
            {corrDiff !== null && corrDiff !== 0 && (
              <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">
                {corrDiff > 0
                  ? `Le solde sera augmenté de ${fmtJours(corrDiff)} j (ajout) pour atteindre ${fmtJours(Number(corrForm.nouveau_solde))} j.`
                  : `Le solde sera diminué de ${fmtJours(Math.abs(corrDiff))} j (prélèvement) pour atteindre ${fmtJours(Number(corrForm.nouveau_solde))} j.`}
              </p>
            )}
            {corrError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{corrError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setCorrOpen(false)}>Annuler</button>
              <button className="btn-primary" disabled={corrSaving}>{corrSaving ? 'Correction…' : 'Appliquer la correction'}</button>
            </div>
          </form>
        </Modal>
      )}

      {delOpen && (
        <Modal onClose={() => setDelOpen(false)} title="Supprimer l'employé" danger>
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              <span className="mt-0.5 shrink-0"><IconAlert /></span>
              <p>
                Vous êtes sur le point de supprimer <strong>{emp.nom} {emp.prenom}</strong> (mat. {emp.matricule}).
                <br />
                <strong>Cette action est irréversible</strong>
                : l'employé et tout son historique de mouvements seront définitivement supprimés.
              </p>
            </div>
            {delError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{delError}</p>}
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setDelOpen(false)}>Annuler</button>
              <button className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700" disabled={delSaving} onClick={submitDelete}>
                {delSaving ? 'Suppression…' : 'Confirmer la suppression'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, children, onClose, danger }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overscroll-contain bg-slate-900/40 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:p-4" onMouseDown={onClose}>
      <div className="card modal-shell w-full max-w-lg p-4 sm:p-6" onMouseDown={(e) => e.stopPropagation()}>
        <div className={`mb-4 flex items-center justify-between ${danger ? 'text-red-700' : 'text-slate-900'}`}>
          <h3 className="text-base font-bold">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}