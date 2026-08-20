import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { fmtDate, fmtJours } from '../utils';
import PresenceHeures from '../components/PresenceHeures';


const TYPE_LABELS = {
  solde_initial: 'Solde initial',
  ajout_annuel: 'Ajout annuel',
  prelevement: 'Prélèvement congé',
  maladie: 'Arrêt maladie',
  absence: 'Absence',
};

const STATUT_LABELS = {
  acceptee: 'Acceptée',
  valide: 'Validé',
  rejete: 'Rejeté',
  enregistree: 'Enregistrée',
  credite: 'Crédité',
  '—': '—',
};

const CHART_COLORS = { conge: '#0284c7', maladie: '#e11d48', absence: '#64748b' };

function periodePreset(preset) {
  const now = new Date();
  const y = now.getFullYear();
  const iso = (d) => d.toISOString().split('T')[0];
  if (preset === 'mois') {
    return { debut: iso(new Date(y, now.getMonth(), 1)), fin: iso(now) };
  }
  if (preset === 'annee') return { debut: `${y}-01-01`, fin: `${y}-12-31` };
  if (preset === 'annee_prec') return { debut: `${y - 1}-01-01`, fin: `${y - 1}-12-31` };
  return null;
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function moisLabel(mois) {
  const [y, m] = mois.split('-');
  return `${MOIS[Number(m) - 1]} ${y}`;
}

export default function MonEspace() {
  const { user } = useAuth();
  const matricule = user?.employe?.matricule;

  const [preset, setPreset] = useState('annee');
  const [persoDebut, setPersoDebut] = useState('');
  const [persoFin, setPersoFin] = useState('');
  const [fiche, setFiche] = useState(null);
  const [stats, setStats] = useState(null);
  const [mouvements, setMouvements] = useState([]);
  const [typeFiltre, setTypeFiltre] = useState('');
  const [sortDesc, setSortDesc] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [photoVersion, setPhotoVersion] = useState(Date.now());

  const periode = useMemo(() => {
    if (preset === 'perso') return { debut: persoDebut, fin: persoFin };
    return periodePreset(preset);
  }, [preset, persoDebut, persoFin]);

  useEffect(() => {
    if (!matricule) return;
    setLoading(true);
    setError('');
    Promise.all([
      api.employeFiche(matricule),
      api.employeStats(matricule, periode),
      api.employeMouvements(matricule, periode),
    ])
      .then(([f, s, m]) => { setFiche(f); setStats(s); setMouvements(m); setPhotoVersion(Date.now()); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matricule, preset, persoDebut, persoFin]);

  const congeChart = (stats?.conge?.parMois || []).map((p) => ({ mois: moisLabel(p.mois), jours: p.jours }));
  const maladieChart = (stats?.maladie?.parMois || []).map((p) => ({ mois: moisLabel(p.mois), jours: p.jours }));
  const absenceChart = (stats?.absence?.parMois || []).map((p) => ({ mois: moisLabel(p.mois), jours: p.jours }));

  const mouvementsFiltres = useMemo(() => {
    const list = typeFiltre ? mouvements.filter((m) => m.type_operation === typeFiltre) : [...mouvements];
    list.sort((a, b) => (sortDesc ? b.date_operation.localeCompare(a.date_operation) : a.date_operation.localeCompare(b.date_operation)));
    return list;
  }, [mouvements, typeFiltre, sortDesc]);

  if (loading && !fiche) {
    return <div className="py-20 text-center text-slate-500">Chargement de votre espace…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Mon espace</h2>
          <p className="text-sm text-slate-500">Vue personnelle — vos congés, maladies et absences.</p>
        </div>
        {fiche && (
          <div className="flex items-center gap-3 rounded-xl bg-white px-4 py-3 ring-1 ring-slate-200">
            {fiche.photo_url ? (
              <img src={`${fiche.photo_url}?v=${photoVersion}`} alt="Photo" className="h-14 w-14 rounded-lg object-cover ring-1 ring-slate-200" />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-slate-200 text-lg font-bold text-slate-500">
                {fiche.prenom?.[0]}{fiche.nom?.[0]}
              </div>
            )}
            <div>
              <p className="font-bold text-slate-900">{fiche.nom} {fiche.prenom}</p>
              <p className="text-xs text-slate-500">Matricule {fiche.matricule} · {fiche.categorie}</p>
            </div>
          </div>
        )}
      </div>

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}

      {fiche && (
        <div className="card p-6">
          <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">Fiche de présentation</h3>
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            {/* Photo d'identité — cadre rectangulaire */}
            <div className="flex shrink-0 flex-col items-center gap-2">
              <div className="flex h-40 w-32 items-center justify-center overflow-hidden rounded-xl border-2 border-slate-200 bg-slate-100">
                {fiche.photo_url ? (
                  <img src={`${fiche.photo_url}?v=${photoVersion}`} alt="Photo d'identité" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-3xl font-bold text-slate-300">—</span>
                )}
              </div>
              <span className="text-[11px] text-slate-400">Photo (webp)</span>
            </div>

            <dl className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-lg bg-slate-50 p-4 ring-1 ring-slate-100">
                <dt className="text-xs font-semibold uppercase text-slate-400">Nom</dt>
                <dd className="mt-1 font-semibold text-slate-800">{fiche.nom}</dd>
              </div>
              <div className="rounded-lg bg-slate-50 p-4 ring-1 ring-slate-100">
                <dt className="text-xs font-semibold uppercase text-slate-400">Prénom</dt>
                <dd className="mt-1 font-semibold text-slate-800">{fiche.prenom}</dd>
              </div>
              <div className="rounded-lg bg-slate-50 p-4 ring-1 ring-slate-100">
                <dt className="text-xs font-semibold uppercase text-slate-400">Date de naissance</dt>
                <dd className="mt-1 font-semibold text-slate-800">{fmtDate(fiche.date_naissance)}</dd>
              </div>
              <div className="rounded-lg bg-slate-50 p-4 ring-1 ring-slate-100">
                <dt className="text-xs font-semibold uppercase text-slate-400">Date d'embauche</dt>
                <dd className="mt-1 font-semibold text-slate-800">{fmtDate(fiche.date_embauche)}</dd>
              </div>
              <div className="rounded-lg bg-slate-50 p-4 ring-1 ring-slate-100">
                <dt className="text-xs font-semibold uppercase text-slate-400">Années de service</dt>
                <dd className="mt-1 font-semibold text-slate-800">
                  {fiche.annees_service !== null && fiche.annees_service !== undefined ? `${fiche.annees_service} an(s)` : '—'}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      )}

      {/* Filtre de période */}
      <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-semibold text-slate-600">Période :</label>
          <select className="input w-auto" value={preset} onChange={(e) => setPreset(e.target.value)}>
            <option value="mois">Mois en cours</option>
            <option value="annee">Année en cours</option>
            <option value="annee_prec">Année précédente</option>
            <option value="perso">Personnalisée</option>
          </select>
          {preset === 'perso' && (
            <div className="flex items-center gap-2">
              <input type="date" className="input w-auto" value={persoDebut} onChange={(e) => setPersoDebut(e.target.value)} />
              <span className="text-slate-400">→</span>
              <input type="date" className="input w-auto" value={persoFin} onChange={(e) => setPersoFin(e.target.value)} />
            </div>
          )}
        </div>
        {stats && (
          <p className="text-xs text-slate-400">
            Du {fmtDate(stats.periode.debut)} au {fmtDate(stats.periode.fin)}
          </p>
        )}
      </div>

      {/* 3 diagrammes */}
      {stats && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {[
            { key: 'conge', titre: 'Congés', color: CHART_COLORS.conge, s: stats.conge, sous: `${fmtJours(stats.conge.jours)} j pris · ${fmtJours(stats.conge.restant)} j restant` },
            { key: 'maladie', titre: 'Maladies', color: CHART_COLORS.maladie, s: stats.maladie, sous: `${fmtJours(stats.maladie.jours)} j · ${stats.maladie.episodes} épisode(s) · ${fmtJours(stats.maladie.restant)} j restant` },
            { key: 'absence', titre: 'Absences', color: CHART_COLORS.absence, s: stats.absence, sous: `${fmtJours(stats.absence.jours)} j · ${stats.absence.episodes} occurrence(s)` },
          ].map(({ key, titre, color, s, sous }) => (
            <div key={key} className="card p-4">
              <div className="mb-1 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-700">{titre}</h3>
                <span className="h-3 w-3 rounded-full" style={{ background: color }} />
              </div>
              <p className="mb-3 text-xs text-slate-400">{sous}</p>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={key === 'conge' ? congeChart : key === 'maladie' ? maladieChart : absenceChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <Tooltip formatter={(v) => [`${v} jour(s)`, titre]} />
                    <Bar dataKey="jours" fill={color} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Heures travaillées vs heures légales — module présence */}
      <PresenceHeures matricule={matricule} />

      {/* Journal des mouvements */}
      <div className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Journal des mouvements</h3>
          <div className="flex items-center gap-2">
            <select className="input w-auto" value={typeFiltre} onChange={(e) => setTypeFiltre(e.target.value)}>
              <option value="">Tous les types</option>
              {Object.entries(TYPE_LABELS).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
            <button className="btn-secondary" onClick={() => setSortDesc((s) => !s)}>
              Date {sortDesc ? '↓' : '↑'}
            </button>
          </div>
        </div>
        <div className="table-wrap">
          <table className="w-max-table text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-start text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3 text-center">Jours</th>
                <th className="px-4 py-3 text-center">Statut</th>
                <th className="px-4 py-3 text-center">Solde après</th>
                <th className="px-4 py-3">Motif</th>
              </tr>
            </thead>
            <tbody>
              {mouvementsFiltres.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Aucun mouvement sur cette période.</td></tr>
              ) : (
                mouvementsFiltres.map((m) => (
                  <tr key={m.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-slate-600">{fmtDate(m.date_operation)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ${
                        m.type_operation === 'prelevement' ? 'bg-sky-50 text-sky-700 ring-sky-200'
                        : m.type_operation === 'maladie' ? 'bg-rose-50 text-rose-700 ring-rose-200'
                        : m.type_operation === 'absence' ? 'bg-slate-100 text-slate-600 ring-slate-300'
                        : 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                      }`}>
                        {TYPE_LABELS[m.type_operation] || m.type_operation}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center font-semibold text-slate-700">{fmtJours(m.jours)}</td>
                    <td className="px-4 py-2.5 text-center text-slate-600">{STATUT_LABELS[m.statut] || m.statut}</td>
                    <td className="px-4 py-2.5 text-center font-semibold text-slate-700">{fmtJours(m.solde_apres)}</td>
                    <td className="px-4 py-2.5 text-slate-500">{m.motif || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}