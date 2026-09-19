import { useEffect, useState } from 'react';
import { api } from '../api';
import {
  IconIdentification,
  IconShieldCheck,
  IconCreditCard,
  IconMapPin,
  IconEnvelope,
  IconUserCheck,
  IconBuildingOffice,
  IconUpload,
  IconTrash,
  IconRefresh,
} from '../components/icons';

const GOUVERNORATS = [
  'Tunis', 'Ariana', 'Ben Arous', 'Manouba', 'Nabeul', 'Zaghouan', 'Bizerte',
  'Béja', 'Jendouba', 'Le Kef', 'Siliana', 'Sousse', 'Monastir', 'Mahdia',
  'Sfax', 'Kairouan', 'Kasserine', 'Sidi Bouzid', 'Gabès', 'Médenine',
  'Tataouine', 'Gafsa', 'Tozeur', 'Kébili',
];

const FORMES_JURIDIQUES = ['SUARL', 'SARL', 'SA', 'SNC', 'SCA', 'Association', 'ONG', 'Autre'];

const MAX_FICHIER = 1024 * 1024; // 1 Mo → base64 ≈ 1,33 Mo, sous la limite body de 2 Mo

function lireFichier(f) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(new Error("Impossible de lire l'image."));
    fr.readAsDataURL(f);
  });
}

function Champ({ label, hint, required, children }) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {label} {required && <span className="text-brand-600">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

function FileChamp({ valeur, onChange, surfiltre }) {
  const [erreur, setErreur] = useState('');
  const choisir = async (e) => {
    const f = e.target.files && e.target.files[0];
    setErreur('');
    if (!f) return;
    if (f.size > MAX_FICHIER) {
      setErreur('Fichier trop volumineux (maximum 1 Mo).');
      e.target.value = '';
      return;
    }
    try {
      const b64 = await lireFichier(f);
      onChange(b64);
    } catch (err) {
      const sc = e.target.value;
      const nom = sc.split('\\').pop().split('/').pop();
      setErreur(`Lecture impossible pour « ${nom} ».`);
    }
    e.target.value = '';
  };
  const retirer = (e) => {
    e.stopPropagation();
    onChange('');
    setErreur('');
  };
  return (
    <div>
      <div className="flex items-center gap-2">
        {valeur ? (
          <>
            <span className="relative inline-flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg ring-1 ring-slate-200">
              <img src={valeur} alt="" className="h-full w-full object-contain" />
            </span>
            <button type="button" className="btn-secondary h-9 text-xs" onClick={retirer}>
              <IconTrash /> Retirer
            </button>
          </>
        ) : (
          <label
            className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            <IconUpload /> Parcourir…
            <input type="file" accept={surfiltre} className="hidden" onChange={choisir} />
          </label>
        )}
      </div>
      {erreur && <p className="mt-1 text-[11px] font-semibold text-red-600">{erreur}</p>}
    </div>
  );
}

export default function ParametresGeneraux() {
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    api.parametresGeneraux()
      .then((r) => setForm(r || {}))
      .catch((e) => setMessage({ type: 'err', texte: e.message }))
      .finally(() => setLoading(false));
  }, []);

  const set = (key) => (val) => {
    setForm((f) => ({ ...f, [key]: val }));
    setMessage(null);
  };
  const setTexte = (key) => (e) => set(key)(e.target.value);

  const sauver = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await api.sauverParametresGeneraux(form || {});
      setMessage({ type: 'ok', texte: 'Identité de l’organisme enregistrée avec succès.' });
    } catch (e) {
      setMessage({ type: 'err', texte: e.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading || !form) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <span className="icon-badge" style={{ color: 'var(--brand-700)' }}><IconBuildingOffice /></span>
          <div>
            <h2 className="text-xl font-bold text-brand-700">IDENTITÉ DE L’ORGANISME</h2>
            <p className="text-sm text-slate-500">Chargement des informations de l’employeur…</p>
          </div>
        </div>
        <div className="card p-10 text-center text-sm text-slate-400">Chargement…</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Titre principal */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-700/10 text-brand-700">
          <IconBuildingOffice />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold text-brand-700">IDENTITÉ DE L’ORGANISME</h2>
          <p className="text-sm text-slate-500">
            Informations légales, sociales, bancaires et administratives de l’employeur — utilisées sur les
            bulletins de paie, attestations et documents officiels.
          </p>
        </div>
        <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-brand-700 ring-1 ring-brand-200">
          Référentiel
        </span>
      </div>

      {message && (
        <p className={`rounded-lg px-4 py-3 text-sm font-semibold ring-1 ${message.type === 'ok' ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : 'bg-red-50 text-red-700 ring-red-200'}`}>
          {message.texte}
        </p>
      )}

      {/* 1. Identifiants légaux et fiscaux */}
      <section className="card p-5">
        <header className="mb-4 flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-brand-700" style={{ background: 'var(--brand-50)' }}>
            <IconIdentification /></span>
          <div>
            <h3 className="text-sm font-bold text-slate-800">1. Identifiants légaux et fiscaux</h3>
            <p className="text-xs text-slate-500">Données officielles d’identification de l’entreprise.</p>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Champ label="Raison Sociale" required hint="Dénomination légale officielle de l'entreprise.">
              <input className="input" placeholder="Ex : Amicale du Personnel — Banque Centrale" value={form.raison_sociale || ''} onChange={setTexte('raison_sociale')} />
            </Champ>
          </div>

          <div>
            <Champ label="Matricule fiscal — Régime">
              <input className="input" placeholder="Régime" value={form.mf_regime || ''} onChange={setTexte('mf_regime')} />
            </Champ>
          </div>
          <div>
            <Champ label="Matricule fiscal — Code TVA">
              <input className="input" placeholder="Code TVA" value={form.mf_tva || ''} onChange={setTexte('mf_tva')} />
            </Champ>
          </div>
          <div>
            <Champ label="Matricule fiscal — Code catégorie">
              <input className="input" placeholder="Code catégorie" value={form.mf_categorie || ''} onChange={setTexte('mf_categorie')} />
            </Champ>
          </div>
          <div>
            <Champ label="Matricule fiscal — Clé" hint="Indispensable pour les déclarations d'impôts et la paie.">
              <input className="input" placeholder="Clé" value={form.mf_cle || ''} onChange={setTexte('mf_cle')} />
            </Champ>
          </div>

          <div>
            <Champ label="Numéro RNE" hint="Identifiant unique au Registre National des Entreprises.">
              <input className="input" placeholder="Ex : 1234567" value={form.rne || ''} onChange={setTexte('rne')} />
            </Champ>
          </div>
          <div>
            <Champ label="Forme juridique">
              <select className="input" value={form.forme_juridique || ''} onChange={setTexte('forme_juridique')}>
                <option value="">— Sélectionner —</option>
                {FORMES_JURIDIQUES.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </Champ>
          </div>
          <div>
            <Champ label="Code douane" hint="Si entreprise exportatrice/importatrice ou sous régime totalement exportateur.">
              <input className="input" placeholder="Code douane" value={form.code_douane || ''} onChange={setTexte('code_douane')} />
            </Champ>
          </div>
          <div>
            <Champ label="Capital social" hint="Montant du capital en TND.">
              <div className="relative">
                <input className="input pe-16" type="number" min="0" step="0.001" placeholder="0" value={form.capital_social || ''} onChange={setTexte('capital_social')} />
                <span className="pointer-events-none absolute inset-y-0 end-0 flex items-center pe-3 text-xs font-semibold text-slate-400">TND</span>
              </div>
            </Champ>
          </div>
        </div>
      </section>

      {/* 2. Organismes sociaux et sécurité sociale */}
      <section className="card p-5">
        <header className="mb-4 flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-emerald-700" style={{ background: 'var(--emerald-50, #ecfdf5)' }}>
            <IconShieldCheck /></span>
          <div>
            <h3 className="text-sm font-bold text-slate-800">2. Organismes sociaux et sécurité sociale</h3>
            <p className="text-xs text-slate-500">Affiliations (CNSS), assurance accidents du travail et conventions.</p>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Champ label="Numéro d'affiliation CNSS" required hint="Identifiant principal de l'employeur auprès de la CNSS.">
              <input className="input" placeholder="N° d'affiliation CNSS" value={form.cnss || ''} onChange={setTexte('cnss')} />
            </Champ>
          </div>
          <div>
            <Champ label="Taux accident du travail (AT)" hint="Pourcentage spécifique au secteur pour le calcul des cotisations.">
              <div className="relative">
                <input className="input pe-10" type="number" min="0" max="100" step="0.01" placeholder="0,00" value={form.taux_at || ''} onChange={setTexte('taux_at')} />
                <span className="pointer-events-none absolute inset-y-0 end-0 flex items-center pe-3 text-xs font-semibold text-slate-400">%</span>
              </div>
            </Champ>
          </div>
          <div>
            <Champ label="Convention collective appliquée" hint="Détermine les minima salariaux, préavis et primes sectorielles.">
              <input className="input" placeholder="Ex : Convention de la banque" value={form.convention_collective || ''} onChange={setTexte('convention_collective')} />
            </Champ>
          </div>
          <div>
            <Champ label="Bureau CNSS de rattachement" hint="Centre régional dont dépend l'entreprise.">
              <input className="input" placeholder="Ex : CNSS Tunis" value={form.bureau_cnss || ''} onChange={setTexte('bureau_cnss')} />
            </Champ>
          </div>
          <div className="sm:col-span-2">
            <Champ label="Organisme de médecine du travail" hint="Groupement ou service autonome auquel l'entreprise adhère.">
              <input className="input" placeholder="Ex : Groupement de médecine du travail du Nord" value={form.medecine_travail || ''} onChange={setTexte('medecine_travail')} />
            </Champ>
          </div>
        </div>
      </section>

      {/* 3. Coordonnées bancaires */}
      <section className="card p-5">
        <header className="mb-4 flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sky-700" style={{ background: 'var(--sky-50, #f0f9ff)' }}>
            <IconCreditCard /></span>
          <div>
            <h3 className="text-sm font-bold text-slate-800">3. Coordonnées bancaires</h3>
            <p className="text-xs text-slate-500">Compte bancaire principal utilisé pour la gestion de la paie.</p>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Champ label="RIB entreprise" hint="20 chiffres : code banque, code guichet, numéro de compte, clé RIB — requis pour les télévirements.">
              <input className="input font-mono" maxLength={20} placeholder="20 chiffres" value={form.rib || ''} onChange={setTexte('rib')} />
            </Champ>
          </div>
          <div>
            <Champ label="Nom de la banque et agence" hint="Établissement bancaire principal de paiement.">
              <input className="input" placeholder="Ex : Banque Centrale — Agence Centrale" value={form.banque_agence || ''} onChange={setTexte('banque_agence')} />
            </Champ>
          </div>
          <div>
            <Champ label="Code Swift / BIC" hint="Requis pour les virements ou transactions internationales.">
              <input className="input font-mono uppercase" placeholder="Ex : BCTNTNTT" value={form.swift || ''} onChange={setTexte('swift')} />
            </Champ>
          </div>
        </div>
      </section>

      {/* 4. Adresse et localisation */}
      <section className="card p-5">
        <header className="mb-4 flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-rose-700" style={{ background: 'var(--rose-50, #fff1f2)' }}>
            <IconMapPin /></span>
          <div>
            <h3 className="text-sm font-bold text-slate-800">4. Adresse et localisation</h3>
            <p className="text-xs text-slate-500">Localisation du siège social et segmentations administratives.</p>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Champ label="Gouvernorat" hint="Élément clé pour les segmentations administratives locales.">
              <select className="input" value={form.gouvernorat || ''} onChange={setTexte('gouvernorat')}>
                <option value="">— Sélectionner —</option>
                {GOUVERNORATS.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </Champ>
          </div>
          <div>
            <Champ label="Ville et code postal">
              <input className="input" placeholder="Ex : Tunis 1001" value={form.ville_cp || ''} onChange={setTexte('ville_cp')} />
            </Champ>
          </div>
          <div className="sm:col-span-2">
            <Champ label="Adresse du siège social" hint="Rue, numéro et bâtiment.">
              <input className="input" placeholder="Ex : Avenue de la Liberté, Imm. N° 12" value={form.adresse || ''} onChange={setTexte('adresse')} />
            </Champ>
          </div>
          <div>
            <Champ label="Pays">
              <input className="input" placeholder="Tunisie" value={form.pays || 'Tunisie'} onChange={setTexte('pays')} />
            </Champ>
          </div>
        </div>
      </section>

      {/* 5. Contacts et communication RH */}
      <section className="card p-5">
        <header className="mb-4 flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-violet-700" style={{ background: 'var(--violet-50, #f5f3ff)' }}>
            <IconEnvelope /></span>
          <div>
            <h3 className="text-sm font-bold text-slate-800">5. Contacts et communication RH</h3>
            <p className="text-xs text-slate-500">Coordonnées de communication officielles et éléments de marque.</p>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Champ label="Email RH / administratif" hint="Adresse utilisée sur les bulletins et communications officielles.">
              <input className="input" type="email" placeholder="rh@organisme.tn" value={form.email_rh || ''} onChange={setTexte('email_rh')} />
            </Champ>
          </div>
          <div>
            <Champ label="Numéro de téléphone principal">
              <input className="input" type="tel" placeholder="+216 .. ... ..." value={form.telephone || ''} onChange={setTexte('telephone')} />
            </Champ>
          </div>
          <div>
            <Champ label="Site web officiel" hint="Information complémentaire.">
              <input className="input" type="url" placeholder="https://www.organisme.tn" value={form.site_web || ''} onChange={setTexte('site_web')} />
            </Champ>
          </div>
          <div>
            <Champ label="Logo officiel" hint="Format image — injecté sur les bulletins de paie et attestations.">
              <FileChamp valeur={form.logo || ''} onChange={set('logo')} surfiltre="image/*" />
            </Champ>
          </div>
        </div>
      </section>

      {/* 6. Représentation légale et signatures */}
      <section className="card p-5">
        <header className="mb-4 flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-amber-700" style={{ background: 'var(--amber-50, #fffbeb)' }}>
            <IconUserCheck /></span>
          <div>
            <h3 className="text-sm font-bold text-slate-800">6. Représentation légale et signatures</h3>
            <p className="text-xs text-slate-500">Personne habilitée à représenter légalement l'organisme.</p>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Champ label="Nom et prénom du représentant légal" required hint="Gérant, PDG, etc.">
              <input className="input" placeholder="Ex : Mohamed Ben Ali" value={form.representant_nom || ''} onChange={setTexte('representant_nom')} />
            </Champ>
          </div>
          <div>
            <Champ label="Qualité / titre du représentant légal">
              <input className="input" placeholder="Ex : Gérant, PDG" value={form.representant_titre || ''} onChange={setTexte('representant_titre')} />
            </Champ>
          </div>
          <div>
            <Champ label="Numéro CIN / carte de séjour" hint="Du représentant légal.">
              <input className="input" placeholder="Numéro CIN" value={form.representant_cin || ''} onChange={setTexte('representant_cin')} />
            </Champ>
          </div>
          <div>
            <Champ label="Signature numérique / griffe" hint="Fichier image pour l'édition automatique des contrats et soldes de tout compte.">
              <FileChamp valeur={form.signature || ''} onChange={set('signature')} surfiltre="image/*" />
            </Champ>
          </div>
        </div>
      </section>

      {/* Barre d'enregistrement */}
      <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-500">
          <IconRefresh className="me-1 inline" /> Les champs <strong>obligatoires</strong> sont marqués d'une
          astérisque (<span className="text-brand-600">*</span>). Les images (logo, signature) sont stockées
          dans la base et réutilisées sur les documents émis.
        </p>
        <div className="flex items-center gap-2">
          {message && message.type === 'ok' && (
            <span className="text-xs font-bold uppercase tracking-wide text-emerald-600">Enregistré</span>
          )}
          <button className="btn-primary" onClick={sauver} disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer l’identité de l’organisme'}
          </button>
        </div>
      </div>
    </div>
  );
}