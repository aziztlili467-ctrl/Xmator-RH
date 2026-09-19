import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { MOIS } from '../utils';
import { IconPlus, IconTrash, IconCreditCard, IconBanknotes } from './icons';
import EmployeeCreditAssignmentModal from './EmployeeCreditAssignmentModal';

const fmtDT = (n) => (Number.isFinite(Number(n))
  ? Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) : '0,000');

function libelleMois(s) {
  const [a, m] = String(s || '').split('-').map(Number);
  if (!a || !m) return '—';
  return `${MOIS[m - 1]} ${a}`;
}

function libelleStatut(s) {
  return ({ en_cours: 'En cours', solde: 'Soldé', annule: 'Annulé' })[s] || s || '—';
}

export default function EmployeeCreditTab({ employe }) {
  const [contrats, setContrats] = useState([]);
  const [ouvert, setOuvert] = useState(null);
  const [modalOuverte, setModalOuverte] = useState(false);
  const [annuleCible, setAnnuleCible] = useState(null);
  const [supprCible, setSupprCible] = useState(null);
  const [msg, setMsg] = useState(null);
  const [charging, setCharging] = useState(true);

  const charger = useCallback(() => {
    if (!employe?.id) { setContrats([]); setCharging(false); return; }
    setCharging(true);
    api.creditContrats({ employe_id: employe.id })
      .then((d) => setContrats(d?.contrats || []))
      .catch((e) => setMsg({ type: 'err', texte: e.message || 'Impossible de charger les crédits.' }))
      .finally(() => setCharging(false));
  }, [employe?.id]);

  useEffect(() => { charger(); }, [charger]);

  const stats = useMemo(() => {
    const actifs = contrats.filter((c) => c.statut === 'en_cours');
    const paye = contrats.reduce((s, c) => s + Number(c.echeances?.filter((e) => e.statut === 'paye').reduce((x, e) => x + e.montant, 0) || 0), 0);
    const crd = actifs.reduce((s, c) => s + (Number(c.total_retenu) - Number(c.echeances?.filter((e) => e.statut === 'paye').reduce((x, e) => x + e.montant, 0) || 0)), 0);
    const restantes = actifs.reduce((s, c) => s + c.echeances?.filter((e) => e.statut === 'prevu').length, 0);
    const totalAccorde = contrats
      .filter((c) => c.statut !== 'annule')
      .reduce((s, c) => s + Number(c.montant_actuel) || 0, 0);
    return { totalAccorde, paye, crd, restantes };
  }, [contrats]);

  const payer = async (eid, direction) => {
    try {
      if (direction === 'paye') await api.creditEcheancePayer(eid.contrat_id, eid.id);
      else await api.creditEcheanceDepayer(eid.contrat_id, eid.id);
      setMsg({ type: 'ok', texte: 'Échéance mise à jour.' });
      charger();
    } catch (e) {
      setMsg({ type: 'err', texte: e.message || 'Échec de la mise à jour de l\'échéance.' });
    } finally {
      setTimeout(() => setMsg(null), 3000);
    }
  };

  const annuler = async () => {
    try {
      await api.creditAnnuler(annuleCible);
      setMsg({ type: 'ok', texte: 'Contrat annulé. Les échéances restantes ont été annulées.' });
      setAnnuleCible(null);
      charger();
    } catch (e) {
      setMsg({ type: 'err', texte: e.message || 'Échec de l\'annulation.' });
    } finally {
      setTimeout(() => setMsg(null), 3000);
    }
  };

  const supprimer = async () => {
    try {
      await api.creditSupprimerContrat(supprCible);
      setMsg({ type: 'ok', texte: 'Contrat supprimé.' });
      setSupprCible(null);
      charger();
    } catch (e) {
      setMsg({ type: 'err', texte: e.message || 'Échec de la suppression.' });
    } finally {
      setTimeout(() => setMsg(null), 3000);
    }
  };

  return (
    <div className="card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-800">Crédits &amp; Avances — {employe?.nom} {employe?.prenom}</h3>
        <button type="button" className="btn-primary" onClick={() => setModalOuverte(true)}>
          <span className="inline-flex items-center gap-1.5"><IconPlus /> Octroyer un crédit</span>
        </button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-[10px] uppercase text-slate-400">Total accordé</p>
          <p className="text-sm font-bold text-slate-800">{fmtDT(stats.totalAccorde)} DT</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-[10px] uppercase text-slate-400">Remboursé</p>
          <p className="text-sm font-bold text-emerald-700">{fmtDT(stats.paye)} DT</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-[10px] uppercase text-slate-400">Cap restant dû (CRD)</p>
          <p className={`text-sm font-bold ${stats.crd > 0 ? 'text-red-700' : 'text-slate-800'}`}>{fmtDT(stats.crd)} DT</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-[10px] uppercase text-slate-400">Échéances restantes</p>
          <p className="text-sm font-bold text-slate-800">{stats.restantes}</p>
        </div>
      </div>

      {msg && (
        <div className={`mb-3 rounded-md px-3 py-2 text-sm ${msg.type === 'err' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
          {msg.texte}
        </div>
      )}

      {charging && !contrats.length ? (
        <p className="py-6 text-center text-sm text-slate-400">Chargement…</p>
      ) : !contrats.length ? (
        <p className="py-6 text-center text-sm text-slate-400">
          <IconCreditCard /> Aucun crédit ou avance pour cet employé.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[10px] uppercase text-slate-400">
                <th className="px-2 py-1.5">Type</th>
                <th className="px-2 py-1.5">Date octroi</th>
                <th className="px-2 py-1.5 text-end">Capital</th>
                <th className="px-2 py-1.5 text-end">Mensualité</th>
                <th className="px-2 py-1.5 text-end">CRD</th>
                <th className="px-2 py-1.5 text-center">Statut</th>
                <th className="px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {contrats.map((c) => {
                const payees = c.echeances?.filter((e) => e.statut === 'paye') || [];
                const crd = Number(c.total_retenu) - payees.reduce((s, e) => s + Number(e.montant) || 0, 0);
                const ouvertBool = ouvert === c.id;
                return (
                  <Fragment key={c.id}>
                    <tr className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-2 py-2 font-medium text-slate-700">{c.type_nom}</td>
                      <td className="px-2 py-2 text-slate-600">{c.date_octroi ? c.date_octroi.split('T')[0] : '—'}</td>
                      <td className="px-2 py-2 text-end text-slate-700">{fmtDT(c.montant_actuel)}</td>
                      <td className="px-2 py-2 text-end text-slate-700">{fmtDT(c.mensualite)}</td>
                      <td className="px-2 py-2 text-end font-bold text-red-700">{c.statut === 'annule' ? '—' : fmtDT(Math.max(crd, 0))}</td>
                      <td className="px-2 py-2 text-center">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${c.statut === 'en_cours' ? 'bg-amber-100 text-amber-700' : c.statut === 'solde' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                          {libelleStatut(c.statut)}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-end">
                        <div className="inline-flex items-center gap-1">
                          <button type="button" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                            title={ouvertBool ? 'Fermer l\'échéancier' : 'Voir l\'échéancier'} onClick={() => setOuvert(ouvertBool ? null : c.id)}>
                            {ouvertBool ? <ChevronDown /> : <ChevronRight />}
                          </button>
                          {c.statut === 'en_cours' && (
                            <button type="button" className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600" title="Annuler le contrat"
                              onClick={() => setAnnuleCible(c.id)}><IconXSmall /></button>
                          )}
                          {c.statut !== 'en_cours' && (
                            <button type="button" className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Supprimer"
                              onClick={() => setSupprCible(c.id)}><IconTrash /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {ouvertBool && (
                      <tr className="border-b border-slate-100 bg-slate-50/60">
                        <td colSpan={7} className="px-3 py-2">
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            {c.echeances?.map((e) => (
                              <div key={e.id} className={`rounded-md border p-2 ${e.statut === 'paye' ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                                <p className="text-[10px] text-slate-500">{libelleMois(e.annee_mois)}</p>
                                <p className="text-xs font-semibold text-slate-700">{fmtDT(e.montant)} DT</p>
                                <span className={`inline-block rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${e.statut === 'paye' ? 'bg-emerald-200 text-emerald-800' : 'bg-amber-200 text-amber-800'}`}>
                                  {e.statut === 'paye' ? 'Payée' : e.statut === 'annule' ? 'Annulée' : 'Prévue'}
                                </span>
                                {e.statut === 'prevu' ? (
                                  <button type="button" className="mt-1 block text-[10px] font-semibold text-emerald-600 hover:text-emerald-800" onClick={() => payer({ contrat_id: c.id, id: e.id }, 'paye')}>
                                    Marquer payée
                                  </button>
                                ) : e.statut === 'paye' ? (
                                  <button type="button" className="mt-1 block text-[10px] font-semibold text-slate-500 hover:text-slate-700" onClick={() => payer({ contrat_id: c.id, id: e.id }, 'depaye')}>
                                    Rétablir
                                  </button>
                                ) : null}
                              </div>
                            ))}
                            {!c.echeances?.length && <p className="col-span-full text-xs text-slate-400">Aucune échéance générée.</p>}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modalOuverte && (
        <EmployeeCreditAssignmentModal employe={employe} onClose={() => setModalOuverte(false)} onSaved={() => { setModalOuverte(false); charger(); }} />
      )}

      {annuleCible && (
        <ConfirmModal title="Annuler ce contrat ?" onClose={() => setAnnuleCible(null)} onConfirm={annuler}
          texte="Les échéances restantes seront annulées ; l'historique des paiements déjà effectués est conservé." />
      )}
      {supprCible && (
        <ConfirmModal title="Supprimer ce contrat ?" onClose={() => setSupprCible(null)} onConfirm={supprimer} danger
          texte="Toutes les échéances et le contrat seront définitivement supprimés (action irréversible)." />
      )}
    </div>
  );
}

function IconXSmall() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

function ChevronDown() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function ConfirmModal({ title, texte, onClose, onConfirm, danger }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="card modal-shell w-full max-w-sm p-4 sm:p-6" onMouseDown={(e) => e.stopPropagation()}>
        <Banknotes />
        <h2 className="mb-1 text-sm font-bold text-slate-800">{title}</h2>
        <p className="mb-4 text-xs text-slate-500">{texte}</p>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Annuler</button>
          <button type="button" className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm}>Confirmer</button>
        </div>
      </div>
    </div>
  );
}

function Banknotes() {
  return <div className="mb-2"><IconBanknotes /></div>;
}