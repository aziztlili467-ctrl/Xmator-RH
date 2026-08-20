import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { fmtDate } from '../utils';
import { IconTrash, IconDownload, IconUpload, IconFileText } from '../components/icons';

const MODULES = [
  { key: 'employes', label: 'Employés' },
  { key: 'categories', label: 'Catégories' },
  { key: 'soldes', label: 'Soldes & op.' },
  { key: 'demandes', label: 'Demandes de congé' },
  { key: 'maladie', label: 'Maladie' },
  { key: 'statistiques', label: 'TdB & stats' },
  { key: 'comptes', label: 'Comptes' },
  { key: 'administration', label: 'Sauvegarde & import' },
  { key: 'horaires', label: 'Horaires de travail' },
];

const ACTION_LABELS = {
  lire: 'Lecture',
  ajouter: 'Ajout',
  modifier: 'Modification',
  supprimer: 'Suppression',
  login: 'Connexion',
  logout: 'Déconnexion',
  echec_login: 'Échec de connexion',
};

const ROLE_LABELS = {
  super_admin: 'Super Admin',
  consultation: 'Consultation',
  moderateur: 'Modérateur',
  employe: 'Employé',
};
const ROLE_CLS = {
  super_admin: 'bg-purple-50 text-purple-700 ring-purple-200',
  consultation: 'bg-sky-50 text-sky-700 ring-sky-200',
  moderateur: 'bg-amber-50 text-amber-700 ring-amber-200',
  employe: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
};

const ACTION_CLS = {
  login: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  logout: 'bg-slate-100 text-slate-600 ring-slate-200',
  lire: 'bg-sky-50 text-sky-700 ring-sky-200',
  ajouter: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  modifier: 'bg-amber-50 text-amber-700 ring-amber-200',
  supprimer: 'bg-red-50 text-red-700 ring-red-200',
  echec_login: 'bg-red-50 text-red-700 ring-red-200',
};

const moduleLabel = (k) => {
  const m = MODULES.find((x) => x.key === k);
  return m ? m.label : k || '—';
};

const fmtDateTime = (iso) => {
  if (!iso) return '—';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return fmtDate(iso);
  return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`;
};

// Cellule « L · A · M » : lecture / ajout / modification pour une rubrique
const Cell = ({ a }) => {
  const total = a.lire + a.ajouter + a.modifier;
  if (total === 0) return <span className="text-slate-300">—</span>;
  return (
    <span
      className="text-slate-700"
      title={`Lecture : ${a.lire} · Ajout : ${a.ajouter} · Modification : ${a.modifier}`}
    >
      <span className={a.lire ? 'font-semibold text-sky-700' : 'text-slate-300'}>{a.lire}</span>
      <span className="text-slate-400">·</span>
      <span className={a.ajouter ? 'font-semibold text-emerald-700' : 'text-slate-300'}>{a.ajouter}</span>
      <span className="text-slate-400">·</span>
      <span className={a.modifier ? 'font-semibold text-amber-700' : 'text-slate-300'}>{a.modifier}</span>
    </span>
  );
};

export default function Mouchard() {
  const [data, setData] = useState(null);
  const [auto, setAuto] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');
  const [msg, setMsg] = useState('');
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const r = await api.mouchard();
      setData(r);
      setLastUpdate(new Date());
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!auto) return undefined;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [auto, load]);

  const vider = async () => {
    if (!window.confirm('Vider le journal du mouchard ? Les statistiques seront remises à zéro.')) return;
    setBusy(true);
    try {
      await api.viderMouchard();
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const checkRange = () => {
    if (dateDebut && dateFin && dateFin < dateDebut) {
      setError('La date de fin doit être postérieure ou égale à la date de début.');
      return false;
    }
    return true;
  };
  const rangeParams = () => ({ debut: dateDebut || undefined, fin: dateFin || undefined });

  const telecharger = async () => {
    if (!checkRange()) return;
    setBusy(true); setMsg(''); setError('');
    try {
      await api.mouchardExport(rangeParams());
      setMsg('Téléchargement terminé : le fichier des événements de la période a été enregistré.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const onRestoreFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true); setMsg(''); setError('');
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const list = Array.isArray(parsed) ? parsed : parsed.evenements;
      if (!Array.isArray(list)) throw new Error('Fichier invalide : aucun tableau d\'événements trouvé.');
      const r = await api.mouchardRestaurer(list);
      setMsg(`Restauration terminée : ${r.importes} événement(s) importé(s), ${r.ignores} ignoré(s) (doublons).`);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const imprimer = async () => {
    if (!checkRange()) return;
    setBusy(true); setMsg(''); setError('');
    try {
      await api.mouchardPdf(rangeParams());
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const supprimer = async () => {
    if (!checkRange()) return;
    const periode = dateDebut && dateFin
      ? `du ${dateDebut} au ${dateFin}`
      : dateDebut
        ? `à partir du ${dateDebut}`
        : dateFin
          ? `jusqu'au ${dateFin}`
          : 'de TOUS les événements';
    if (!window.confirm(`Supprimer les événements ${periode} ? Cette action est irréversible.`)) return;
    setBusy(true); setMsg(''); setError('');
    try {
      const r = await api.mouchardSupprimer(rangeParams());
      setMsg(`${r.supprimes} événement(s) supprimé(s).`);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!data) {
    return (
      <div className="space-y-6">
        <h2 className="text-lg font-bold text-slate-900">Mouchard — journal des activités</h2>
        {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}
        <p className="text-sm text-slate-400">Chargement…</p>
      </div>
    );
  }

  const totRub = {};
  for (const m of MODULES) {
    totRub[m.key] = { lire: 0, ajouter: 0, modifier: 0 };
  }
  const totCol = { lire: 0, ajouter: 0, modifier: 0, supprimer: 0 };
  for (const c of data.comptes) {
    for (const m of MODULES) {
      const a = c.activite[m.key] || {};
      totRub[m.key].lire += a.lire || 0;
      totRub[m.key].ajouter += a.ajouter || 0;
      totRub[m.key].modifier += a.modifier || 0;
    }
    totCol.lire += c.total.lire;
    totCol.ajouter += c.total.ajouter;
    totCol.modifier += c.total.modifier;
    totCol.supprimer += c.total.supprimer;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Mouchard — journal des activités</h2>
          <p className="text-sm text-slate-500">
            Détecte et journalise chaque opération (lecture · ajout · modification · suppression) et chaque connexion,
            par compte. Réservé au Super Admin.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${auto ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-slate-100 text-slate-500 ring-slate-200'}`}>
            <span className={`h-2 w-2 animate-pulse rounded-full ${auto ? 'bg-emerald-500' : 'bg-slate-400'}`} />
            {auto ? 'En direct (5 s)' : 'Actualisation en pause'}
          </span>
          <button className="btn-secondary" onClick={() => setAuto(!auto)}>
            {auto ? 'Pause' : 'Reprendre'}
          </button>
          <button className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50" onClick={vider} disabled={busy}>
            <IconTrash /> Vider le journal
          </button>
        </div>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}

      {lastUpdate && (
        <p className="text-xs text-slate-400">Dernière mise à jour : {lastUpdate.toLocaleTimeString('fr-FR')}</p>
      )}

      {/* Cartes de synthèse */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Opérations réussies</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">{data.totaux.operations}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Connexions</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">{data.totaux.connexions}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Comptes suivis</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">{data.comptes.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Événements journalisés</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">{data.totaux.evenements}</p>
        </div>
      </div>

      {/* Gestion des événements : télécharger / restaurer / imprimer / supprimer */}
      <div className="card p-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Gestion des événements</h3>
          <span className="text-xs text-slate-400">Période au choix — vide = toutes les dates</span>
        </div>
        <div className="mt-4 grid max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Date début</label>
            <input type="date" className="input" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} />
          </div>
          <div>
            <label className="label">Date fin</label>
            <input type="date" className="input" value={dateFin} onChange={(e) => setDateFin(e.target.value)} />
          </div>
        </div>
        {msg && <p className="mt-3 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700 ring-1 ring-emerald-200">{msg}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={telecharger} disabled={busy}>
            <IconDownload /> Télécharger
          </button>
          <button className="btn-secondary" onClick={() => fileRef.current?.click()} disabled={busy}>
            <IconUpload /> Restaurer
          </button>
          <button className="btn-secondary" onClick={imprimer} disabled={busy}>
            <IconFileText /> Imprimer PDF
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={supprimer}
            disabled={busy}
          >
            <IconTrash /> Supprimer
          </button>
          <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={onRestoreFile} />
        </div>
      </div>

      {/* Tableau de statistiques par compte */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">
            Statistiques d'activité par compte
          </h3>
          <span className="text-xs text-slate-400">Lecture · Ajout · Modification par rubrique</span>
        </div>
        <div className="table-wrap">
          <table className="w-max-table text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2 text-start" rowSpan={2}>Login</th>
                <th className="px-3 py-2 text-start" rowSpan={2}>Nom &amp; prénom</th>
                <th className="px-3 py-2 text-start" rowSpan={2}>Rôle</th>
                <th className="px-3 py-2 text-center" rowSpan={2}>Connexions</th>
                <th className="px-3 py-2 text-start" rowSpan={2}>Dernière connexion</th>
                <th className="border-b border-slate-200 px-3 py-2 text-center" colSpan={MODULES.length}>
                  Rubriques — L · A · M
                </th>
                <th className="px-3 py-2 text-center" rowSpan={2}>Total L · A · M</th>
                <th className="px-3 py-2 text-center" rowSpan={2}>Suppr.</th>
              </tr>
              <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {MODULES.map((m) => (
                  <th key={m.key} className="px-2 py-1.5 text-center">{m.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.comptes.map((c) => (
                <tr key={c.login} className={`border-b border-slate-100 hover:bg-slate-50 ${c.supprime ? 'bg-red-50/40' : ''}`}>
                  <td className="px-3 py-2 font-semibold text-slate-800">
                    {c.login}
                    {c.supprime && (
                      <span className="ms-2 inline-flex rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">supprimé</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    {c.nom_prenom || '—'}
                    {c.matricule && <span className="ms-1 text-xs text-slate-400">({c.matricule})</span>}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ${ROLE_CLS[c.role] || 'bg-slate-100 text-slate-600 ring-slate-200'}`}>
                      {ROLE_LABELS[c.role] || c.role || '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center font-semibold text-slate-700">{c.connexions || 0}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-500">{fmtDateTime(c.derniere_connexion)}</td>
                  {MODULES.map((m) => (
                    <td key={m.key} className="px-2 py-2 text-center">
                      <Cell a={c.activite[m.key] || { lire: 0, ajouter: 0, modifier: 0 }} />
                    </td>
                  ))}
                  <td className="px-3 py-2 text-center font-semibold text-slate-800">
                    {c.total.lire + c.total.ajouter + c.total.modifier === 0
                      ? <span className="text-slate-300">—</span>
                      : `${c.total.lire}·${c.total.ajouter}·${c.total.modifier}`}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {c.total.supprimer > 0
                      ? <span className="font-bold text-red-600">{c.total.supprimer}</span>
                      : <span className="text-slate-300">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50 text-xs font-bold text-slate-600">
                <td className="px-3 py-2" colSpan={5}>TOTAUX</td>
                {MODULES.map((m) => (
                  <td key={m.key} className="px-2 py-2 text-center">
                    <Cell a={totRub[m.key]} />
                  </td>
                ))}
                <td className="px-3 py-2 text-center">{totCol.lire}·{totCol.ajouter}·{totCol.modifier}</td>
                <td className="px-3 py-2 text-center">{totCol.supprimer > 0 ? <span className="text-red-600">{totCol.supprimer}</span> : '—'}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Journal des événements récents */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">
            Derniers événements journalisés
          </h3>
          <span className="text-xs text-slate-400">100 derniers événements</span>
        </div>
        <div className="table-wrap">
          <table className="w-max-table text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-start text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2.5 text-start">Date &amp; heure</th>
                <th className="px-4 py-2.5 text-start">Login</th>
                <th className="px-4 py-2.5 text-start">Rôle</th>
                <th className="px-4 py-2.5 text-start">Action</th>
                <th className="px-4 py-2.5 text-start">Rubrique</th>
                <th className="px-4 py-2.5 text-start">Détail</th>
                <th className="px-4 py-2.5 text-start">IP</th>
                <th className="px-4 py-2.5 text-center">Statut</th>
              </tr>
            </thead>
            <tbody>
              {data.evenements.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">Aucun événement pour le moment.</td></tr>
              ) : data.evenements.map((ev) => (
                <tr key={ev.id} className={`border-b border-slate-100 hover:bg-slate-50 ${ev.action === 'echec_login' ? 'bg-red-50/40' : ''}`}>
                  <td className="whitespace-nowrap px-4 py-2 text-slate-500">{fmtDateTime(ev.created_at)}</td>
                  <td className="px-4 py-2 font-semibold text-slate-800">{ev.login}</td>
                  <td className="px-4 py-2">
                    <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ${ROLE_CLS[ev.role] || 'bg-slate-100 text-slate-600 ring-slate-200'}`}>
                      {ROLE_LABELS[ev.role] || ev.role || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ${ACTION_CLS[ev.action] || 'bg-slate-100 text-slate-600 ring-slate-200'}`}>
                      {ACTION_LABELS[ev.action] || ev.action}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-slate-600">{moduleLabel(ev.module)}</td>
                  <td className="px-4 py-2 font-mono text-xs text-slate-500">{ev.detail}</td>
                  <td className="px-4 py-2 text-slate-400">{ev.ip || '—'}</td>
                  <td className="px-4 py-2 text-center">
                    {ev.statut == null ? '—' : (
                      <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ${ev.statut >= 200 && ev.statut < 300 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                        {ev.statut}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}