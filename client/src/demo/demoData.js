// ============================================================================
// Jeu de données de démonstration — alimente le tableau de bord en mode
// « maquette » (/maquette) et en repli quand l'API est injoignable.
// Les valeurs clés sont calées sur la réalité de l'Amicale :
//   • Effectif concerné : 129
//   • Heures travaillées  : 85 456,96 h (pour 89 744,25 h légales)
//   • Congés sur période  : 1 597,5 j (dont 182,5 j en demi-journées)
// Génération pseudo-aléatoire déterministe (mulberry32) : mêmes chiffres à
// chaque rendu, pour des captures et une review stables.
// ============================================================================

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const r2 = (v) => Math.round(v * 100) / 100;

const NOMS = ['Trabelsi', 'Gharbi', 'Mansouri', 'Jaziri', 'Bouazizi', 'Chikhaoui', 'Ferchichi', 'Sassi', 'Belhadj', 'Kacem', 'Riahi', 'Hamdi', 'Zouari', 'Ayari', 'Dridi', 'Mabrouk', 'Baccar', 'Chaabane', 'Rebai', 'Slimane', 'Toumi', 'Amri', 'Chtourou', 'Debbabi', 'Ellouze', 'Feki', 'Guesmi', 'Hajji', 'Blibech', 'Nammour'];
const PRENOMS = ['Ahmed', 'Mohamed', 'Youssef', 'Khaled', 'Sami', 'Anis', 'Nabil', 'Zied', 'Hatem', 'Mehdi', 'Rami', 'Slim', 'Walid', 'Amine', 'Bilel', 'Nour', 'Eya', 'Sarra', 'Amel', 'Rania', 'Ines', 'Hela', 'Maha', 'Dorra', 'Amani', 'Yasmine', 'Rihab', 'Sandy', 'Oussama', 'Firas'];

const CATS = [
  { id: 1, libelle: 'Ingénieurs' },
  { id: 2, libelle: 'Cadres supérieurs' },
  { id: 3, libelle: 'Techniciens' },
  { id: 4, libelle: 'Administration' },
  { id: 5, libelle: 'Agents d\'exécution' },
  { id: 6, libelle: 'Ouvriers spécialisés' },
];

const DEPTS = ['Direction', 'Informatique', 'Comptabilité', 'Ressources Humaines', 'Production', 'Commercial', 'Technique', 'Accueil'];

const MOIS_LABELS = ['Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'];

export function demoCategories() { return CATS.map((c) => ({ ...c })); }

// --- Liste « employés » (filtres, départements, fiches) : 129 personnes ---
export function demoEmployesList() {
  const rand = rng(20260913);
  const list = [];
  for (let i = 0; i < 129; i += 1) {
    const cat = CATS[Math.floor(rand() * CATS.length)];
    // Quelques soldes tendus (≤ 5 j, dont deux négatifs) pour alimenter les alertes de solde
    const solde = i % 24 === 3 ? r2(-1.5 + (i / 129) * 5) : r2(8 + rand() * 22);
    const soldeMal = r2(4 + rand() * 16);
    list.push({
      id: i + 1,
      matricule: String(26 + i),
      nom: NOMS[i % NOMS.length],
      prenom: PRENOMS[(i * 7 + Math.floor(rand() * 3)) % PRENOMS.length],
      categorie_id: cat.id,
      categorie: cat.libelle,
      departement: DEPTS[Math.floor(rand() * DEPTS.length)],
      intitule_poste: cat.id === 1 ? 'Ingénieur d\'exploitation' : cat.id === 3 ? 'Technicien maintenance' : 'Gestionnaire',
      rubrique: 'A', grade: `${3 + (i % 5)}`, classe: `C${1 + (i % 4)}`, echelon: `${6 + (i % 9)}`,
      date_embauche: `20${String(10 + (i % 15)).padStart(2, '0')}-${String(1 + (i % 12)).padStart(2, '0')}-1${i % 9}`,
      gsm: `+216 ${20 + (i % 80)} ${String(100 + i)} ${String(200 + (i * 3) % 799)}`,
      photo_url: null,
      solde,
      solde_maladie: soldeMal,
    });
  }
  return list;
}

// --- Payload « dashboard/audit » complet, calé sur les KPI contractuels ---
export function demoDashboardPayload({ debut = '2026-01-01', fin = '2026-12-31' } = {}) {
  const rand = rng(777);
  const EFFECTIF = 129;
  const LEGAL_TOT = 89744.25;
  const TRAV_TOT = 85456.96;
  const CONGE_TOT = 1597.5;
  const DEMI_TOT = 182.5;
  const MALADIE_TOT = 512.5;
  const ABSENCE_TOT = 214;
  const PRESENTS_TOT = 24636;
  const OUVRABLES_TOT = 27216;

  // ----- Série mensuelle -----
  const w = Array.from({ length: 12 }, () => 0.86 + rand() * 0.28);
  const wSum = w.reduce((a, b) => a + b, 0);
  let legalAcc = 0; let travAcc = 0; let congeAcc = 0; let demiAcc = 0; let malAcc = 0; let absAcc = 0; let presAcc = 0; let ouvAcc = 0;
  const series = MOIS_LABELS.map((label, i) => {
    const last = i === 11;
    const share = w[i] / wSum;
    const legal = last ? r2(LEGAL_TOT - legalAcc) : r2(LEGAL_TOT * share);
    let trav = last ? r2(TRAV_TOT - travAcc) : r2(legal * (0.925 + rand() * 0.075));
    if (trav > legal) trav = r2(legal * 0.995);
    const conge = last ? r2(CONGE_TOT - congeAcc) : r2(CONGE_TOT * share);
    const demi = last ? r2(DEMI_TOT - demiAcc) : r2(DEMI_TOT * share);
    const maladie = last ? r2(MALADIE_TOT - malAcc) : r2(MALADIE_TOT * share);
    const absence = last ? ABSENCE_TOT - absAcc : Math.round(ABSENCE_TOT * share);
    const presents = last ? PRESENTS_TOT - presAcc : Math.round(PRESENTS_TOT * share * (0.94 + rand() * 0.12));
    const ouvrables = last ? OUVRABLES_TOT - ouvAcc : Math.round(OUVRABLES_TOT * share);
    legalAcc += legal; travAcc += trav; congeAcc += conge; demiAcc += demi; malAcc += maladie; absAcc += absence; presAcc += presents; ouvAcc += ouvrables;
    const retards = 18 + Math.round(rand() * 46);
    return {
      label,
      legal_heures: legal,
      travaille_heures: trav,
      presence_pct: r2((trav / legal) * 100),
      jours_presence: presents,
      jours_conge: conge,
      jours_maladie: maladie,
      jours_absence: absence,
      retards,
      retard_secondes: Math.round(retards * (60 + rand() * 240)),
      departs_anticipe: 4 + Math.round(rand() * 18),
      depart_secondes: 0,
    };
  });

  // ----- Détail par employé (129 lignes, totaux travaillés cohérents) -----
  const employees = demoEmployesList();
  const raw = employees.map(() => 0.72 + rand() * 0.3);
  const rawSum = raw.reduce((a, b) => a + b, 0);
  let usedH = 0;
  const employes = employees.map((e, i) => {
    const last = i === employees.length - 1;
    const travaille = last ? r2(TRAV_TOT - usedH) : r2((TRAV_TOT * raw[i]) / rawSum);
    usedH += travaille;
    const legal = r2((e.categorie_id <= 2 ? 806 : 742) * (0.98 + rand() * 0.06));
    const presence_pct = r2((travaille / legal) * 100);
    const jours_presents = Math.max(150, Math.round(200 + rand() * 80));
    const jours_conge = r2(rand() * rand() * 30);
    const jours_maladie = r2(rand() < 0.22 ? rand() * 9 : 0);
    const jours_absence = rand() < 0.12 ? Math.round(1 + rand() * 5) : 0;
    const retards = Math.round(rand() * rand() * 26);
    const retard_secondes = Math.round(retards * (80 + rand() * 320));
    const departs_anticipe = rand() < 0.3 ? Math.round(1 + rand() * 9) : 0;
    const journees = jours_presents + retards;
    const note = (conf, tot) => { if (!tot) return null; const p = (conf / tot) * 100; return p >= 97.5 ? 5 : p >= 92 ? 4 : p >= 82 ? 3 : p >= 65 ? 2 : p >= 40 ? 1 : 0; };
    return {
      id: e.id,
      matricule: e.matricule,
      nom: e.nom,
      prenom: e.prenom,
      categorie: e.categorie,
      categorie_id: e.categorie_id,
      departement: e.departement,
      photo_url: null,
      travaille_heures: travaille,
      legal_heures: legal,
      presence_pct,
      jours_presents,
      jours_ouvrables: Math.round(jours_presents / Math.max(presence_pct / 100, 0.7)),
      jours_presents_pct: r2(Math.min(100, (jours_presents / Math.max(jours_presents + jours_absence + 9, 1)) * 100)),
      jours_conge,
      jours_maladie,
      jours_absence,
      jours_absence_pct: r2((jours_absence / 211) * 100),
      retards,
      retard_secondes,
      departs_anticipe,
      sortie_anticipee_secondes: Math.round(departs_anticipe * (140 + rand() * 200)),
      journees_presence: journees,
      solde_conge: e.solde,
      solde_conge_periode: r2(e.solde + rand() * 4),
      solde_maladie: e.solde_maladie,
      etoiles_retard: note(journees - retards, journees),
      etoiles_sortie: note(journees - departs_anticipe, journees),
    };
  });

  const parCategorie = CATS.map((c) => {
    const rows = employes.filter((e) => e.categorie_id === c.id);
    const sum = (k) => rows.reduce((a, e) => a + (Number(e[k]) || 0), 0);
    const legal = sum('legal_heures'); const trav = sum('travaille_heures');
    return {
      categorie: c.libelle,
      nb_employes: rows.length,
      travaille_heures: r2(trav),
      legal_heures: r2(legal),
      presence_pct: r2((trav / legal) * 100),
      jours_presents: sum('jours_presents'),
      jours_absence: sum('jours_absence'),
      retards: sum('retards'),
      retard_secondes: sum('retard_secondes'),
      etoiles_retard: rows.length ? Math.round(rows.reduce((a, e) => a + (e.etoiles_retard || 0), 0) / rows.length) : null,
      etoiles_sortie: rows.length ? Math.round(rows.reduce((a, e) => a + (e.etoiles_sortie || 0), 0) / rows.length) : null,
    };
  });

  const alertes = employes
    .filter((e) => e.solde_conge < 5)
    .slice(0, 6)
    .map((e) => ({ id: e.id, matricule: e.matricule, nom: e.nom, prenom: e.prenom, categorie: e.categorie }));

  return {
    filtre: { granularite: 'mois', debut, fin, employe_id: null, matricule: null, categorie_id: null, departement: null },
    periode: { debut, fin },
    effectif: EFFECTIF,
    photos_aleatoires: employes.slice(0, 9).map((e) => ({ matricule: e.matricule, nom: e.nom, prenom: e.prenom, photo_url: null, categorie: e.categorie })),
    kpis: {
      effectif: EFFECTIF,
      heures_legales: r2(LEGAL_TOT),
      heures_travaillees: r2(TRAV_TOT),
      presence_pct: r2((TRAV_TOT / LEGAL_TOT) * 100),
      jours_presents: PRESENTS_TOT,
      jours_presence: PRESENTS_TOT,
      jours_presents_pct: r2((PRESENTS_TOT / OUVRABLES_TOT) * 100),
      jours_absence: ABSENCE_TOT,
      jours_absence_pct: r2((ABSENCE_TOT / OUVRABLES_TOT) * 100),
      jours_conge: CONGE_TOT,
      jours_ce: 0,
      jours_conge_demi: DEMI_TOT,
      jours_maladie: MALADIE_TOT,
      jours_ouvrables: OUVRABLES_TOT,
      solde_conge: 4587.5,
      solde_conge_periode: 5214,
      solde_maladie: 1438,
      accorde_conge: 5160,
      consomme_conge: 1790.5,
      accorde_maladie: 1674,
      consomme_maladie: 512.5,
      alertes: alertes.length,
      en_instance: { demandes: 23, arrets: 6 },
      journees_presence: 26120,
      retards: 412,
      retard_secondes: 111240,
      departs_anticipe: 168,
      sortie_anticipee_secondes: 45360,
      pointages_uniques: 30788,
      note_retards: 4,
      note_sorties: 4,
    },
    barometres: {
      presence: r2((TRAV_TOT / LEGAL_TOT) * 100),
      conge: r2((CONGE_TOT / OUVRABLES_TOT) * 100),
      maladie: r2((MALADIE_TOT / OUVRABLES_TOT) * 100),
      conge_annuel: r2((1790.5 / 5160) * 100),
      maladie_annuel: r2((512.5 / 1674) * 100),
      absence: r2((ABSENCE_TOT / OUVRABLES_TOT) * 100),
      jours_presence: r2((PRESENTS_TOT / OUVRABLES_TOT) * 100),
      absence_jours: r2((ABSENCE_TOT / OUVRABLES_TOT) * 100),
      ponctualite: 98.4,
      sorties_conformes: 99.4,
    },
    series,
    calendrier: null,
    codes: [],
    parCategorie,
    employes,
    alertes,
  };
}
