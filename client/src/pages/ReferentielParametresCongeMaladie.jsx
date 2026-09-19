import { useEffect, useState } from 'react';
import { api } from '../api';
import { IconCalendarCheck, IconHeart, IconSave, IconSettings } from '../components/icons';

const RUBRIQUES = [
  { id: 'types', label: 'Types de congés' },
  { id: 'quotas', label: 'Quotas annuels et cumuls' },
  { id: 'prelevement', label: 'Règles de prélèvement' },
  { id: 'maladie', label: 'Durées et conditions de l\'arrêt maladie' },
  { id: 'seuils', label: 'Seuils et alertes de solde' },
];

function RubriquePlaceholder({ titre }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 p-8 text-center">
      <IconSettings />
      <p className="mt-2 text-sm text-slate-500">
        Rubrique « {titre} » à construire dans une prochaine version.
      </p>
    </div>
  );
}

function RulesPrelevement() {
  const [form, setForm] = useState({
    ma_jours_payes: 5,
    ma_deduire_excedent: true,
    ma_deduire_episodes_suivants: true,
    a1_jours: 1,
    mald_jours: 1,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState(null);

  const charger = () => {
    setLoading(true);
    setError('');
    api.reglesPrelevement()
      .then(({ regles }) => {
        setForm({
          ma_jours_payes: regles.ma_jours_payes ?? 5,
          ma_deduire_excedent: regles.ma_deduire_excedent !== false,
          ma_deduire_episodes_suivants: regles.ma_deduire_episodes_suivants !== false,
          a1_jours: regles.a1_jours ?? 1,
          mald_jours: regles.mald_jours ?? 1,
        });
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(charger, []);

  const basculer = (cle, str) =>
    setForm((f) => ({ ...f, [cle]: str ? Number(str) : 0 }));

  const enregistrer = async () => {
    const temps = Number(form.ma_jours_payes);
    const a1 = Number(form.a1_jours);
    const mald = Number(form.mald_jours);
    if (!Number.isFinite(temps) || temps < 0 || temps > 30) {
      setError('Les jours payés du 1er épisode MA doivent être entre 0 et 30.');
      return;
    }
    if (!Number.isFinite(a1) || a1 < 0 || a1 > 10 || !Number.isFinite(mald) || mald < 0 || mald > 10) {
      setError('Les jours déduits par jour A1 / MALD doivent être entre 0 et 10.');
      return;
    }
    setSaving(true);
    setError('');
    setMessage(null);
    try {
      await api.sauverReglesPrelevement({
        ma_jours_payes: temps,
        ma_deduire_excedent: !!form.ma_deduire_excedent,
        ma_deduire_episodes_suivants: !!form.ma_deduire_episodes_suivants,
        a1_jours: a1,
        mald_jours: mald,
      });
      setMessage({ type: 'ok', texte: 'Règles de prélèvement enregistrées.' });
    } catch (e) {
      setMessage({ type: 'err', texte: e.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="py-10 text-center text-sm text-slate-400">Chargement des règles de prélèvement…</p>;
  }

  return (
    <div className="card space-y-5 p-5">
      <div>
        <p className="flex items-center gap-2 text-sm font-bold text-slate-700">
          <IconHeart /> Déduction de la maladie courte (MA)
        </p>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          Les jours MA sont regroupés en <b>épisodes consécutifs</b> (jours de maladie successifs sans coupure).
          Règle de l'entreprise : <b>1re maladie</b> payée jusqu'au seuil ci-dessous (l'excédent est déduit) ;
          <b> la 2e maladie non successive</b> (et les suivantes) du même cycle est <b>déduite en entier</b>.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block text-xs text-slate-600">
          Jours payés du 1er épisode maladie (seuil)
          <input className="input mt-1 w-full py-1 text-xs" type="number" min="0" max="30" value={form.ma_jours_payes}
            onChange={(e) => basculer('ma_jours_payes', e.target.value)} />
          <span className="mt-1 block text-[10px] text-slate-400">
            Jours de maladie au-delà de ce seuil, sur le 1er épisode, sont déduits.
          </span>
        </label>
        <label className="block text-xs text-slate-600">
          Jours déduits par jour d'absence A1
          <input className="input mt-1 w-full py-1 text-xs" type="number" min="0" max="10" step="0.5" value={form.a1_jours}
            onChange={(e) => basculer('a1_jours', e.target.value)} />
        </label>
        <label className="block text-xs text-slate-600">
          Jours déduits par jour de maladie longue (MALD)
          <input className="input mt-1 w-full py-1 text-xs" type="number" min="0" max="10" step="0.5" value={form.mald_jours}
            onChange={(e) => basculer('mald_jours', e.target.value)} />
        </label>
      </div>

      <div className="space-y-2 rounded-xl bg-slate-50/70 p-3 ring-1 ring-slate-200">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-700">
          <input type="checkbox" checked={form.ma_deduire_excedent}
            onChange={(e) => setForm((f) => ({ ...f, ma_deduire_excedent: e.target.checked }))} />
          Déduire l'excédent du 1er épisode au-delà du seuil
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-700">
          <input type="checkbox" checked={form.ma_deduire_episodes_suivants}
            onChange={(e) => setForm((f) => ({ ...f, ma_deduire_episodes_suivants: e.target.checked }))} />
          Déduire en entier la 2e maladie (et les suivantes) non successives du même cycle
        </label>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}
      {message && (
        <p className={`rounded-lg px-4 py-3 text-sm font-semibold ring-1 ${message.type === 'ok' ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : 'bg-red-50 text-red-700 ring-red-200'}`}>
          {message.texte}
        </p>
      )}

      <button type="button" onClick={enregistrer} disabled={saving}
        className="flex items-center gap-2 rounded-lg bg-brand-700 px-4 py-2 text-xs font-bold text-white hover:bg-brand-800 disabled:opacity-50">
        <IconSave /> {saving ? 'Enregistrement…' : 'Enregistrer les règles'}
      </button>
    </div>
  );
}

export default function ReferentielParametresCongeMaladie() {
  const [onglet, setOnglet] = useState('prelevement');

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <h2 className="text-lg font-bold text-slate-900">PARAMÈTRES DE CONGÉ & MALADIE</h2>
        <p className="text-sm text-slate-500">
          Référentiel des congés et des arrêts maladie : types, quotas, règles de prélèvement, durées et seuils.
        </p>
      </div>

      {/* Onglets des rubriques */}
      <div className="print:hidden flex flex-wrap gap-1.5">
        {RUBRIQUES.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setOnglet(r.id)}
            className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
              onglet === r.id
                ? 'bg-brand-700 text-white shadow-sm'
                : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${onglet === r.id ? 'bg-white' : 'bg-slate-300'}`} />
            {r.label}
          </button>
        ))}
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-700/10 text-brand-700">
          <IconCalendarCheck />
        </span>
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">
            {RUBRIQUES.find((r) => r.id === onglet)?.label}
          </h3>
          <p className="mt-1 max-w-3xl text-xs text-slate-500">
            {onglet === 'prelevement' ? (
              <>Règles de déduction utilisées par le moteur de calcul de la paie (unité Forfaitaire
                et régime Horaire) pour les absences A1, la maladie courte MA et la maladie longue MALD.</>
            ) : (
              <>Paramètres relatifs à la rubrique « {RUBRIQUES.find((r) => r.id === onglet)?.label} ».
                Ils seront rendus configurables dans une prochaine version.</>
            )}
          </p>
        </div>
      </div>

      {onglet === 'prelevement' ? (
        <RulesPrelevement />
      ) : (
        <RubriquePlaceholder titre={RUBRIQUES.find((r) => r.id === onglet)?.label} />
      )}
    </div>
  );
}