import { useEffect, useState } from 'react';
import { api } from '../api';
import { IconDownload, IconUpload, IconTrash } from '../components/icons';

const fmtTaille = (b) => {
  if (b == null) return '—';
  if (b < 1024) return `${b} o`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} Ko`;
  return `${(b / (1024 * 1024)).toFixed(2)} Mo`;
};

const fmtDateHeure = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} à ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const RESETS = [
  {
    key: 'employes',
    labelKey: 'Réinitialiser les noms (employés)',
    descKey: "Supprime tous les employés, leurs photos, leurs comptes de connexion et toutes leurs données (mouvements, demandes, arrêts).",
    api: (pwd) => api.maintenance.resetEmployes(pwd),
  },
  {
    key: 'soldesConge',
    labelKey: 'Réinitialiser les soldes de congé',
    descKey: 'Supprime tous les mouvements de congé : tous les soldes de congé repassent à 0.',
    api: (pwd) => api.maintenance.resetSoldesConge(pwd),
  },
  {
    key: 'soldesMaladie',
    labelKey: 'Réinitialiser les soldes maladie',
    descKey: 'Supprime tous les mouvements de maladie : tous les soldes maladie repassent à 0.',
    api: (pwd) => api.maintenance.resetSoldesMaladie(pwd),
  },
  {
    key: 'journal',
    labelKey: 'Réinitialiser les opérations du journal des stats',
    descKey: "Vide entièrement le journal : tous les mouvements, demandes de congé et arrêts maladie sont supprimés (soldes à 0).",
    api: (pwd) => api.maintenance.resetJournal(pwd),
  },
];

export default function Maintenance() {
  const [backups, setBackups] = useState([]);
  const [libelle, setLibelle] = useState('');
  const [restoreFile, setRestoreFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [dangerTarget, setDangerTarget] = useState(null);
  const [dangerPwd, setDangerPwd] = useState('');
  const [dangerError, setDangerError] = useState('');

  const loadBackups = () =>
    api.maintenance.backupsListe().then(setBackups).catch((e) => setError(e.message));

  useEffect(() => { loadBackups(); }, []);

  const sauvegarder = async () => {
    setBusy(true); setError(''); setMsg('');
    try {
      const r = await api.maintenance.backupCreer(libelle);
      setMsg(`Sauvegarde créée : « ${r.nom} » (${fmtTaille(r.taille)}) — ${r.nbEmployes} employé(s), ${r.nbPhotos} photo(s). Copie serveur enregistrée, téléchargement du fichier…`);
      await api.maintenance.backupTelecharger(r.nom);
      setLibelle('');
      loadBackups();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const telecharger = async (nom) => {
    try { await api.maintenance.backupTelecharger(nom); } catch (err) { setError(err.message); }
  };

  const restaurerListe = async (nom) => {
    const ok = window.confirm(`Restaurer depuis « ${nom} » ?\n\nATTENTION : toutes les données actuelles seront REMPLACÉES par le contenu de cette sauvegarde.`);
    if (!ok) return;
    setBusy(true); setError(''); setMsg('');
    try {
      const r = await api.maintenance.restaurerDepuisSauvegarde(nom);
      setMsg(`Restauration réussie : ${r.nbEmployes} employé(s), ${r.tables.mouvements} mouvement(s), ${r.tables.demandes_conge} demande(s), ${r.tables.arrets_maladie} arrêt(s), ${r.photoCount} photo(s).`);
      loadBackups();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const restaurerUpload = async (e) => {
    e.preventDefault();
    if (!restoreFile) return setError("Choisissez d'abord un fichier de sauvegarde (.db).");
    const ok = window.confirm(`Restaurer depuis « ${restoreFile.name} » ?\n\nATTENTION : toutes les données actuelles seront REMPLACÉES par le contenu de ce fichier.`);
    if (!ok) return;
    setBusy(true); setError(''); setMsg('');
    try {
      const r = await api.maintenance.restaurer(restoreFile);
      setMsg(`Restauration réussie : ${r.nbEmployes} employé(s), ${r.tables.mouvements} mouvement(s), ${r.tables.demandes_conge} demande(s), ${r.tables.arrets_maladie} arrêt(s), ${r.photoCount} photo(s).`);
      setRestoreFile(null);
      loadBackups();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const reinitialiser = (item) => {
    setDangerTarget(item);
    setDangerPwd('');
    setDangerError('');
  };

  const executerReset = async (e) => {
    e.preventDefault();
    if (!dangerPwd) return setDangerError('Saisissez le mot de passe de sécurité.');
    setBusy(true); setError(''); setMsg(''); setDangerError('');
    try {
      const r = await dangerTarget.api(dangerPwd);
      setMsg(r.message || 'Réinitialisation effectuée.');
      setDangerTarget(null);
      setDangerPwd('');
      loadBackups();
    } catch (err) { setDangerError(err.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Sauvegarde & réinitialisation</h2>
        <p className="text-sm text-slate-500">
          Sauvegarder toutes les données à une date précise, restaurer une sauvegarde en cas de bug ou de mauvaise manipulation, ou remettre les données à l'état vide.
        </p>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}
      {msg && <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700 ring-1 ring-emerald-200">{msg}</p>}

      {/* Sauvegarde */}
      <div className="card p-6">
        <h3 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-500">Créer une sauvegarde</h3>
        <p className="mb-4 text-xs text-slate-400">
          Le fichier est horodaté automatiquement (ex. amicale_2026-08-15_14h30.db), copié sur le serveur dans data/backups/ puis téléchargé sur votre PC.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="label">Date / libellé précise (optionnel)</label>
            <input
              className="input"
              value={libelle}
              onChange={(e) => setLibelle(e.target.value)}
              placeholder="ex. Avant import des 140 employés"
            />
          </div>
          <button className="btn-primary" onClick={sauvegarder} disabled={busy}>
            <IconDownload /> {busy ? 'Sauvegarde…' : 'Sauvegarder maintenant'}
          </button>
        </div>
      </div>

      {/* Sauvegardes existantes */}
      <div className="card overflow-hidden">
        <div className="border-b border-slate-200 px-6 py-4">
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Sauvegardes du serveur</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-start text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Fichier</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Taille</th>
                <th className="px-4 py-3 text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {backups.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">Aucune sauvegarde pour le moment.</td></tr>
              ) : backups.map((b) => (
                <tr key={b.nom} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-800">{b.nom}</td>
                  <td className="px-4 py-2.5 text-slate-600">{fmtDateHeure(b.date)}</td>
                  <td className="px-4 py-2.5 text-slate-600">{fmtTaille(b.taille)}</td>
                  <td className="px-4 py-2.5 text-end">
                    <button className="me-3 text-xs font-semibold text-brand-600 hover:underline" onClick={() => telecharger(b.nom)}>
                      Télécharger
                    </button>
                    <button className="text-xs font-semibold text-amber-600 hover:underline" onClick={() => restaurerListe(b.nom)}>
                      Restaurer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Restauration depuis un fichier */}
      <div className="card p-6">
        <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">Restaurer depuis un fichier (.db)</h3>
        <form onSubmit={restaurerUpload} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="label">Fichier de sauvegarde (base SQLite)</label>
            <input className="input p-2" type="file" accept=".db" onChange={(e) => setRestoreFile(e.target.files[0] || null)} />
          </div>
          <button type="submit" className="btn-primary" disabled={busy}>
            <IconUpload /> {busy ? 'Restauration…' : 'Restaurer'}
          </button>
        </form>
        <p className="mt-3 text-xs text-amber-600">
          ⚠️ La restauration REMPLACE toutes les données actuelles (employés, soldes, demandes, arrêts, comptes) par le contenu du fichier.
        </p>
      </div>

      {/* Réinitialisation */}
      <div className="card border-red-200 p-6">
        <h3 className="mb-1 text-sm font-bold uppercase tracking-wide text-red-600">Zone de danger — réinitialisation</h3>
        <p className="mb-4 text-xs text-slate-400">
          Remet les données à l'état vide. Ces actions sont irréversibles : créez une sauvegarde avant de les utiliser.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {RESETS.map((item) => (
            <button
              key={item.key}
              onClick={() => reinitialiser(item)}
              disabled={busy}
              className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-start transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="mt-0.5 text-red-600"><IconTrash /></span>
              <span>
                <span className="block text-sm font-semibold text-red-700">{item.labelKey}</span>
                <span className="block text-xs text-red-500">{item.descKey}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Boîte d'alerte : confirmation par mot de passe de sécurité */}
      {dangerTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form onSubmit={executerReset} className="w-full max-w-md rounded-xl border border-red-200 bg-white p-6 shadow-xl">
            <div className="mb-3 flex items-start gap-3">
              <span className="mt-0.5 text-red-600"><IconTrash /></span>
              <div>
                <h3 className="text-lg font-bold text-red-700">Zone de danger</h3>
                <p className="text-sm font-semibold text-slate-800">{dangerTarget.labelKey}</p>
              </div>
            </div>
            <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
              {dangerTarget.descKey}
              <br />
              <span className="mt-1 block font-semibold">Cette action est IRRÉVERSIBLE. Saisissez le mot de passe de sécurité pour confirmer.</span>
            </p>
            <div className="mb-1">
              <label className="label">Mot de passe de sécurité</label>
              <input
                className="input"
                type="password"
                autoFocus
                value={dangerPwd}
                onChange={(e) => setDangerPwd(e.target.value)}
                placeholder="••••••••••••"
                autoComplete="off"
              />
            </div>
            {dangerError && <p className="mb-3 text-sm font-semibold text-red-600">{dangerError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setDangerTarget(null)} disabled={busy}>Annuler</button>
              <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50" disabled={busy}>
                {busy ? 'Réinitialisation…' : 'Confirmer la réinitialisation'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}