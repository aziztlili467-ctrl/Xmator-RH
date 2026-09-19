import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { IconPrinter, IconPlus, IconTrash, IconRefresh, IconBanknotes, IconSave } from './icons';
import { calculerIRPP, parseSituationFamille } from '../utils/irpp';

// ---------------------------------------------------------------------------
// Utilitaires : conversion des nombres en lettres (français) + montants DT
// ---------------------------------------------------------------------------
const UNITE = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
  'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
const DIZAINE = ['', 'dix', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante',
  'quatre-vingt', 'quatre-vingt'];

function moinsDeCent(n) {
  if (n < 20) return UNITE[n];
  const d = Math.floor(n / 10);
  const u = n % 10;
  if (d === 7 || d === 9) {
    const base = DIZAINE[d];
    if (d === 7 && u === 1) return 'soixante et onze';
    return base + '-' + UNITE[10 + u];
  }
  if (u === 0) return d === 8 ? 'quatre-vingts' : DIZAINE[d];
  const lien = d >= 2 && d <= 6 && u === 1 ? ' et ' : '-';
  return DIZAINE[d] + lien + UNITE[u];
}

function troisChiffres(n, suiviParMot) {
  const c = Math.floor(n / 100);
  const reste = n % 100;
  let s = '';
  if (c === 1) s = 'cent';
  else if (c > 1) s = UNITE[c] + ' cent';
  if (reste === 0) return c > 1 && !suiviParMot ? s + 's' : s;
  if (s) s += ' ';
  return s + moinsDeCent(reste);
}

function nombreEnLettres(n) {
  n = Math.floor(n);
  if (n === 0) return 'zéro';
  const millions = Math.floor(n / 1000000);
  const milliers = Math.floor((n % 1000000) / 1000);
  const reste = n % 1000;
  const parts = [];
  if (millions) parts.push(millions === 1 ? 'un million' : nombreEnLettres(millions) + ' millions');
  if (milliers) parts.push(milliers === 1 ? 'mille' : troisChiffres(milliers, true) + ' mille');
  if (reste) parts.push(troisChiffres(reste, false));
  return parts.join(' ');
}

function montantEnLettres(amt) {
  if (!Number.isFinite(amt)) amt = 0;
  const dinars = Math.floor(amt);
  let millimes = Math.round((amt - dinars) * 1000);
  let d = dinars;
  if (millimes === 1000) { d += 1; millimes = 0; }
  let s = nombreEnLettres(d) + (d > 1 ? ' dinars' : ' dinar');
  if (millimes > 0) s += ' et ' + nombreEnLettres(millimes) + (millimes > 1 ? ' millimes' : ' millime');
  return s;
}

function fmt(n) {
  const v = Number(n) || 0;
  const s = v.toFixed(3).replace('.', ',');
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function fmtQ(n, max = 2) {
  const v = Number(n) || 0;
  return v.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: max });
}

// ---------------------------------------------------------------------------
// Classification des codes du bulletin de paie
// ---------------------------------------------------------------------------
const CODES_TOTAUX = ['50000', '55000', '70011', '10000'];
const CODES_CNSS = ['50011'];
const CODES_IRPP = ['55011'];
const CODES_CSS = ['55023'];
const CODES_SOCIALES = ['53011', '53021', '53031'];
const CODES_DIVERSES = ['80011', '80021', '85041', '85051'];
// Rubriques dont le montant se calcule à partir d'un taux (comme la CNSS 9,18 %), saisi dans la colonne « Nbr / Taux » :
// 53011 / 53021 / 53031 → % du brut cotisable ; 55011 (IRPP) → % du salaire imposable (sinon barème).
const CODES_TAUX_RETENUES = ['53011', '53021', '53031', '55011'];

function typeRubrique(code) {
  const c = String(code);
  if (CODES_TOTAUX.includes(c)) return 'total';
  if (CODES_CNSS.includes(c)) return 'cnss';
  if (CODES_IRPP.includes(c)) return 'irpp';
  if (CODES_CSS.includes(c)) return 'css';
  if (CODES_SOCIALES.includes(c)) return 'sociale';
  if (CODES_DIVERSES.includes(c)) return 'diverse';
  return 'gain';
}

// Barème IRPP 2026 (réplique Excel) — voir utils/irpp.js (calculerIRPP).
// L'impôt mensuel (55011, mode barème) reprend le résultat « F24 » du Simulateur IRPP :
// 12 mois, frais professionnels −10 % plafonné 2 000, chef de famille −300, enfants −100.

// ---------------------------------------------------------------------------
// Données par défaut
// ---------------------------------------------------------------------------
const MOIS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août',
  'Septembre', 'Octobre', 'Novembre', 'Décembre'];

const MONTANTS_ECHANTILLON = {
  '5011': 2000,
  '10011': 75,
  '10021': 56,
  '10031': 150,
  '10051': 0,
  '25011': 300,
  '25031': 120,
  '53011': 25,
  '53021': 15,
  '80021': 150,
};

const EMPLOYE_DEFAUT = {
  matricule: '0042',
  nom: 'Mohamed Ben Ali',
  cnss: '12345678',
  qualification: 'Comptable',
  affectation: 'Banque Centrale',
  situationFamille: 'Marié, 2 enfants',
  categorieEchelon: 'CAT. 1 / Éch. 3',
  situationAdmin: 'Titulaire',
};

const MODES_PAIEMENT = ['Virement bancaire', 'Chèque', 'Espèces'];

// ---------------------------------------------------------------------------
// Composant réutilisable : bulletin de paie interactif
// ---------------------------------------------------------------------------
export default function BulletinDePaie({ employe: employeProp, montants: montantsProp, masquerSansValeur = false, peutSauver = false, chefFamille: chefFamilleProp, nbEnfants: nbEnfantsProp, periode: periodeProp, onPeriodeChange }) {
  const montantsBase = montantsProp && Object.keys(montantsProp).length ? montantsProp : MONTANTS_ECHANTILLON;
  const [org, setOrg] = useState({});
  const [lignes, setLignes] = useState([]);
  const [employe, setEmploye] = useState(employeProp || EMPLOYE_DEFAUT);
  const sitFam = chefFamilleProp !== undefined && nbEnfantsProp !== undefined
    ? { cf: chefFamilleProp ? 1 : 0, enfants: Number(nbEnfantsProp) || 0 }
    : parseSituationFamille((employeProp || EMPLOYE_DEFAUT).situationFamille);
  const [sitSaisie, setSitSaisie] = useState(() => ({ cf: sitFam.cf, enfants: sitFam.enfants }));
  const [periodeInterne, setPeriodeInterne] = useState(() => {
    const d = new Date();
    return { mois: d.getMonth(), annee: d.getFullYear() };
  });
  // Période contrôlable : si le parent fournit « periode » (ex. calendrier de Calcul de Paie),
  // elle pilote le bulletin ; sinon le bulletin garde sa période interne (comportement actuel).
  const periode = periodeProp || periodeInterne;
  const changerPeriode = (p) => {
    if (periodeProp && onPeriodeChange) onPeriodeChange(p);
    else setPeriodeInterne(p);
  };
  const [modePaiement, setModePaiement] = useState(MODES_PAIEMENT[0]);
  const [rib, setRib] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formAjoutOuvert, setFormAjoutOuvert] = useState(false);
  const [newLigne, setNewLigne] = useState({ libelle: '', type: 'gain', montant: '' });
  const [clignotant, setClignotant] = useState(null);
  const [savingRates, setSavingRates] = useState(false);
  const [msgRates, setMsgRates] = useState(null);
  // Cycle de calcul : résultat unifié du mois sélectionné (jours ou heures selon le mode — base −
  // absences A1 / MALD − carence MA), injecté dans la colonne « Nbr / Taux » de la ligne « Salaire de
  // base » (5011) et appliqué au montant (prorata jours ou régime horaire × prix heure).
  const [cycle, setCycle] = useState(null);
  // Retenues de crédits / avances du mois (module Crédits & Avances) : injectées
  // automatiquement dans la colonne « À déduire » tant que le CRD n'est pas soldé.
  const [prets, setPrets] = useState([]);
  const tauxInitRef = useRef({});
  const refDoc = useRef(null);

  useEffect(() => {
    let mort = false;
    Promise.all([api.parametresGeneraux(), api.reglesCalculPaie()])
      .then(([g, regles]) => {
        if (mort) return;
        setOrg(g || {});
        setRib(g?.rib || '');
        const tinit = {};
        (regles || []).forEach((r) => {
          const code = String(r.code);
          tinit[code] = r.taux ?? (code === '50011' ? 9.18 : code === '55023' ? 1 : null);
        });
        tauxInitRef.current = tinit;
        setLignes((regles || []).map((r) => {
          const code = String(r.code);
          return {
            id: `regle-${r.id}`,
            code,
            libelle: r.libelle,
            type: typeRubrique(code),
            montant: montantsBase[code] || 0,
            taux: tinit[code],
          };
        }));
      })
      .catch((e) => setError(e.message || 'Une erreur est survenue.'))
      .finally(() => { if (!mort) setLoading(false); });
    return () => { mort = true; };
  }, []);

  // Cycle de calcul : nbr_unites / base_unites / unite + prix_heure du mois sélectionné (résolu
  // dynamiquement sur le serveur selon le mode de calcul — forfaitaire, prorata ou régime horaire).
  useEffect(() => {
    let mort = false;
    const mat = String(employe?.matricule || '').trim();
    if (!mat) { setCycle(null); return undefined; }
    api.calculJoursPaie({ matricule: mat, annee: periode.annee, mois: periode.mois + 1 })
      .then((d) => {
        if (mort) return;
        if (d?.employe && d?.result && d?.periode) setCycle({ ...d.result, periode: d.periode });
        else setCycle(null);
      })
      .catch(() => { if (!mort) setCycle(null); });
    return () => { mort = true; };
  }, [employe?.matricule, periode.mois, periode.annee]);

  // Retenues de crédits/avances du mois : rechargées à chaque changement de période
  // (ou d'employé). Les lignes produites sont figées (non éditables) et ressortent
  // « À déduire » tant que le contrat est en cours — elles disparaissent quand le CRD = 0.
  useEffect(() => {
    let mort = false;
    const mat = String(employe?.matricule || '').trim();
    if (!mat) { setPrets([]); return undefined; }
    api.creditsPrets({ matricule: mat, annee: periode.annee, mois: periode.mois + 1 })
      .then((d) => {
        if (mort) return;
        setPrets((d?.prets || []).map((p, i) => ({
          id: `pret-${p.code_paie}-${i}`,
          code: String(p.code_paie),
          libelle: p.libelle,
          type: 'diverse',
          montant: Number(p.montant) || 0,
          taux: null,
          pret: true,
        })));
      })
      .catch(() => { if (!mort) setPrets([]); });
    return () => { mort = true; };
  }, [employe?.matricule, periode.mois, periode.annee]);

  // Sous-total des rubriques : lignes officielles + retenues de crédit du mois.
  // Les retenues sont insérées avant la première ligne « total » du bulletin
  // (avant NET À PAYER), comme les autres rubriques de déduction.
  // ---- Placement des retenues de crédits / avances dans le bulletin ----
  // Exigence de rattachement : la rubrique 5301 « AID IL IDHAA » et TOUTES les autres retenues
  // de crédit doivent figurer SOUS la ligne « SALAIRE NET (Total/Sous-total) » (code 70011),
  // c'est-à-dire entre cette ligne et « NET À PAYER » (10000), comme les autres déductions du net.
  // On insère donc les crédits juste après la ligne de totale 70011 (et non avant le premier
  // total rencontré, qui serait le BRUT COTISABLE 50000 et placerait les crédits trop haut).
  const lignesEff = useMemo(() => {
    if (!prets.length) return lignes;
    const cible = String(CODES_TOTAUX.find((c) => String(c) === '70011') ?? '70011');
    const idxNet = lignes.findIndex((x) => x.type === 'total' && String(x.code) === cible);
    if (idxNet !== -1) return [...lignes.slice(0, idxNet + 1), ...prets, ...lignes.slice(idxNet + 1)];
    const idx = lignes.findIndex((x) => x.type === 'total');
    if (idx === -1) return [...lignes, ...prets];
    return [...lignes.slice(0, idx), ...prets, ...lignes.slice(idx)];
  }, [lignes, prets]);

  const setEmp = (k) => (e) => { setEmploye((x) => ({ ...x, [k]: e.target.value })); };
  const setMontant = (id) => (e) => {
    const v = e.target.value;
    setLignes((xs) => xs.map((x) => (x.id === id ? { ...x, montant: v === '' ? '' : Number(v) } : x)));
  };
  const setTaux = (id) => (e) => {
    const v = e.target.value;
    setLignes((xs) => xs.map((x) => (x.id === id ? { ...x, taux: v === '' ? '' : Number(v) } : x)));
  };

  const valeurTaux = (x) => {
    if (x.taux === null || x.taux === undefined || x.taux === '') return null;
    const n = Number(x.taux);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const estTauxCode = (x) => CODES_TAUX_RETENUES.includes(String(x.code));

  const brutGains = lignesEff.filter((x) => x.type === 'gain').reduce((s, x) => s + (Number(x.montant) || 0), 0);
  // Cycle de calcul actif : résultat unifié du serveur — « nbr_unites / base_unites / unite » où l'unité
  // est 'jours' (modes forfaitaire & prorata) ou 'heures' (mode régime horaire, avec « prix_heure »).
  // Mode jours : montant 5011 = salaire de base × Nbr unités / base. Mode horaire : montant 5011 = Nbr
  // heures × prix de l'heure (équivaut à base × N / régime horaire). Le brut cotisable retient toujours
  // le salaire de base adapté au cycle au lieu du salaire contractuel plein.
  const cycleActif = cycle && cycle.nbr_unites != null && cycle.base_unites != null ? cycle : null;
  const estModeHeures = (cycleActif || {}).unite === 'heures';
  const base5011 = cycleActif ? (Number(lignesEff.find((x) => String(x.code) === '5011')?.montant) || 0) : 0;
  const montant5011 = cycleActif
    ? estModeHeures
      ? cycleActif.nbr_unites * (cycleActif.prix_heure || base5011 / (cycleActif.base_unites || 30))
      : base5011 * (cycleActif.nbr_unites / (cycleActif.base_unites || 30))
    : 0;
  const brutCotis = cycleActif ? brutGains - base5011 + montant5011 : brutGains;
  const cnssRow = lignesEff.find((x) => x.type === 'cnss');
  const irreTaux = cnssRow?.taux ?? 9.18;
  const cnss = brutCotis * (irreTaux / 100);

  // Retenues sociales : 53011 / 53021 / 53031 calculées par un taux (% du brut cotisable), comme la CNSS ;
  // les autres rubriques sociales restent saisies en montant.
  const sociales = lignesEff.filter((x) => x.type === 'sociale').reduce((s, x) => {
    if (estTauxCode(x)) {
      const t = valeurTaux(x);
      return s + (t !== null ? brutCotis * (t / 100) : 0);
    }
    return s + (Number(x.montant) || 0);
  }, 0);

  // SALAIRE IMPOSABLE = SALAIRE BRUT COTISABLE − toutes les rubriques figurant sous le brut.
  // Déduction structurale : toute ligne située entre la ligne « SALAIRE BRUT COTISABLE » (50000)
  // et la ligne « SALAIRE IMPOSABLE » (55000) — CNSS, assurance/mutuelle, caisse sociale/amicale,
  // cantine, etc. — est automatiquement soustraite du brut.
  const idxBrut = lignesEff.findIndex((x) => String(x.code) === '50000');
  const idxImposable = lignesEff.findIndex((x) => String(x.code) === '55000');
  const deductionLigne = (x) => {
    const t = valeurTaux(x);
    if (x.type === 'cnss') return brutCotis * (Number(x.taux ?? 9.18) / 100);
    if (x.type === 'sociale' && estTauxCode(x)) return t !== null ? brutCotis * (t / 100) : 0;
    return Number(x.montant) || 0;
  };
  const deductionsSousBrut = idxBrut !== -1 && idxImposable !== -1 && idxImposable > idxBrut
    ? lignesEff.slice(idxBrut + 1, idxImposable).filter((x) => x.type !== 'total').reduce((s, x) => s + deductionLigne(x), 0)
    : cnss + sociales;
  const imposable = brutCotis - deductionsSousBrut;

  const sim = calculerIRPP(imposable, { cf: sitSaisie.cf, enfants: sitSaisie.enfants });

  // IRPP (55011) : taux saisi (% du salaire imposable) si renseigné, sinon simulation IRPP 2026
  // (même calcul que le Simulateur IRPP : F24 = impôt mensuel à partir du salaire imposable mensuel).
  const irppRow = lignesEff.find((x) => x.type === 'irpp');
  const irppTaux = irppRow ? valeurTaux(irppRow) : null;
  const irpp = irppTaux !== null
    ? imposable * (irppTaux / 100)
    : sim.F24;

  // CSS (55023) : synchronisée avec le Simulateur IRPP — seule la valeur mensuelle F25
  // (0,5 % du salaire imposable annuel théorique F12, rapportée au mois) est intégrée à la fiche.
  const css = -1 * sim.F25;

  // SALAIRE NET = SALAIRE IMPOSABLE − (IMPÔT + CSS). L'impôt (barème F24 négatif) est
  // déduit en valeur absolue ; le résultat équivaut au « Salaire net mensuel F26 » du simulateur.
  const net = imposable - Math.abs(irpp) - css;

  const diverses = lignesEff.filter((x) => x.type === 'diverse').reduce((s, x) => s + (Number(x.montant) || 0), 0);
  const netAPayer = net - diverses;

  const totaux = { brutCotis, cnss, sociales, imposable, irpp, css, net, diverses, netAPayer };

  const montantDe = (x) => {
    if (String(x.code) === '5011' && cycleActif) {
      const base = Number(x.montant) || 0;
      if (estModeHeures) {
        const prix = cycleActif.prix_heure || base / (cycleActif.base_unites || 30);
        return cycleActif.nbr_unites * prix;
      }
      return base * (cycleActif.nbr_unites / (cycleActif.base_unites || 30));
    }
    switch (x.type) {
      case 'total':
        if (String(x.code) === '50000') return totaux.brutCotis;
        if (String(x.code) === '55000') return totaux.imposable;
        if (String(x.code) === '70011') return totaux.net;
        if (String(x.code) === '10000') return totaux.netAPayer;
        return 0;
      case 'cnss': return totaux.cnss;
      case 'irpp': return totaux.irpp;
      case 'css': return totaux.css;
      case 'sociale': {
        if (estTauxCode(x)) {
          const t = valeurTaux(x);
          return t !== null ? totaux.brutCotis * (t / 100) : 0;
        }
        return Number(x.montant) || 0;
      }
      default: return Number(x.montant) || 0;
    }
  };

  const libelleDe = (x) => {
    if (x.type === 'cnss') return `CNSS (Cotisation Salariale — ${Number(x.taux ?? 9.18).toLocaleString('fr-FR')} %)`;
    if (x.type === 'css') return `Contribution Sociale de Solidarité (CSS — ${Number(x.taux ?? 1).toLocaleString('fr-FR')} %)`;
    if (x.type === 'irpp') {
      const t = valeurTaux(x);
      return t !== null
        ? `Impôts sur le Revenu (IRPP — ${t.toLocaleString('fr-FR')} %)`
        : 'Impôts sur le Revenu (IRPP — barème)';
    }
    return x.libelle;
  };

  const lignesVisibles = masquerSansValeur
    ? lignesEff.filter((x) => x.type === 'total' || estTauxCode(x) || montantDe(x) !== 0
        || (String(x.code) === '5011' && cycleActif))
    : lignesEff;

  const prochainCode = (type, lignesActuelles) => {
    const groupe = type === 'gain' ? lignesActuelles.filter((x) => x.type === 'gain')
      : type === 'sociale' ? lignesActuelles.filter((x) => x.type === 'sociale')
      : lignesActuelles.filter((x) => x.type === 'diverse');
    const max = groupe.reduce((m, x) => Math.max(m, Number(x.code) || 0), 0);
    return String(max + 1);
  };

  const ajouterLigne = () => {
    if (!String(newLigne.libelle || '').trim()) {
      setError('Saisissez un libellé pour la rubrique.');
      return;
    }
    const type = newLigne.type;
    const code = prochainCode(type, lignes);
    const nv = {
      id: `ajout-${Date.now()}`,
      code,
      libelle: String(newLigne.libelle).trim(),
      type,
      montant: newLigne.montant === '' ? 0 : Number(newLigne.montant),
      taux: null,
    };
    setLignes((xs) => {
      let position = xs.length;
      const ordre = type === 'gain' ? 49000 : type === 'sociale' ? 54000 : 79000;
      const idx = xs.findIndex((x) => (Number(x.code) || 0) >= ordre);
      if (idx !== -1) position = idx;
      const copie = [...xs];
      copie.splice(position, 0, nv);
      return copie;
    });
    setNewLigne({ libelle: '', type: 'gain', montant: '' });
    setFormAjoutOuvert(false);
    setClignotant(nv.id);
    setTimeout(() => setClignotant(null), 2000);
  };

  const supprimerLigne = (id) => {
    setLignes((xs) => xs.filter((x) => x.id !== id));
  };

  const reinitialiser = () => {
    setLignes((xs) => xs.map((x) => ({
      ...x,
      montant: montantsBase[String(x.code)] || 0,
      taux: String(x.code) in tauxInitRef.current ? tauxInitRef.current[String(x.code)] : x.taux,
    })));
  };

  // Enregistrement des taux directement liés à la fiche de paie (CNSS, CSS, IRPP et retenues
  // sociales calculées) : ils persistent en base et sont réutilisés par les bulletins suivants.
  const enregistrerTaux = async () => {
    const taux = {};
    lignes.forEach((x) => {
      if (x.type === 'cnss' || x.type === 'css' || x.type === 'irpp' || (x.type === 'sociale' && estTauxCode(x))) {
        taux[String(x.code)] = valeurTaux(x);
      }
    });
    if (Object.keys(taux).length === 0) return;
    setSavingRates(true);
    setMsgRates(null);
    try {
      const r = await api.sauverTauxPaie({ taux });
      Object.assign(tauxInitRef.current, taux);
      setMsgRates({ type: 'ok', texte: `Taux enregistrés (${r?.enregistres ?? Object.keys(taux).length}). Ils seront appliqués à la fiche de paie.` });
    } catch (e) {
      setMsgRates({ type: 'err', texte: e.message || 'Échec de l\'enregistrement des taux.' });
    } finally {
      setSavingRates(false);
    }
  };

  const titrePeriode = `${MOIS_FR[periode.mois]} ${periode.annee}`;

  return (
    <div ref={refDoc}>
      <style>{`
        /* ============================================================
           Impression du Bulletin de Paie — rendu officiel, 1 page A4.
           Le cadrage (page A4, marges 8mm, bordures fines, textes épurés)
           est appliqué UNIQUEMENT au moment de l'impression / export PDF.
           ============================================================ */
        @media print {
          /* ---- Page ---- */
          @page { size: A4 portrait; margin: 8mm; }

          html, body {
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
            overflow: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          * {
            box-shadow: none !important;
            text-shadow: none !important;
            outline: none !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          *::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }

          /* Chrome applicatif : ne conserver que le bulletin */
          .app-sidebar, aside, header, .app-subnav, .no-print, .fixed, .insert-divider {
            display: none !important;
          }
          main {
            padding: 0 !important;
            margin: 0 !important;
            max-width: 100% !important;
            overflow: visible !important;
          }

          /* ---- Cadre global : une seule feuille A4 ---- */
          .bulletin-doc {
            display: block !important;
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            margin: 0 auto !important;
            padding: 4mm 4mm 5mm !important;
            border: 2px solid #1e293b !important;
            border-radius: 0 !important;
            background: #fff !important;
            font-size: 9pt !important;
            line-height: 1.35 !important;
            break-inside: avoid;
            page-break-inside: avoid;
          }

          /* ---- En-tête : société centrée puis titre centré ---- */
          .bul-header {
            display: block !important;
            text-align: center !important;
            border-bottom: 2px solid #1e293b !important;
            padding-bottom: 2.5mm !important;
            margin-bottom: 3mm !important;
          }
          .bul-org {
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
            text-align: center !important;
            gap: 0.5mm !important;
          }
          .bul-org img { margin: 0 0 1mm !important; }
          .bul-titre { text-align: center !important; margin-top: 1.5mm !important; }
          .bul-ttl { font-size: 14pt !important; letter-spacing: 0.1em !important; color: #0f172a !important; }
          .bul-periode { font-size: 9pt !important; color: #334155 !important; font-weight: 600 !important; }
          .bul-badge { display: none !important; }

          /* ---- Identification de l'employé : cases alignées ---- */
          .bul-infos {
            display: grid !important;
            grid-template-columns: repeat(3, 1fr) !important;
            gap: 2mm !important;
            margin: 3mm 0 !important;
          }
          .bul-champ {
            border: 1px solid #cbd5e1 !important;
            border-radius: 0 !important;
            padding: 1.5mm 2mm !important;
            overflow: hidden !important;
          }
          .bul-champ > span {
            display: block !important;
            font-size: 6.5pt !important;
            line-height: 1.25 !important;
            letter-spacing: 0.04em !important;
            margin-bottom: 0.5mm !important;
            color: #475569 !important;
          }
          .bul-champ input, .bul-champ select {
            display: block !important;
            width: 100% !important;
            max-width: none !important;
            border: none !important;
            background: transparent !important;
            padding: 0 !important;
            margin: 0 !important;
            box-shadow: none !important;
            outline: none !important;
            font-family: inherit !important;
            font-size: 9pt !important;
            font-weight: 600 !important;
            color: #0f172a !important;
            min-height: 0 !important;
            height: auto !important;
            appearance: none;
            -webkit-appearance: none;
          }
          .bul-champ .flex { display: flex !important; gap: 1mm !important; }
          .bul-champ .flex select, .bul-champ .flex input { width: auto !important; flex: 1 1 0% !important; }

          /* ---- Tableau structuré des rubriques ---- */
          .bul-table {
            border: 1px solid #1e293b !important;
            border-radius: 0 !important;
            overflow: visible !important;
            margin: 3mm 0 !important;
            background: #fff !important;
          }
          .bul-table table {
            border-collapse: collapse !important;
            width: 100% !important;
            font-size: 8pt !important;
          }
          .bul-table thead th {
            font-size: 7pt !important;
            font-weight: 700 !important;
            letter-spacing: 0.03em !important;
            text-align: center !important;
            color: #0f172a !important;
            background: #e2e8f0 !important;
            border: 1px solid #cbd5e1 !important;
            padding: 1.2mm 1.5mm !important;
          }
          .bul-table td {
            border: 1px solid #cbd5e1 !important;
            padding: 1mm 1.5mm !important;
            font-size: 8pt !important;
            color: #0f172a !important;
            vertical-align: middle !important;
          }
          .bul-table thead th:nth-child(1), .bul-table td:nth-child(1) { text-align: center !important; }
          .bul-table thead th:nth-child(2), .bul-table td:nth-child(2) { text-align: start !important; }
          .bul-table thead th:nth-child(3), .bul-table td:nth-child(3) { text-align: center !important; }
          .bul-table thead th:nth-child(4), .bul-table td:nth-child(4) { text-align: end !important; }
          .bul-table thead th:nth-child(5), .bul-table td:nth-child(5) { text-align: end !important; }
          .bul-table tbody tr { break-inside: avoid; page-break-inside: avoid; }
          .bul-table td input {
            border: none !important;
            background: transparent !important;
            box-shadow: none !important;
            outline: none !important;
            padding: 0 !important;
            margin: 0 !important;
            width: auto !important;
            max-width: 100% !important;
            min-height: 0 !important;
            height: auto !important;
            font-family: inherit !important;
            font-size: inherit !important;
            font-weight: inherit !important;
            color: inherit !important;
            text-align: inherit !important;
          }
          .bul-table b { color: #0f172a !important; }
          .bul-row-total td { background: #f8fafc !important; font-weight: 700 !important; }
          .bul-row-total td b { font-size: 9.5pt !important; }

          /* ---- Bas de page : arrêté, paiement, signatures ---- */
          .bul-arrete {
            border: 1px solid #cbd5e1 !important;
            border-radius: 0 !important;
            background: #f8fafc !important;
            padding: 2mm !important;
            margin: 3mm 0 !important;
          }
          .bul-arrete > p:first-child { font-size: 6.5pt !important; letter-spacing: 0.05em !important; color: #475569 !important; }
          .bul-lettres { font-size: 10pt !important; font-weight: 700 !important; color: #0f172a !important; }
          .bul-lettres span { text-transform: uppercase !important; }

          .bul-bas { display: grid !important; grid-template-columns: 1.15fr 1fr !important; gap: 3mm !important; }
          .bul-mode {
            border: 1px solid #1e293b !important;
            border-radius: 0 !important;
            padding: 2mm !important;
            min-width: 0 !important;
          }
          .bul-mode p { font-size: 6.5pt !important; letter-spacing: 0.04em !important; color: #475569 !important; }
          .bul-bas select, .bul-bas input {
            display: block !important;
            width: 100% !important;
            border: none !important;
            background: transparent !important;
            box-shadow: none !important;
            outline: none !important;
            padding: 0 !important;
            margin: 0 !important;
            font-family: inherit !important;
            font-size: 8.5pt !important;
            font-weight: 600 !important;
            color: #0f172a !important;
            min-height: 0 !important;
            height: auto !important;
            appearance: none;
            -webkit-appearance: none;
          }
          .bul-sig {
            min-height: 20mm !important;
            border: 1px solid #1e293b !important;
            border-radius: 0 !important;
            padding: 1.5mm !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
          }
          .bul-sig p { font-size: 6.5pt !important; letter-spacing: 0.04em !important; color: #475569 !important; }
          .bul-sig img { max-height: 10mm !important; }

          .bul-pied {
            border-top: 1px solid #cbd5e1 !important;
            padding-top: 1.5mm !important;
            margin-top: 3mm !important;
            font-size: 6.5pt !important;
            color: #475569 !important;
          }
        }
      `}</style>

      {/* Barre d'outils */}
      <div className="no-print card mb-4 flex flex-wrap items-center justify-between gap-3 p-3">
        <p className="flex items-center gap-2 text-xs text-slate-500">
          <IconBanknotes className="text-brand-700" />
          Aperçu interactif du bulletin de paie — les montants sont recalculés en temps réel. Utilisez
          <b className="text-slate-700"> Imprimer / PDF </b> pour exporter au format A4 (votre navigateur peut choisir « Enregistrer en PDF »).
        </p>
        <div className="flex items-center gap-2">
          <button className="btn-secondary" onClick={reinitialiser} title="Réinitialiser les montants du bulletin">
            <IconRefresh /> Réinitialiser
          </button>
          {peutSauver && (
            <button className="btn-primary" onClick={enregistrerTaux} disabled={savingRates} title="Enregistrer les taux du bulletin de paie">
              <IconSave /> {savingRates ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          )}
          <button className="btn-primary" onClick={() => window.print()}>
            <IconPrinter /> Imprimer / PDF
          </button>
        </div>
      </div>

      {peutSauver && msgRates && (
        <p className={`no-print mb-4 rounded-lg px-4 py-3 text-sm font-semibold ring-1 ${
          msgRates.type === 'ok' ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : 'bg-red-50 text-red-700 ring-red-200'
        }`}>
          {msgRates.texte}
        </p>
      )}

      {cycleActif && (
        <p className="no-print mb-4 rounded-lg bg-brand-50/60 px-4 py-2 text-xs text-brand-700 ring-1 ring-brand-200">
          {estModeHeures ? (
            <>Salaire de base au <b>régime horaire</b> : <b>{fmtQ(cycleActif.nbr_unites)} h</b> sur {fmtQ(cycleActif.base_unites)} h
              {' '}({fmtQ(cycleActif.heures_par_jour, 2)} h/j) à <b>{fmt(cycleActif.prix_heure)} DT/h</b>
              {' '}— déductions : A1 {fmtQ(cycleActif.heures_a1)} h · MALD {fmtQ(cycleActif.heures_mald)} h
              {' '}· MA déduit {fmtQ(cycleActif.heures_carence)} h.</>
          ) : (
            <>Salaire de base proratisé au cycle de paie : <b>{cycleActif.nbr_unites}</b> jour(s) de paie sur {cycleActif.base_unites}
              {' '}— déductions : A1 {cycleActif.jours_a1 || 0} · MALD {cycleActif.jours_mald || 0} · MA déduit {cycleActif.carence_appliquee || 0}.</>
          )}
        </p>
      )}

      {error && <p className="no-print mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}

      {loading ? (
        <div className="card p-10 text-center text-sm text-slate-400">Chargement du bulletin…</div>
      ) : error ? null : (
        <div className="bulletin-doc mx-auto max-w-[820px] rounded-xl border border-slate-200 bg-white p-6 shadow-card sm:p-8">
          {/* ===================== EN-TÊTE ===================== */}
          <div className="bul-header grid grid-cols-1 gap-5 border-b-2 border-slate-800 pb-4 sm:grid-cols-2">
            {/* Bloc gauche : organisme */}
            <div className="bul-org flex gap-3">
              {(org.logo || null) && (
                <img src={org.logo} alt="" className="h-16 w-16 shrink-0 rounded-lg object-contain ring-1 ring-slate-200" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-black uppercase leading-tight tracking-tight text-slate-900">
                  {org.raison_sociale || '— Raison sociale —'}
                </p>
                <p className="mt-1 text-[11px] leading-snug text-slate-500">
                  {org.adresse}
                  {org.ville_cp && <>{org.adresse && ', '}{org.ville_cp}</>}
                  {org.pays && org.pays !== 'Tunisie' ? ` — ${org.pays}` : ''}
                </p>
                {org.cnss && (
                  <p className="mt-1 text-[11px] text-slate-500">CNSS Employeur : <b className="text-slate-700">{org.cnss}</b></p>
                )}
              </div>
            </div>
            {/* Bloc droit : titre + période */}
            <div className="bul-titre text-start sm:text-end">
              <p className="bul-ttl text-lg font-black uppercase tracking-widest text-brand-700">Bulletin de Paie</p>
              <p className="bul-periode mt-1 text-xs font-semibold uppercase text-slate-500">
                Mois de {titrePeriode}
              </p>
              <p className="bul-badge no-print mt-2 inline-block rounded bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700 ring-1 ring-amber-200">
                Aperçu de conception
              </p>
            </div>
          </div>

          {/* ===================== INFORMATIONS EMPLOYÉ ===================== */}
          <div className="bul-infos mt-4 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
            <ChampInfo label="Matricule" >
              <input className="bul-input" value={employe.matricule} onChange={setEmp('matricule')} />
            </ChampInfo>
            <ChampInfo label="Nom & Prénom">
              <input className="bul-input" value={employe.nom} onChange={setEmp('nom')} />
            </ChampInfo>
            <ChampInfo label="N° CNSS">
              <input className="bul-input" value={employe.cnss} onChange={setEmp('cnss')} />
            </ChampInfo>
            <ChampInfo label="Qualification">
              <input className="bul-input" value={employe.qualification} onChange={setEmp('qualification')} />
            </ChampInfo>
            <ChampInfo label="Mois / Année">
              <div className="flex gap-1">
                <select className="bul-input" value={periode.mois} onChange={(e) => changerPeriode({ ...periode, mois: Number(e.target.value) })}>
                  {MOIS_FR.map((m, i) => <option key={m} value={i}>{m}</option>)}
                </select>
                <input className="bul-input w-20" type="number" value={periode.annee} min={2000} max={2100}
                  onChange={(e) => changerPeriode({ ...periode, annee: Number(e.target.value) })} />
              </div>
            </ChampInfo>
            <ChampInfo label="Situation familiale">
              <input className="bul-input" value={employe.situationFamille} onChange={setEmp('situationFamille')} />
            </ChampInfo>
            <ChampInfo label="Chef de famille (CF)">
              <select className="bul-input" value={sitSaisie.cf ? 'oui' : 'non'}
                onChange={(e) => setSitSaisie((s) => ({ ...s, cf: e.target.value === 'oui' ? 1 : 0 }))}>
                <option value="non">Non</option>
                <option value="oui">Oui</option>
              </select>
            </ChampInfo>
            <ChampInfo label="Enfants à charge">
              <input className="bul-input" type="number" min="0" value={sitSaisie.enfants}
                onChange={(e) => setSitSaisie((s) => ({ ...s, enfants: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))} />
            </ChampInfo>
            <ChampInfo label="Catégorie / Échelon">
              <input className="bul-input" value={employe.categorieEchelon} onChange={setEmp('categorieEchelon')} />
            </ChampInfo>
          </div>

          {/* ===================== TABLEAU DES RUBRIQUES ===================== */}
          <div className="bul-table mt-5 overflow-hidden rounded-lg border border-slate-300">
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="bg-slate-800 text-white">
                  <th className="w-14 px-2 py-2 text-center font-bold uppercase">Code</th>
                  <th className="px-2 py-2 text-start font-bold uppercase">Libellé</th>
                  <th className="w-20 px-2 py-2 text-center font-bold uppercase">Nbr / Taux</th>
                  <th className="w-24 px-2 py-2 text-end font-bold uppercase">À déduire</th>
                  <th className="w-24 px-2 py-2 text-end font-bold uppercase">À payer</th>
                  <th className="no-print w-14 px-1 py-2 text-center font-bold uppercase">Act.</th>
                </tr>
              </thead>
              <tbody>
                {lignesVisibles.map((x) => {
                  const estTotal = x.type === 'total';
                  const montant = montantDe(x);
                  return (
                    <tr key={x.id} className={`bul-row-total border-t border-slate-200 ${clignotant === x.id ? 'bg-amber-100' : estTotal ? 'bg-slate-100 font-bold' : ''}`}>
                      <td className="px-2 py-1 text-center font-mono text-[11px] text-slate-500">{x.code}</td>
                      <td className="px-2 py-1 text-slate-700">
                        {estTotal || x.type === 'irpp' || x.pret ? null : <input className="bul-input -mx-1 my-0.5 w-full" value={x.libelle}
                          onChange={(e) => setLignes((xs) => xs.map((y) => y.id === x.id ? { ...y, libelle: e.target.value } : y))} />}
                        <span className={estTotal ? 'uppercase' : ''}>{estTotal || x.type === 'irpp' || x.pret ? libelleDe(x) : null}</span>
                      </td>
                      <td className="px-2 py-1 text-center">
                        {x.type === 'cnss' || x.type === 'css' || x.type === 'irpp' || (x.type === 'sociale' && estTauxCode(x)) ? (
                          <div className="inline-flex items-center justify-center gap-0.5">
                            <input className="bul-input w-14 text-center" type="number" step="0.01" min="0" max="100"
                              value={x.taux ?? ''} onChange={setTaux(x.id)} />
                            <span className="text-[10px] text-slate-400">%</span>
                          </div>
                        ) : String(x.code) === '5011' && cycleActif ? (
                          estModeHeures ? (
                            <b className="bul-nbr text-brand-700" title={`${fmtQ(cycleActif.nbr_unites)} h sur ${fmtQ(cycleActif.base_unites)} h de régime — cycle ${cycleActif.periode?.debut || ''} → ${cycleActif.periode?.fin || ''}`}>
                              {fmtQ(cycleActif.nbr_unites)} <span className="text-[9px]">h</span>
                            </b>
                          ) : (
                            <b className="bul-nbr text-brand-700" title={`${cycleActif.nbr_unites} jour(s) de paie sur ${cycleActif.base_unites} — cycle ${cycleActif.periode?.debut || ''} → ${cycleActif.periode?.fin || ''}`}>
                              {cycleActif.nbr_unites}
                            </b>
                          )
                        ) : (
                          <span className="text-slate-400">{estTotal ? '=' : ''}</span>
                        )}
                      </td>
                      {(x.type === 'sociale' || x.type === 'diverse' || x.type === 'cnss' || x.type === 'irpp' || x.type === 'css') ? (
                        <>
                          <td className="px-2 py-1 text-end">
                            {x.type === 'cnss' || x.type === 'irpp' || x.type === 'css' || (x.type === 'sociale' && estTauxCode(x)) ? (
                              <b className="text-red-700">{fmt(montant)}</b>
                            ) : x.pret ? (
                              <b className="text-red-700" title="Retenue crédit/avance du mois (module Crédits & Avances)">{fmt(montant)}</b>
                            ) : (
                              <input className="bul-input w-24 text-end" type="number" min="0" step="0.001" value={x.montant}
                                onChange={setMontant(x.id)} />
                            )}
                          </td>
                          <td className="px-2 py-1 text-end text-slate-300">—</td>
                        </>
                      ) : (
                        <>
                          <td className="px-2 py-1 text-end text-slate-300">—</td>
                          <td className="px-2 py-1 text-end">
                            {estTotal ? (
                              <b className={String(x.code) === '10000' ? 'text-lg text-brand-700' : ''}>{fmt(montant)}</b>
                            ) : String(x.code) === '5011' && cycleActif ? (
                              <b className="text-emerald-700" title={estModeHeures
                                ? `Montant au régime horaire : ${fmtQ(cycleActif.nbr_unites)} h × ${fmt(cycleActif.prix_heure)} DT/h`
                                : `Montant proratisé au cycle : salaire de base × Nbr jours / base`}>{fmt(montant)}</b>
                            ) : (
                              <input className="bul-input w-24 text-end" type="number" min="0" step="0.001" value={x.montant}
                                onChange={setMontant(x.id)} />
                            )}
                          </td>
                        </>
                      )}
                      <td className="no-print px-1 py-1 text-center">
                        {!estTotal && !x.pret && (
                          <button
                            type="button"
                            title="Supprimer cette rubrique"
                            aria-label="Supprimer"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600"
                            onClick={() => supprimerLigne(x.id)}
                          >
                            <IconTrash className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Bouton ajouter une rubrique */}
          <div className="no-print mt-3">
            {formAjoutOuvert ? (
              <div className="rounded-lg border border-brand-200 bg-brand-50/60 p-3">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-brand-700">Nouvelle rubrique</p>
                <div className="flex flex-wrap items-center gap-2">
                  <input className="bul-input min-w-[200px] flex-1" placeholder="Libellé (ex : Prime de rendement)"
                    value={newLigne.libelle} onChange={(e) => setNewLigne({ ...newLigne, libelle: e.target.value })} autoFocus />
                  <select className="bul-input w-44" value={newLigne.type} onChange={(e) => setNewLigne({ ...newLigne, type: e.target.value })}>
                    <option value="gain">Gain (imposable & cotisable)</option>
                    <option value="sociale">Retenue sociale</option>
                    <option value="diverse">Retenue diverse / avance</option>
                  </select>
                  <input className="bul-input w-32" type="number" min="0" step="0.001" placeholder="Montant"
                    value={newLigne.montant} onChange={(e) => setNewLigne({ ...newLigne, montant: e.target.value })} />
                  <button className="btn-primary h-9 px-3 text-xs" onClick={ajouterLigne}>Ajouter</button>
                  <button className="btn-secondary h-9 px-3 text-xs" onClick={() => setFormAjoutOuvert(false)}>Annuler</button>
                </div>
                <p className="mt-2 text-[11px] text-slate-500">
                  Le <b>code est attribué automatiquement</b>. Les gains alimentent le Brut Cotisable ; les retenues
                  sociales réduisent le Salaire Imposable ; les avances/prêts réduisent le Net à Payer.
                </p>
              </div>
            ) : (
              <button className="btn-secondary h-9 px-3 text-xs" onClick={() => { setFormAjoutOuvert(true); setError(''); }}>
                <IconPlus /> Ajouter une rubrique
              </button>
            )}
          </div>

          {/* ===================== ZONE BAS DE PAGE ===================== */}
          <div className="mt-5 space-y-4">
            <div className="bul-arrete rounded-lg border border-slate-300 bg-slate-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Arrêté le présent bulletin à la somme de :</p>
              <p className="bul-lettres mt-1 text-sm font-semibold text-slate-800">
                <span className="uppercase">{montantEnLettres(netAPayer)}</span>
              </p>
            </div>

            <div className="bul-bas grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Mode de paiement */}
              <div className="bul-mode rounded-lg border border-slate-300 p-3">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">Mode de paiement</p>
                <select className="bul-input w-full" value={modePaiement} onChange={(e) => setModePaiement(e.target.value)}>
                  {MODES_PAIEMENT.map((m) => <option key={m}>{m}</option>)}
                </select>
                <label className="mb-1 mt-2 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  RIB / N° de compte
                </label>
                <input className="bul-input w-full font-mono" value={rib} onChange={(e) => setRib(e.target.value)} placeholder="RIB bancaire…" />
                {org.banque_agence && <p className="mt-1 text-[11px] text-slate-500">{org.banque_agence}</p>}
              </div>

              {/* Signatures & cachet */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bul-sig flex min-h-[110px] flex-col justify-between rounded-lg border border-slate-300 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">L'Employeur</p>
                  {org.signature && <img src={org.signature} alt="Signature" className="mx-auto h-12 object-contain" />}
                  <div className="mt-2 border-t border-dashed border-slate-300 pt-1 text-center">
                    <span className="text-[10px] text-slate-400">Nom, Cachet, Date</span>
                  </div>
                </div>
                <div className="bul-sig flex min-h-[110px] flex-col justify-between rounded-lg border border-slate-300 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">L'Employé</p>
                  <div className="flex-1" />
                  <div className="border-t border-dashed border-slate-300 pt-1 text-center">
                    <span className="text-[10px] text-slate-400">Signature</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bul-pied flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 text-[10px] text-slate-400">
              <span>Document généré par XMator-RH — module paie (conception)</span>
              <span>{titrePeriode} · {employe.matricule}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ChampInfo({ label, children }) {
  return (
    <label className="bul-champ block min-w-0">
      <span className="mb-0.5 block text-[9px] font-bold uppercase tracking-wide text-slate-400">{label}</span>
      {children}
    </label>
  );
}