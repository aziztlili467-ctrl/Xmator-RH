const { Router } = require('express');
const { db, insertMouvement, computeSoldeApres } = require('../db');
const { buildPdf } = require('../utils/pdfJournal');
const router = Router();

const CODE_RMA_CONGE = 'CA';
const CODE_RMA_DEMI = 'DJ';

// Vérifie si une demande acceptée couvre déjà cette date pour cet employé → évite double déduction
function demandeAccepteeCouvre(employe_id, date) {
  const row = db.prepare("SELECT id FROM demandes_conge WHERE employe_id = ? AND statut = 'acceptee' AND date_debut <= ? AND date_fin >= ? LIMIT 1").get(employe_id, date, date);
  return !!row;
}

// Journal RMA (Repos · Maladie · Absence) : codifications complémentaires (A1, CA, MA, R3, RP…)
// importées depuis un fichier TXT/CSV et fusionnées avec P1 (pointages badgeuse) dans le journal de paie.
// Les couleurs/libellés des codes proviennent de la rubrique « Paramètres & Codification » (codes_paie).

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n) => String(n).padStart(2, '0');

function listDates(debut, fin) {
  const dates = [];
  const cur = new Date(debut + 'T00:00:00');
  const end = new Date(fin + 'T00:00:00');
  while (cur <= end) {
    dates.push(`${cur.getFullYear()}-${pad(cur.getMonth() + 1)}-${pad(cur.getDate())}`);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

// Normalise un code saisi : trim + majuscules + sans espaces internes (même règle que codes-paie.js)
function normaliserCode(v) {
  return String(v || '').trim().toUpperCase().replace(/\s+/g, '');
}

// Normalise une date saisie : 'AAAA-MM-JJ' ou 'JJ/MM/AAAA' -> 'AAAA-MM-JJ' ou null
function normaliserDate(v) {
  const s = String(v || '').trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  let y; let mo; let d;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else {
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
    if (!m) return null;
    d = +m[1]; mo = +m[2]; y = +m[3];
  }
  if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const jour = new Date(Date.UTC(y, mo - 1, d));
  if (jour.getUTCFullYear() !== y || jour.getUTCMonth() !== mo - 1 || jour.getUTCDate() !== d) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}

// ---- Matrice des codifications importées (Journal RMA) ----
router.get('/', (req, res) => {
  const { debut, fin } = req.query;
  if (!debut || !fin || !DATE_RE.test(debut) || !DATE_RE.test(fin)) {
    return res.status(400).json({ error: 'Paramètres debut et fin requis au format AAAA-MM-JJ.' });
  }
  if (fin < debut) return res.status(400).json({ error: 'La date de fin doit être postérieure ou égale à la date de début.' });

  const employes = db.prepare(`
    SELECT e.id, e.matricule, e.nom, e.prenom, c.libelle AS categorie
    FROM employes e
    JOIN categories c ON c.id = e.categorie_id
    WHERE e.actif = 1
    ORDER BY CAST(e.matricule AS INTEGER), e.matricule
  `).all();

  const rows = db.prepare(`
    SELECT employe_id, date AS jour, code, demi_journee FROM codes_importes
    WHERE date >= ? AND date <= ?
    ORDER BY date, code
  `).all(debut, fin);

  const jours = {};
  const joursDemi = {};
  const parCode = {};
  for (const r of rows) {
    if (!jours[r.employe_id]) jours[r.employe_id] = {};
    const cur = jours[r.employe_id][r.jour];
    jours[r.employe_id][r.jour] = cur ? `${cur}/${r.code}` : r.code;
    if ((r.demi_journee && r.code === CODE_RMA_CONGE) || r.code === CODE_RMA_DEMI) {
      if (!joursDemi[r.employe_id]) joursDemi[r.employe_id] = {};
      joursDemi[r.employe_id][r.jour] = true;
    }
    parCode[r.code] = (parCode[r.code] || 0) + 1;
  }

  // Métadonnées des codes (couleur + libellé) pour l'affichage coloré — accessibles à tous les rôles en lecture
  const codes = db.prepare('SELECT code, libelle, couleur FROM codes_paie ORDER BY code').all();

  res.json({
    debut,
    fin,
    dates: listDates(debut, fin),
    employes,
    jours,
    joursDemi,
    totaux: { par_code: parCode, total: rows.length },
    codes,
  });
});

// ---- Import de codifications (fichier .txt / .csv collé ou lu côté client) ----
// Deux formats auto-détectés :
//  ① FORMAT LISTE  — une ligne par événement : Matricule + Date ('AAAA-MM-JJ' ou 'JJ/MM/AAAA') + Code,
//     ordre des colonnes libre (détection cellule par cellule).
//  ② FORMAT MATRICE — export type « PRESENTIEL-PAIE » : ligne d'en-tête = Mat + Nom + UNE COLONNE PAR DATE
//     (JJ/MM/AAAA), chaque cellule = code (A1/CA/MA/R3/RP…) ou vide. La colonne Nom (et toute colonne
//     ni matricule ni date) est ignorée ; les cellules vides ne comptent pas.
// Séparateur détecté (tabulation > ';' > ','). Le code doit exister dans codes_paie ;
// matricules inconnus → nonReconnus ; dates hors période choisie → hors_periode ;
// un ré-import identique est ignoré (doublons) grâce à UNIQUE(employe_id, date, code).
router.post('/import', (req, res) => {
  const texte = String((req.body || {}).texte || '').replace(/\r/g, '');
  const { debut, fin } = req.body || {};
  if ((debut && !DATE_RE.test(debut)) || (fin && !DATE_RE.test(fin))) {
    return res.status(400).json({ error: 'Paramètres debut et fin attendus au format AAAA-MM-JJ.' });
  }
  if (debut && fin && fin < debut) {
    return res.status(400).json({ error: 'La date de fin doit être postérieure ou égale à la date de début.' });
  }

  const lignesBrutes = texte.split('\n').map((l) => l.trimEnd()).filter((l) => l.trim().length && !/^[#\/]/.test(l.trim()));
  if (!lignesBrutes.length) return res.status(400).json({ error: 'Fichier vide.' });

  // Codes connus (Paramètres & Codification) — relus à chaque import
  const codesConnus = new Set(db.prepare('SELECT code FROM codes_paie').all().map((r) => r.code));

  // Séparateur détecté sur la première ligne contenant un code connu, sinon la première ligne
  let ligneRef = lignesBrutes[0];
  for (const l of lignesBrutes) {
    if (l.split(/[\t;,]/).some((c) => codesConnus.has(normaliserCode(c)))) { ligneRef = l; break; }
  }
  const sep = ligneRef.includes('\t') ? '\t' : (ligneRef.includes(';') ? ';' : ',');

  // Détection FORMAT MATRICE : première ligne (dans les 200 premières) dont ≥ 2 cellules sont des dates valides
  let headerIdx = -1;
  for (let i = 0; i < Math.min(lignesBrutes.length, 200); i++) {
    const nbDates = lignesBrutes[i].split(sep).filter((c) => !!normaliserDate(c)).length;
    if (nbDates >= 2) { headerIdx = i; break; }
  }

  // Employés actifs indexés par matricule (tolère les zéros de tête : « 035 » = « 35 »)
  const empParMat = new Map();
  for (const e of db.prepare('SELECT id, matricule FROM employes WHERE actif = 1').all()) {
    empParMat.set(String(e.matricule).trim(), e);
    const n = parseInt(e.matricule, 10);
    if (!isNaN(n)) empParMat.set(String(n), e);
  }
  const trouverEmp = (mat) => {
    const m = String(mat || '').trim();
    return empParMat.get(m) || empParMat.get(String(parseInt(m, 10) || -1));
  };

  const nouveauxCA = [];
  const nouveauxDJ = [];
  const ins = db.prepare(`
    INSERT INTO codes_importes (employe_id, matricule, date, code) VALUES (?,?,?,?)
    ON CONFLICT(employe_id, date, code) DO NOTHING
  `);

  const insererCellule = (stats, emp, jour, codeCell, debut, fin) => {
    const code = normaliserCode(codeCell);
    if (!code) return;
    if (!codesConnus.has(code)) { stats.invalides++; return; }
    if ((debut && jour < debut) || (fin && jour > fin)) { stats.horsPeriode++; return; }
    const r = ins.run(emp.id, emp.matricule, jour, code);
    if (r.changes > 0) {
      stats.importes++;
      if (code === CODE_RMA_CONGE) nouveauxCA.push({ employe_id: emp.id, matricule: emp.matricule, date: jour });
      else if (code === CODE_RMA_DEMI) nouveauxDJ.push({ employe_id: emp.id, matricule: emp.matricule, date: jour });
    } else stats.doublons++;
  };

  const tx = db.transaction(() => {
    const stats = { importes: 0, doublons: 0, invalides: 0, horsPeriode: 0, nonReconnus: [] };

    if (headerIdx !== -1) {
      // ---------- FORMAT MATRICE ----------
      const headCells = lignesBrutes[headerIdx].split(sep).map((c) => c.trim());
      const colDate = new Map(); // index de colonne -> date ISO
      headCells.forEach((c, k) => { const d = normaliserDate(c); if (d) colDate.set(k, d); });

      // Colonne matricule : parmi les colonnes non-date, celle dont l'en-tête cite mat/code ; sinon la première
      let idxMat = -1;
      for (const [c, k] of headCells.map((c, k) => [c, k]).filter(([c, k]) => !colDate.has(k))) {
        if (/^(mat|matr|mat\.?|matricule|code|codification)$/i.test(c)) { idxMat = k; break; }
      }
      if (idxMat === -1) {
        for (const [c, k] of headCells.map((c, k) => [c, k]).filter(([c, k]) => !colDate.has(k))) { idxMat = k; break; }
      }

      for (let i = headerIdx + 1; i < lignesBrutes.length; i++) {
        const cells = lignesBrutes[i].split(sep).map((c) => c.trim());

        // Répétition éventuelle d'une ligne d'en-têtes (exports multi-pages) → ignorée
        const nbDates = cells.filter((c) => !!normaliserDate(c)).length;
        if (colDate.size >= 2 && nbDates >= Math.ceil(colDate.size / 2)) continue;

        const mat = idxMat >= 0 && idxMat < cells.length ? cells[idxMat] : '';
        if (!/^\d{1,10}$/.test(mat)) { stats.invalides++; continue; }
        const emp = trouverEmp(mat);
        if (!emp) {
          if (stats.nonReconnus.length < 20 && !stats.nonReconnus.includes(mat)) stats.nonReconnus.push(mat);
          continue;
        }
        for (const [k, jour] of colDate) {
          insererCellule(stats, emp, jour, cells[k] || '', debut, fin);
        }
      }
    } else {
      // ---------- FORMAT LISTE ----------
      for (let i = 0; i < lignesBrutes.length; i++) {
        const cell = lignesBrutes[i].split(sep).map((c) => c.trim());

        // En-tête : aucune cellule ne correspond à un code connu mais l'une cite matricule/code/date
        if (!cell.some((c) => codesConnus.has(normaliserCode(c)))
          && cell.some((c) => /^(matricule|mat\.?|code|codification|date|jour)$/i.test(c))) continue;

        const idxCode = cell.findIndex((c) => codesConnus.has(normaliserCode(c)));
        const idxDate = cell.findIndex((c) => !!normaliserDate(c));
        const idxMat = cell.findIndex((c, k) => k !== idxCode && k !== idxDate && /^\d{1,10}$/.test(c));
        const code = idxCode === -1 ? '' : normaliserCode(cell[idxCode]);
        const jour = idxDate === -1 ? null : normaliserDate(cell[idxDate]);
        const mat = idxMat === -1 ? '' : cell[idxMat];

        if (!code || !jour || !mat) { stats.invalides++; continue; }
        const emp = trouverEmp(mat);
        if (!emp) {
          if (stats.nonReconnus.length < 20 && !stats.nonReconnus.includes(mat)) stats.nonReconnus.push(mat);
          continue;
        }
        insererCellule(stats, emp, jour, cell[idxCode], debut, fin);
      }
    }

    return stats;
  });

  const result = tx();
  // Déduction automatique du solde pour les CA/DJ nouvellement importés
  // (hors ceux déjà couverts par une demande acceptée) — CA = 1 jour, DJ demi-journée = 0,5.
  let mouvementsCrees = 0;
  const deduire = (rows, jours, libelle) => {
    for (const r of rows) {
      if (demandeAccepteeCouvre(r.employe_id, r.date)) continue;
      const existe = db.prepare("SELECT id FROM mouvements WHERE employe_id = ? AND date_operation = ? AND type_operation = 'prelevement' AND solde_type = 'conge' AND motif LIKE 'RMA%' LIMIT 1").get(r.employe_id, r.date);
      if (existe) continue;
      try {
        insertMouvement({
          employe_id: r.employe_id,
          type_operation: 'prelevement',
          date_operation: r.date,
          jours,
          motif: `RMA \u2014 ${libelle} du ${r.date} \u2014 Mat ${r.matricule} (auto)`,
          solde_type: 'conge',
        });
        mouvementsCrees++;
      } catch {}
    }
  };
  deduire(nouveauxCA, 1, `Cong\u00E9 ${CODE_RMA_CONGE}`);
  deduire(nouveauxDJ, 0.5, `Demi-journ\u00E9e ${CODE_RMA_DEMI}`);
  res.json({
    ok: true,
    format: headerIdx !== -1 ? 'matrice' : 'liste',
    importes: result.importes,
    doublons: result.doublons,
    invalides: result.invalides,
    hors_periode: result.horsPeriode,
    nonReconnus: result.nonReconnus,
    lignes: result.importes + result.doublons,
    debut: debut || null,
    fin: fin || null,
    mouvementsCrees,
  });
});

// ---- Suppression des codifications importées d'une période (gestion des données) ----
router.delete('/', (req, res) => {
  const { debut, fin, matricule } = req.query;
  if (!debut || !fin || !DATE_RE.test(debut) || !DATE_RE.test(fin)) {
    return res.status(400).json({ error: 'Paramètres debut et fin requis au format AAAA-MM-JJ.' });
  }
  if (fin < debut) return res.status(400).json({ error: 'La date de fin doit être postérieure ou égale à la date de début.' });

  // Pré-sélection des CA/DJ à restaurer au solde (si un mouvement RMA existe pour cette date)
  let selSql = "SELECT employe_id, matricule, date, code FROM codes_importes WHERE code IN (?, ?) AND date >= ? AND date <= ?";
  const selParams = [CODE_RMA_CONGE, CODE_RMA_DEMI, debut, fin];
  if (matricule) {
    selSql += ' AND employe_id IN (SELECT id FROM employes WHERE matricule = ? OR CAST(matricule AS INTEGER) = ?)';
    selParams.push(matricule, parseInt(matricule, 10) || -1);
  }
  const caASupprimer = db.prepare(selSql).all(...selParams);

  let sql = 'DELETE FROM codes_importes WHERE date >= ? AND date <= ?';
  const params = [debut, fin];
  if (matricule) {
    sql += ' AND employe_id IN (SELECT id FROM employes WHERE matricule = ? OR CAST(matricule AS INTEGER) = ?)';
    params.push(matricule, parseInt(matricule, 10) || -1);
  }
  const r = db.prepare(sql).run(...params);

  // Restauration du solde pour chaque CA/DJ qui avait généré un mouvement RMA per-date (CA=1, DJ=0,5)
  let mouvementsRestaures = 0;
  for (const ca of caASupprimer) {
    const mvt = db.prepare("SELECT id FROM mouvements WHERE employe_id = ? AND date_operation = ? AND type_operation = 'prelevement' AND solde_type = 'conge' AND motif LIKE 'RMA%' LIMIT 1").get(ca.employe_id, ca.date);
    if (!mvt) continue;
    // Évite double restauration : si un mouvement compensateur existe déjà pour cette date, on skip
    const dejaRestaure = db.prepare("SELECT id FROM mouvements WHERE employe_id = ? AND date_operation = ? AND type_operation = 'ajout_annuel' AND motif LIKE 'RMA%restauration%' LIMIT 1").get(ca.employe_id, ca.date);
    if (dejaRestaure) continue;
    const joursR = ca.code === CODE_RMA_DEMI ? 0.5 : 1;
    try {
      insertMouvement({
        employe_id: ca.employe_id,
        type_operation: 'ajout_annuel',
        date_operation: new Date().toISOString().split('T')[0],
        jours: joursR,
        motif: `RMA \u2014 restauration cong\u00E9 ${ca.code} du ${ca.date} \u2014 Mat ${ca.matricule} (suppression)`,
        solde_type: 'conge',
      });
      mouvementsRestaures++;
    } catch {}
  }
  res.json({ ok: true, supprimees: r.changes, mouvementsRestaures });
});

// ---- Modification manuelle d'une cellule du journal RMA (super_admin) ----
router.put('/update', (req, res) => {
  const { employe_id, date, ancien_code, nouveau_code } = req.body || {};
  if (!employe_id || !date || !nouveau_code) {
    return res.status(400).json({ error: 'Paramètres employe_id, date et nouveau_code requis.' });
  }
  const jour = normaliserDate(date);
  if (!jour) return res.status(400).json({ error: 'Format de date invalide (AAAA-MM-JJ ou JJ/MM/AAAA).' });
  const codeFinal = normaliserCode(nouveau_code);
  if (!codeFinal) return res.status(400).json({ error: 'Code invalide.' });

  // Vérifier que le code existe dans codes_paie
  const codeExiste = db.prepare('SELECT code FROM codes_paie WHERE code = ?').get(codeFinal);
  if (!codeExiste) return res.status(400).json({ error: `Le code « ${codeFinal} » n'existe pas dans la codification.` });

  const emp = db.prepare('SELECT id, matricule FROM employes WHERE id = ? AND actif = 1').get(employe_id);
  if (!emp) return res.status(400).json({ error: 'Employé introuvable ou inactif.' });

  const ancienCodeNorm = ancien_code ? normaliserCode(ancien_code) : null;

  // Trouver la ligne existante pour cet employé + date (possiblement avec un ancien code)
  let rowExistante = null;
  if (ancienCodeNorm) {
    rowExistante = db.prepare('SELECT id, code FROM codes_importes WHERE employe_id = ? AND date = ? AND code = ?').get(employe_id, jour, ancienCodeNorm);
  }
  if (!rowExistante) {
    rowExistante = db.prepare('SELECT id, code FROM codes_importes WHERE employe_id = ? AND date = ?').get(employe_id, jour);
  }

  const ancienCode = rowExistante ? rowExistante.code : null;
  const memeCode = ancienCode && ancienCode === codeFinal;

  const tx = db.transaction(() => {
    if (memeCode) {
      return { modifie: false, message: 'Le code est déjà celui demandé.' };
    }

    if (rowExistante) {
      // Supprimer l'ancienne ligne
      db.prepare('DELETE FROM codes_importes WHERE id = ?').run(rowExistante.id);
    }

    // Insérer la nouvelle ligne
    db.prepare('INSERT INTO codes_importes (employe_id, matricule, date, code) VALUES (?, ?, ?, ?)').run(
      emp.id, emp.matricule, jour, codeFinal
    );

    return { modifie: true, ancienCode, nouveauCode: codeFinal };
  });

  let result;
  try {
    result = tx();
  } catch (e) {
    return res.status(500).json({ error: 'Erreur lors de la modification : ' + e.message });
  }

  if (!result.modifie) {
    return res.json({ ok: true, modifie: false, message: result.message });
  }

  // --- Gestion du solde congé (compensation « grand livre » uniquement : la vue « Éditer solde de
  // congé » recalcule les prélèvements depuis codes_importes et ignore ces mouvements) ---
  let mouvementsCrees = 0;
  let mouvementsRestaures = 0;

  const ancienEstConge = result.ancienCode === CODE_RMA_CONGE || result.ancienCode === CODE_RMA_DEMI;
  const nouveauEstConge = result.nouveauCode === CODE_RMA_CONGE || result.nouveauCode === CODE_RMA_DEMI;
  const joursNouveau = result.nouveauCode === CODE_RMA_DEMI ? 0.5 : 1;
  const jourGr = new Date().toISOString().split('T')[0];
  // Prélèvement RMA de la journée (créé à l'import ou à la dernière modification) — un seul par jour,
  // son montant suit le code courant (CA=1, DJ=0,5).
  const mvtConge = db.prepare("SELECT id, jours FROM mouvements WHERE employe_id = ? AND date_operation = ? AND type_operation = 'prelevement' AND solde_type = 'conge' AND motif LIKE 'RMA%' LIMIT 1").get(emp.id, jour);
  const jourCouvre = demandeAccepteeCouvre(emp.id, jour);

  if (nouveauEstConge) {
    // Nouveau code = CA/DJ → on ajuste/crée la déduction au montant exact du nouveau code.
    if (!jourCouvre && mvtConge) {
      if (Math.round(mvtConge.jours * 1000) / 1000 !== joursNouveau) {
        db.prepare('UPDATE mouvements SET jours = ?, motif = ?, solde_apres = ? WHERE id = ?').run(
          joursNouveau,
          `RMA — Congé ${result.nouveauCode} du ${jour} — Mat ${emp.matricule} (modification)`,
          computeSoldeApres(emp.id, 'prelevement', joursNouveau),
          mvtConge.id
        );
      }
    } else if (!jourCouvre && !mvtConge) {
      try {
        insertMouvement({
          employe_id: emp.id,
          type_operation: 'prelevement',
          date_operation: jour,
          jours: joursNouveau,
          motif: `RMA — Congé ${result.nouveauCode} du ${jour} — Mat ${emp.matricule} (modification)`,
          solde_type: 'conge',
        });
        mouvementsCrees++;
      } catch {}
    }
  } else if (ancienEstConge && mvtConge) {
    // On quitte CA/DJ (rectifié en A1/MA/RP…) → la journée n'est plus décomptée : on compense le
    // prélèvement historique par une « restauration » du montant réellement déduit (un seul par jour).
    const dejaRestaure = db.prepare("SELECT id FROM mouvements WHERE employe_id = ? AND date_operation = ? AND type_operation = 'ajout_annuel' AND solde_type = 'conge' AND motif LIKE 'RMA%restauration%' LIMIT 1").get(emp.id, jour);
    if (!dejaRestaure) {
      try {
        insertMouvement({
          employe_id: emp.id,
          type_operation: 'ajout_annuel',
          date_operation: jourGr,
          jours: mvtConge.jours,
          motif: `RMA — restauration congé ${result.ancienCode} du ${jour} — Mat ${emp.matricule} (modification)`,
          solde_type: 'conge',
        });
        mouvementsRestaures++;
      } catch {}
    }
  }

  res.json({ ok: true, modifie: true, ancienCode: result.ancienCode, nouveauCode: result.nouveauCode, mouvementsCrees, mouvementsRestaures });
});

// ---- Suppression d'une cellule précise du journal RMA (super_admin) ----
router.delete('/cell', (req, res) => {
  const { employe_id, date, code } = req.query;
  if (!employe_id || !date) {
    return res.status(400).json({ error: 'Paramètres employe_id et date requis.' });
  }
  const jour = normaliserDate(date);
  if (!jour) return res.status(400).json({ error: 'Format de date invalide.' });

  const emp = db.prepare('SELECT id, matricule FROM employes WHERE id = ?').get(employe_id);
  if (!emp) return res.status(400).json({ error: 'Employé introuvable.' });

  const codeNorm = code ? normaliserCode(code) : null;
  // Pré-sélectionner les CA/DJ ciblés AVANT la suppression (sinon la requête après DELETE ne renvoie rien
  // et l'on ne sait pas si une suppression multi-codes CA+DJ réellement déduits doit être restaurée).
  const avantSuppr = codeNorm
    ? db.prepare("SELECT code FROM codes_importes WHERE employe_id = ? AND date = ? AND code = ?").all(employe_id, jour, codeNorm)
    : db.prepare("SELECT code FROM codes_importes WHERE employe_id = ? AND date = ? AND code IN (?, ?)").all(employe_id, jour, CODE_RMA_CONGE, CODE_RMA_DEMI);

  let sqlDel = 'DELETE FROM codes_importes WHERE employe_id = ? AND date = ?';
  const params = [employe_id, jour];
  if (codeNorm) {
    sqlDel += ' AND code = ?';
    params.push(codeNorm);
  }
  const r = db.prepare(sqlDel).run(...params);

  // Restaurer le solde si on supprimait un CA/DJ : le montant restauré = celui réellement déduit par le
  // mouvement RMA de cette journée (CA=1, DJ=0,5). Les compensations sont des crédits « grand livre »
  // uniquement — la vue « Éditer solde de congé » recalcule les prélèvements depuis codes_importes.
  const estConge = (c) => c === CODE_RMA_CONGE || c === CODE_RMA_DEMI;
  if ((!codeNorm || estConge(codeNorm)) && avantSuppr.length > 0) {
    const dejaRestaure = db.prepare("SELECT id FROM mouvements WHERE employe_id = ? AND date_operation = ? AND type_operation = 'ajout_annuel' AND solde_type = 'conge' AND motif LIKE 'RMA%restauration%' LIMIT 1").get(emp.id, jour);
    const mvExiste = db.prepare("SELECT jours FROM mouvements WHERE employe_id = ? AND date_operation = ? AND type_operation = 'prelevement' AND solde_type = 'conge' AND motif LIKE 'RMA%' LIMIT 1").get(emp.id, jour);
    if (mvExiste && !dejaRestaure) {
      try {
        insertMouvement({
          employe_id: emp.id,
          type_operation: 'ajout_annuel',
          date_operation: new Date().toISOString().split('T')[0],
          jours: mvExiste.jours,
          motif: `RMA — restauration congé ${codeNorm || CODE_RMA_CONGE} du ${jour} — Mat ${emp.matricule} (suppression cellule)`,
          solde_type: 'conge',
        });
      } catch {}
    }
  }

  res.json({ ok: true, supprimees: r.changes });
});

// ---- Export PDF RMA — modèle IDENTIQUE au Journal de paie (server/utils/pdfJournal.js) ----
router.get('/pdf', (req, res) => {
  const { debut, fin } = req.query;
  if (!debut || !fin || !DATE_RE.test(debut) || !DATE_RE.test(fin)) {
    return res.status(400).json({ error: 'Paramètres debut et fin requis au format AAAA-MM-JJ.' });
  }
  if (fin < debut) return res.status(400).json({ error: 'La date de fin doit être postérieure ou égale à la date de début.' });

  const employes = db.prepare(`
    SELECT e.id, e.matricule, e.nom, e.prenom, c.libelle AS categorie
    FROM employes e JOIN categories c ON c.id = e.categorie_id
    WHERE e.actif = 1 ORDER BY CAST(e.matricule AS INTEGER), e.matricule
  `).all();
  const rows = db.prepare(`SELECT employe_id, date AS jour, code, demi_journee FROM codes_importes WHERE date >= ? AND date <= ? ORDER BY date, code`).all(debut, fin);
  const jours = {};
  const joursDemi = {};
  const parCode = {};
  for (const r of rows) {
    if (!jours[r.employe_id]) jours[r.employe_id] = {};
    const cur = jours[r.employe_id][r.jour];
    jours[r.employe_id][r.jour] = cur ? `${cur}/${r.code}` : r.code;
    if ((r.demi_journee && r.code === CODE_RMA_CONGE) || r.code === CODE_RMA_DEMI) {
      if (!joursDemi[r.employe_id]) joursDemi[r.employe_id] = {};
      joursDemi[r.employe_id][r.jour] = true;
    }
    parCode[r.code] = (parCode[r.code] || 0) + 1;
  }
  const dates = listDates(debut, fin);
  return buildPdf({ res, debut, fin, dates, employes, jours, joursDemi, totaux: { par_code: parCode, total: rows.length }, titre: 'Journal RMA' });
});

module.exports = router;

// Fonctions pures exposées pour les tests unitaires
module.exports.normaliserCode = normaliserCode;
module.exports.normaliserDate = normaliserDate;
