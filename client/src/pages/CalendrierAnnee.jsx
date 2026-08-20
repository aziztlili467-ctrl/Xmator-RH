import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { fmtDate } from '../utils';
import { IconTrash } from '../components/icons';

const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const JOURS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

const TYPE_BADGES = {
  nationale: 'bg-slate-100 text-slate-600 ring-slate-200',
  religieuse: 'bg-amber-50 text-amber-700 ring-amber-200',
};

const SRC_BADGES = {
  normal: 'bg-slate-100 text-slate-600 ring-slate-200',
  ete: 'bg-sky-50 text-sky-700 ring-sky-200',
  ramadan: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  weekend: 'bg-slate-50 text-slate-400 ring-slate-100',
  ferie: 'bg-amber-50 text-amber-700 ring-amber-200',
  manuel: 'bg-purple-50 text-purple-700 ring-purple-200',
};

const SRC_LABELS = {
  normal: 'Travail',
  ete: 'Été (6 h)',
  ramadan: 'Ramadan',
  weekend: 'Repos',
  ferie: 'Férié',
  manuel: 'Manuel',
};

// Règle de l'entreprise : les jours travaillés d'un mois M vont du 21 du mois précédent au 20 du mois M.
// Un jour (année y, mois m, jour d) appartient à la période (py, pm) :
//   d <= 20 → pm = m ; d > 20 → pm = m+1.
function periodeDe(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  let py = y, pm = m - 1;
  if (d > 20) { pm += 1; if (pm === 12) { pm = 0; py += 1; } }
  return { annee: py, mois: pm };
}

function periodeRange(py, pm) {
  const sY = pm === 0 ? py - 1 : py;
  const sM = pm === 0 ? 11 : pm - 1;
  return {
    start: `${sY}-${String(sM + 1).padStart(2, '0')}-21`,
    end: `${py}-${String(pm + 1).padStart(2, '0')}-20`,
  };
}

function weekdayShort(iso) {
  return JOURS[new Date(iso + 'T00:00:00').getDay()];
}

export default function CalendrierAnnee() {
  const anneeCourante = new Date().getFullYear();
  const annees = [...Array(6)].map((_, i) => anneeCourante - 1 + i);

  const [annee, setAnnee] = useState(anneeCourante);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [config, setConfig] = useState(null);
  const [joursFeries, setJoursFeries] = useState([]);
  const [joursTravail, setJoursTravail] = useState([]);

  const [hN, setHN] = useState('8');
  const [hR, setHR] = useState('6');
  const [rD, setRD] = useState('');
  const [rF, setRF] = useState('');

  const [hfNom, setHfNom] = useState('');
  const [hfDate, setHfDate] = useState('');
  const [hfType, setHfType] = useState('nationale');
  const [hfRepos, setHfRepos] = useState(true);
  const [hfHeures, setHfHeures] = useState('');
  const [editingId, setEditingId] = useState(null);

  const [editDay, setEditDay] = useState(null);
  const [editHeures, setEditHeures] = useState('');
  const [editRepos, setEditRepos] = useState(false);

  const [savingCfg, setSavingCfg] = useState(false);
  const [savingHf, setSavingHf] = useState(false);

  const load = (a) => {
    setLoading(true);
    setError('');
    setSuccess('');
    api.calendrierAnnee(a)
      .then((r) => {
        setConfig(r.config);
        setJoursFeries(r.jours_feries || []);
        setJoursTravail(r.jours_travail || []);
        setHN(r.config ? String(r.config.heures_normales) : '8');
        setHR(r.config ? String(r.config.heures_reduites) : '6');
        setRD(r.config ? r.config.ramadan_debut || '' : '');
        setRF(r.config ? r.config.ramadan_fin || '' : '');
        if (r.config && (!r.jours_travail || r.jours_travail.length === 0)) {
          return api.genererCalendrier(a).then((g) => setJoursTravail(g.jours_travail || []));
        }
        return null;
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(annee); }, [annee]);

  const refreshCalendrier = async (a) => {
    const r = await api.calendrierAnnee(a);
    setJoursFeries(r.jours_feries || []);
    setJoursTravail(r.jours_travail || []);
  };

  const patchJour = (jour) => setJoursTravail((prev) => prev.map((x) => (x.id === jour.id ? jour : x)));

  // Aperçu par période (21 mois précédent → 20 mois courant) depuis le calendrier enregistré,
  // ou depuis la saisie courante tant que l'année n'est pas configurée.
  const apercu = useMemo(() => {
    const periods = new Map();
    const add = (iso, heures, source) => {
      const { annee: py, mois: pm } = periodeDe(iso);
      const key = `${py}-${pm}`;
      if (!periods.has(key)) periods.set(key, { annee: py, mois: pm, joursTravailles: 0, heures: 0, joursFeries: 0, joursRamadan: 0 });
      const p = periods.get(key);
      if (source === 'ferie') p.joursFeries++;
      if (source === 'ramadan') p.joursRamadan++;
      const h = Number(heures) || 0;
      if (h > 0) { p.joursTravailles++; p.heures += h; }
    };
    if (joursTravail.length) {
      joursTravail.forEach((j) => add(j.date, j.heures, j.source));
    } else {
      const hn = Number(hN) || 0;
      const hr = Number(hR) || 0;
      const feriesMap = {};
      joursFeries.forEach((f) => { feriesMap[f.date] = f; });
      const nbJours = (new Date(annee + 1, 0, 1) - new Date(annee, 0, 1)) / 86400000;
      for (let j = 1; j <= nbJours; j++) {
        const d = new Date(annee, 0, j);
        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const f = feriesMap[iso];
        if (f) { add(iso, Number(f.heures) || 0, 'ferie'); continue; }
        if (d.getDay() === 0 || d.getDay() === 6) { add(iso, 0, 'weekend'); continue; }
        if (rD && rF && iso >= rD && iso <= rF) { add(iso, hr, 'ramadan'); continue; }
        if (d.getMonth() === 6 || d.getMonth() === 7) { add(iso, hr, 'ete'); continue; }
        add(iso, hn, 'normal');
      }
    }
    return [...periods.values()].sort((a, b) => (a.annee === b.annee ? a.mois - b.mois : a.annee - b.annee));
  }, [annee, hN, hR, rD, rF, joursFeries, joursTravail]);

  const totaux = useMemo(() => {
    const t = { jours: 0, heures: 0, feries: 0, ramadan: 0 };
    apercu.forEach((p) => {
      t.jours += p.joursTravailles;
      t.heures += p.heures;
      t.feries += p.joursFeries;
      t.ramadan += p.joursRamadan;
    });
    return t;
  }, [apercu]);

  // Jours travaillés groupés par période métier (21 → 20)
  const groupes = useMemo(() => {
    const map = new Map();
    joursTravail.forEach((j) => {
      const { annee: py, mois: pm } = periodeDe(j.date);
      const key = `${py}-${pm}`;
      if (!map.has(key)) map.set(key, { key, annee: py, mois: pm, jours: [] });
      map.get(key).jours.push(j);
    });
    return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
  }, [joursTravail]);

  const resetHf = () => {
    setEditingId(null);
    setHfNom('');
    setHfDate('');
    setHfType('nationale');
    setHfRepos(true);
    setHfHeures('');
  };

  const submitConfig = async (e) => {
    e.preventDefault();
    setSavingCfg(true);
    setError('');
    setSuccess('');
    try {
      const r = await api.sauverCalendrier(annee, {
        heures_normales: Number(hN),
        heures_reduites: Number(hR),
        ramadan_debut: rD || null,
        ramadan_fin: rF || null,
      });
      setConfig(r.config);
      setJoursFeries(r.jours_feries || []);
      setJoursTravail(r.jours_travail || []);
      setSuccess(r.created
        ? `Configuration ${annee} créée — les jours travaillés de toute l'année ont été générés (modifiables jour par jour).`
        : `Configuration ${annee} enregistrée — jours travaillés recalculés.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingCfg(false);
    }
  };

  const submitJourFerie = async (e) => {
    e.preventDefault();
    if (!hfNom.trim()) { setError('Le nom du jour férié est obligatoire.'); return; }
    if (!hfDate) { setError('La date est obligatoire.'); return; }
    setSavingHf(true);
    setError('');
    setSuccess('');
    try {
      const body = { nom: hfNom.trim(), date: hfDate, type: hfType, heures: hfRepos ? 0 : Number(hfHeures || 0) };
      if (editingId) {
        await api.modifierJourFerie(editingId, body);
        setSuccess('Jour férié modifié — calendrier recalculé.');
      } else {
        await api.ajouterJourFerie(annee, body);
        setSuccess('Jour férié ajouté — calendrier recalculé.');
      }
      resetHf();
      await refreshCalendrier(annee);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingHf(false);
    }
  };

  const editHf = (f) => {
    setEditingId(f.id);
    setHfNom(f.nom);
    setHfDate(f.date);
    setHfType(f.type);
    setHfRepos(Number(f.heures) === 0);
    setHfHeures(Number(f.heures) === 0 ? '' : String(f.heures));
    setError('');
    setSuccess('');
  };

  const delHf = async (f) => {
    if (!window.confirm(`Supprimer « ${f.nom} » (${fmtDate(f.date)}) ?`)) return;
    setError('');
    setSuccess('');
    try {
      await api.supprimerJourFerie(f.id);
      setSuccess('Jour férié supprimé — calendrier recalculé.');
      await refreshCalendrier(annee);
    } catch (err) {
      setError(err.message);
    }
  };

  const startEdit = (j) => {
    setEditDay({ id: j.id, date: j.date });
    setEditHeures(String(j.heures));
    setEditRepos(Number(j.heures) === 0);
    setError('');
    setSuccess('');
  };

  const saveJour = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      const r = await api.modifierJour(editDay.id, { heures: editRepos ? 0 : Number(editHeures || 0), source: 'manuel' });
      patchJour(r.jour);
      setEditDay(null);
      setSuccess(`Jour ${fmtDate(editDay.date)} mis à jour.`);
    } catch (err) {
      setError(err.message);
    }
  };

  const restoreAuto = async () => {
    setError('');
    setSuccess('');
    try {
      const r = await api.modifierJour(editDay.id, { source: 'auto' });
      patchJour(r.jour);
      setEditDay(null);
      setSuccess(`Valeur automatique rétablie pour le ${fmtDate(editDay.date)}.`);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Calendrier de l'année</h2>
          <p className="text-sm text-slate-500">Heures de travail, ramadan, jours fériés et jours travaillés — Administration</p>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">
          Année :
          <select className="input w-auto" value={annee} onChange={(e) => setAnnee(Number(e.target.value))}>
            {annees.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}
      {success && <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700 ring-1 ring-emerald-200">{success}</p>}

      {loading ? (
        <p className="py-10 text-center text-sm text-slate-500">Chargement…</p>
      ) : (
        <>
          <div className="grid gap-6 xl:grid-cols-2">
            <div className="card p-5">
              <h3 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-600">Heures de travail {annee}</h3>
              <p className="mb-4 text-xs text-slate-500">
                Semaine normale : 40 h (5 jours × 8 h, lundi → vendredi). Samedi &amp; dimanche : repos.
                Juillet, août et le mois de ramadan : heures réduites.
              </p>
              <form onSubmit={submitConfig} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="label">Heures / jour — période normale</label>
                    <input type="number" min="0" max="24" step="0.5" className="input" value={hN} onChange={(e) => setHN(e.target.value)} />
                    <p className="mt-1 text-[11px] text-slate-400">8 h → 40 h / semaine</p>
                  </div>
                  <div>
                    <label className="label">Heures / jour — été &amp; ramadan</label>
                    <input type="number" min="0" max="24" step="0.5" className="input" value={hR} onChange={(e) => setHR(e.target.value)} />
                    <p className="mt-1 text-[11px] text-slate-400">6 h → 30 h / semaine</p>
                  </div>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="mb-2 text-xs font-semibold text-slate-600">Ramadan {annee}</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="label">Début</label>
                      <input type="date" className="input" value={rD} onChange={(e) => setRD(e.target.value)} />
                    </div>
                    <div>
                      <label className="label">Fin</label>
                      <input type="date" className="input" value={rF} onChange={(e) => setRF(e.target.value)} />
                    </div>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">Les jours de ramadan passent aux heures réduites (été &amp; ramadan).</p>
                </div>
                <div className="flex justify-end">
                  <button type="submit" disabled={savingCfg} className="btn btn-primary">
                    {savingCfg ? 'Enregistrement…' : (config ? 'Enregistrer et recalculer' : 'Créer la configuration')}
                  </button>
                </div>
              </form>
            </div>

            <div className="card p-5">
              <h3 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-600">Aperçu {annee} — par mois de travail</h3>
              <p className="mb-3 text-xs text-slate-500">
                Mois de travail : du <span className="font-semibold">21 du mois précédent</span> au <span className="font-semibold">20 du mois courant</span>.
                (Ex. août = 21 juillet → 20 août.)
              </p>
              <div className="table-wrap">
                <table className="w-max-table text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
                      <th className="py-2 pr-2">Période</th>
                      <th className="py-2 pr-2 text-right">Jours</th>
                      <th className="py-2 pr-2 text-right">Heures</th>
                      <th className="py-2 pr-2 text-right">Fériés</th>
                      <th className="py-2 text-right">Ramadan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apercu.map((p) => {
                      const range = periodeRange(p.annee, p.mois);
                      return (
                        <tr key={`${p.annee}-${p.mois}`} className="border-b border-slate-100">
                          <td className="py-2 pr-2">
                            <span className="font-semibold text-slate-700">{MOIS[p.mois]} {p.annee}</span>
                            <span className="ml-2 text-[11px] text-slate-400">{fmtDate(range.start)} → {fmtDate(range.end)}</span>
                          </td>
                          <td className="py-2 pr-2 text-right">{p.joursTravailles}</td>
                          <td className="py-2 pr-2 text-right font-semibold">{p.heures}</td>
                          <td className="py-2 pr-2 text-right">{p.joursFeries}</td>
                          <td className="py-2 text-right">{p.joursRamadan}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="text-slate-700">
                      <td className="py-2 pr-2 font-bold">Total {annee}</td>
                      <td className="py-2 pr-2 text-right font-bold">{totaux.jours}</td>
                      <td className="py-2 pr-2 text-right font-bold">{totaux.heures} h</td>
                      <td className="py-2 pr-2 text-right font-bold">{totaux.feries}</td>
                      <td className="py-2 text-right font-bold">{totaux.ramadan}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>

          <div className="card p-5">
            <h3 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-600">Jours fériés {annee}</h3>
            <p className="mb-4 text-xs text-slate-500">
              Un jour férié est un repos payé (0 h). Il peut être à heures partielles (ex. religieux) — chaque modification recalcule les jours travaillés.
              Les <span className="font-semibold">2 jours de l'Aïd el-Fitr</span> et les <span className="font-semibold">2 jours de l'Aïd el-Kebir</span>
              (fêtes religieuses, repos payé) sont ajoutés <span className="font-semibold">automatiquement depuis la fin du ramadan</span>
              (l'Aïd el-Fitr juste après le ramadan, l'Aïd el-Kebir ≈ 70 jours plus tard, estimé — à ajuster si besoin).
              Si la date coïncide avec un jour férié existant, elle reste un repos payé.
            </p>
            <div className="mb-4 rounded-lg bg-slate-50 p-3">
              <p className="mb-2 text-xs font-semibold text-slate-600">{editingId ? 'Modifier le jour férié' : 'Ajouter un jour férié'}</p>
              <form onSubmit={submitJourFerie} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <div>
                  <label className="label">Nom</label>
                  <input type="text" className="input" placeholder="Ex. Aïd el-Fitr" value={hfNom} onChange={(e) => setHfNom(e.target.value)} />
                </div>
                <div>
                  <label className="label">Date</label>
                  <input type="date" className="input" value={hfDate} onChange={(e) => setHfDate(e.target.value)} />
                </div>
                <div>
                  <label className="label">Type</label>
                  <select className="input" value={hfType} onChange={(e) => setHfType(e.target.value)}>
                    <option value="nationale">Nationale</option>
                    <option value="religieuse">Religieuse</option>
                  </select>
                </div>
                <div>
                  <label className="label">Heures (repos payé = 0)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number" min="0" max="24" step="0.5" className="input"
                      placeholder="0" disabled={hfRepos} value={hfHeures}
                      onChange={(e) => setHfHeures(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex flex-col justify-end gap-2">
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    <input type="checkbox" checked={hfRepos} onChange={(e) => setHfRepos(e.target.checked)} />
                    Repos payé (0 h)
                  </label>
                  <div className="flex gap-2">
                    <button type="submit" disabled={savingHf} className="btn btn-primary text-xs">
                      {savingHf ? '…' : (editingId ? 'Modifier' : 'Ajouter')}
                    </button>
                    {editingId && (
                      <button type="button" className="btn text-xs" onClick={resetHf}>Annuler</button>
                    )}
                  </div>
                </div>
              </form>
            </div>
            <div className="table-wrap">
              <table className="w-max-table text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-2">Nom</th>
                    <th className="py-2 pr-2">Date</th>
                    <th className="py-2 pr-2">Type</th>
                    <th className="py-2 pr-2">Heures</th>
                    <th className="py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {joursFeries.length === 0 && (
                    <tr><td colSpan="5" className="py-4 text-center text-slate-400">Aucun jour férié saisi pour {annee}.</td></tr>
                  )}
                  {joursFeries.map((f) => (
                    <tr key={f.id} className="border-b border-slate-100">
                      <td className="py-2 pr-2 font-medium text-slate-700">{f.nom}</td>
                      <td className="py-2 pr-2">{fmtDate(f.date)} <span className="text-[11px] text-slate-400">({weekdayShort(f.date)})</span></td>
                      <td className="py-2 pr-2">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${TYPE_BADGES[f.type] || TYPE_BADGES.nationale}`}>
                          {f.type === 'religieuse' ? 'Religieuse' : 'Nationale'}
                        </span>
                      </td>
                      <td className="py-2 pr-2">{Number(f.heures) === 0 ? 'Repos payé' : `${f.heures} h`}</td>
                      <td className="py-2 text-right">
                        <div className="inline-flex gap-2">
                          <button type="button" className="btn btn-xs" onClick={() => editHf(f)}>Modifier</button>
                          <button type="button" className="btn btn-xs btn-danger" onClick={() => delHf(f)}><IconTrash className="h-3.5 w-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card p-5">
            <h3 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-600">Jours travaillés de toute l'année {annee}</h3>
            <p className="mb-4 text-xs text-slate-500">
              Mois de travail : du <span className="font-semibold">21 du mois précédent</span> au <span className="font-semibold">20 du mois courant</span>.
              Chaque jour est modifiable individuellement. La valeur « automatique » est recalculée à chaque changement de la configuration,
              du ramadan ou des jours fériés — les jours marqués <span className="font-semibold text-purple-700">Manuel</span> sont conservés tels quels.
            </p>
            {!config ? (
              <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700 ring-1 ring-amber-200">
                Enregistrez d'abord la configuration de l'année : les jours travaillés seront générés automatiquement.
              </p>
            ) : groupes.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-400">Génération du calendrier…</p>
            ) : (
              <div className="space-y-5">
                {groupes.map((g) => {
                  const range = periodeRange(g.annee, g.mois);
                  const totJ = g.jours.filter((j) => Number(j.heures) > 0).length;
                  const totH = g.jours.reduce((s, j) => s + Number(j.heures || 0), 0);
                  return (
                    <div key={g.key}>
                      <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-600">
                        {MOIS[g.mois]} {g.annee}
                        <span className="ml-2 font-normal normal-case text-slate-400">
                          {fmtDate(range.start)} → {fmtDate(range.end)} · {totJ} jours · {totH} h
                        </span>
                      </p>
                      <div className="table-wrap">
                        <table className="w-max-table text-left text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
                              <th className="py-1.5 pr-2">Date</th>
                              <th className="py-1.5 pr-2">Statut</th>
                              <th className="py-1.5 pr-2">Heures</th>
                              <th className="py-1.5 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {g.jours.map((j) => (
                              <tr key={j.id} className="border-b border-slate-50">
                                <td className="py-1.5 pr-2">
                                  {fmtDate(j.date)} <span className="text-[11px] text-slate-400">({weekdayShort(j.date)})</span>
                                </td>
                                <td className="py-1.5 pr-2">
                                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${SRC_BADGES[j.source] || SRC_BADGES.normal}`}>
                                    {SRC_LABELS[j.source] || j.source}{j.source === 'ferie' && j.label ? ` : ${j.label}` : ''}
                                  </span>
                                </td>
                                <td className="py-1.5 pr-2">
                                  {editDay && editDay.id === j.id ? (
                                    <form onSubmit={saveJour} className="flex items-center gap-2">
                                      <label className="flex items-center gap-1.5 text-xs text-slate-600">
                                        <input type="checkbox" checked={editRepos} onChange={(e) => setEditRepos(e.target.checked)} />
                                        Repos
                                      </label>
                                      <input
                                        type="number" min="0" max="24" step="0.5" className="input w-20 py-1 text-xs"
                                        value={editHeures} disabled={editRepos}
                                        onChange={(e) => setEditHeures(e.target.value)}
                                      />
                                      <button type="submit" className="btn btn-primary btn-xs">OK</button>
                                    </form>
                                  ) : (
                                    Number(j.heures) === 0 ? 'Repos payé' : `${j.heures} h`
                                  )}
                                </td>
                                <td className="py-1.5 text-right">
                                  {editDay && editDay.id === j.id ? (
                                    <div className="inline-flex gap-2">
                                      <button type="button" className="btn btn-xs" onClick={restoreAuto}>Auto</button>
                                      <button type="button" className="btn btn-xs" onClick={() => setEditDay(null)}>Annuler</button>
                                    </div>
                                  ) : (
                                    <button type="button" className="btn btn-xs" onClick={() => startEdit(j)}>Modifier</button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}