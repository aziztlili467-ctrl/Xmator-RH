import { useEffect, useState } from 'react';
import { api } from '../api';
import { IconMonitor, IconSmartphone, IconTablet } from '../components/icons';

// Page « Appareils connectés » (super_admin) : UNE LIGNE PAR APPAREIL (identifiant unique du
// navigateur/app installée — équivalent web de l'adresse MAC), toutes ses sessions agrégées.
// Statut temps réel (vert = au moins une session active / rouge sinon), export PDF par période,
// suppression de l'historique.

function fmtDateTime(iso) {
  if (!iso) return '—';
  return String(iso).replace('T', ' ');
}

function fmtDuree(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  const p = (n) => String(n).padStart(2, '0');
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${p(h)}:${p(m)}:${p(ss)}`;
}

function idCourt(id) {
  if (!id) return '(sans identifiant)';
  return id.length > 18 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id;
}

function IconeAppareil({ type }) {
  if (type === 'mobile') return <IconSmartphone />;
  if (type === 'tablette') return <IconTablet />;
  return <IconMonitor />;
}

export default function AppareilsConnectes() {
  const [lignes, setLignes] = useState([]);
  const [totaux, setTotaux] = useState(null);
  const [statut, setStatut] = useState('');
  const [type, setType] = useState('');
  const [utilisateur, setUtilisateur] = useState('');
  const [debut, setDebut] = useState('');
  const [fin, setFin] = useState('');
  const [chargement, setChargement] = useState(false);
  const [confirmSuppression, setConfirmSuppression] = useState(false);
  const [msg, setMsg] = useState('');
  // Horloge : la durée des appareils connectés avance chaque seconde
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const filtresActifs = () => {
    const params = {};
    if (statut) params.statut = statut;
    if (type) params.type = type;
    if (utilisateur.trim()) params.utilisateur = utilisateur.trim();
    if (debut) params.debut = debut;
    if (fin) params.fin = fin;
    return params;
  };

  const charger = async () => {
    setChargement(true);
    try {
      const d = await api.appareilsConnectes(filtresActifs());
      setLignes(d.lignes || []);
      setTotaux(d.totaux || null);
    } catch { /* silencieux */ } finally {
      setChargement(false);
    }
  };

  useEffect(() => { charger(); }, [statut, type]);
  // Rafraîchissement automatique toutes les 10 s
  useEffect(() => {
    const t = setInterval(charger, 10 * 1000);
    return () => clearInterval(t);
  }, [statut, type, utilisateur, debut, fin]);

  const exporterPdf = () => {
    try { api.appareilsPdf(filtresActifs()); } catch { /* silencieux */ }
  };

  const supprimerHistorique = async () => {
    try {
      const r = await api.appareilsSupprimerHistorique(debut || fin ? { debut, fin } : {});
      setMsg(`Historique supprimé : ${r.supprimees} session(s).`);
      setConfirmSuppression(false);
      charger();
    } catch (e) {
      setMsg(e.message || 'Suppression impossible.');
      setConfirmSuppression(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Appareils connectés</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Un appareil = une ligne (identifié par son identifiant unique, équivalent MAC web) avec toutes ses sessions agrégées. Statut en temps réel, rafraîchissement automatique toutes les 10 s.
        </p>
      </div>

      {/* Cartes de synthèse */}
      {totaux && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <div className="card p-4"><p className="text-xs text-slate-500">Appareils</p><p className="text-2xl font-black text-slate-900">{totaux.appareils}</p></div>
          <div className="card p-4"><p className="text-xs text-slate-500">Sessions</p><p className="text-2xl font-black text-slate-900">{totaux.sessions}</p></div>
          <div className="card p-4"><p className="text-xs text-slate-500">Connectés</p><p className="text-2xl font-black text-emerald-600">{totaux.connectes}</p></div>
          <div className="card p-4"><p className="text-xs text-slate-500">PC</p><p className="text-2xl font-black text-slate-900">{totaux.pc}</p></div>
          <div className="card p-4"><p className="text-xs text-slate-500">Mobiles</p><p className="text-2xl font-black text-slate-900">{totaux.mobile}</p></div>
          <div className="card p-4"><p className="text-xs text-slate-500">Tablettes</p><p className="text-2xl font-black text-slate-900">{totaux.tablette}</p></div>
        </div>
      )}

      {/* Filtres + actions */}
      <div className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-3 xl:grid-cols-7">
        <div>
          <label className="label">Statut</label>
          <select className="input" value={statut} onChange={(e) => setStatut(e.target.value)}>
            <option value="">Tous</option>
            <option value="connecte">🟢 Connecté</option>
            <option value="deconnecte">🔴 Déconnecté</option>
          </select>
        </div>
        <div>
          <label className="label">Type d'appareil</label>
          <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Tous les types</option>
            <option value="pc">PC</option>
            <option value="mobile">Mobile</option>
            <option value="tablette">Tablette</option>
            <option value="autre">Autre</option>
          </select>
        </div>
        <div>
          <label className="label">Utilisateur (login)</label>
          <input className="input" value={utilisateur} onChange={(e) => setUtilisateur(e.target.value)} placeholder="ex. Xmator" />
        </div>
        <div>
          <label className="label">Connexion du</label>
          <input type="date" className="input" value={debut} onChange={(e) => setDebut(e.target.value)} />
        </div>
        <div>
          <label className="label">au</label>
          <input type="date" className="input" value={fin} onChange={(e) => setFin(e.target.value)} />
        </div>
        <div className="flex items-end">
          <button className="btn-primary w-full" onClick={charger} disabled={chargement}>
            {chargement ? 'Actualisation…' : 'Actualiser'}
          </button>
        </div>
        <div className="grid grid-cols-1 items-end gap-2">
          <button
            className="btn-primary w-full bg-gradient-to-r from-rose-600 to-red-600"
            onClick={() => setConfirmSuppression(true)}
            title="Supprimer tout l'historique des sessions (ou la période filtrée)"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
            Supprimer l'historique
          </button>
        </div>
      </div>

      {/* Bouton PDF pleine largeur sous les filtres */}
      <div className="card flex flex-col items-start justify-between gap-3 p-4 sm:flex-row sm:items-center">
        <p className="text-xs text-slate-500">
          Export PDF des statistiques par appareil{debut || fin ? ` pour la période ${debut || '…'} → ${fin || '…'}` : ' (toutes les dates)'}.
        </p>
        <button className="btn-primary shrink-0" onClick={exporterPdf}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 6v3.776m-13.5 5.724h6" /></svg>
          Télécharger en PDF (début / fin)
        </button>
      </div>

      {msg && (
        <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700 ring-1 ring-emerald-200">{msg}</p>
      )}

      {/* Tableau : une ligne par appareil */}
      <div className="card overflow-hidden">
        <div className="table-wrap">
          <table className="w-max-table text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-start text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">ID appareil (MAC web)</th>
                <th className="px-4 py-3">Utilisateur(s)</th>
                <th className="px-4 py-3">Nom appareil</th>
                <th className="px-4 py-3">Sessions</th>
                <th className="px-4 py-3">1re connexion</th>
                <th className="px-4 py-3">Dernière connexion</th>
                <th className="px-4 py-3">Durée totale</th>
                <th className="px-4 py-3">Statut</th>
              </tr>
            </thead>
            <tbody>
              {lignes.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-400">Aucun appareil pour ces filtres.</td></tr>
              ) : lignes.map((l) => {
                const connecte = l.statut === 'connecte';
                return (
                  <tr key={l.identifiant_appareil || 'sans-id'} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${
                        l.type_appareil === 'mobile' ? 'bg-violet-50 text-violet-600'
                          : l.type_appareil === 'tablette' ? 'bg-amber-50 text-amber-600'
                            : 'bg-brand-50 text-brand-700'}`}>
                        <IconeAppareil type={l.type_appareil} />
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-800" title={l.identifiant_appareil || ''}>{idCourt(l.identifiant_appareil)}</td>
                    <td className="px-4 py-2.5 font-semibold text-slate-800">{l.login}</td>
                    <td className="px-4 py-2.5 text-slate-600">{l.nom_appareil || '—'}</td>
                    <td className="px-4 py-2.5 text-center"><span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700">{l.nb_sessions}</span></td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{fmtDateTime(l.premiere_connexion)}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{fmtDateTime(l.derniere_connexion)}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-800">{fmtDuree(l.duree_totale_secondes)}{(connecte || tick >= 0) && ''}</td>
                    <td className="px-4 py-2.5">
                      {connecte ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200">
                          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" /> Connecté
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-600 ring-1 ring-red-200">
                          <span className="h-2 w-2 rounded-full bg-red-500" /> Déconnecté
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modale de confirmation de suppression */}
      {confirmSuppression && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={() => setConfirmSuppression(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-600">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
              </span>
              <h3 className="text-base font-bold text-slate-900">Zone de danger — Supprimer l'historique</h3>
            </div>
            <p className="text-sm text-slate-600">
              {(debut || fin)
                ? <>Cette action supprime <b>définitivement</b> les sessions connectées entre le <b>{debut || 'début'}</b> et le <b>{fin || 'fin'}</b>.</>
                : <>Cette action supprime <b>définitivement tout l'historique</b> des connexions de tous les appareils.</>}
              {' '}Les sessions actuellement actives ne sont pas interrompues, mais leur historique sera perdu. Les statistiques repartiront de zéro.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setConfirmSuppression(false)}>Annuler</button>
              <button className="btn-primary bg-gradient-to-r from-rose-600 to-red-600" onClick={supprimerHistorique}>Confirmer la suppression</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
