const { Router } = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const sharp = require('sharp');
const { db, soldeMaladie, soldeCongeRestantDate, journalSoldeConge } = require('../db');
const { requireRole } = require('../middleware/auth');
const router = Router();

const lecture = requireRole('super_admin', 'consultation', 'moderateur');

const todayISO = () => new Date().toISOString().slice(0, 10);

// Grille de salaire : valeur (salaire de base) et rubrique correspondant à (grade, classe, echelon)
function grilleSalaire(grade, classe, echelon) {
  if (!grade || !classe || !echelon) return null;
  return db.prepare(
    'SELECT rubrique, valeur FROM grille_salaire WHERE grade = ? AND classe = ? AND echelon = ?'
  ).get(String(grade).trim(), String(classe).trim(), String(echelon).trim()) || null;
}

// Consomme les changements de la grille SANS éditer la fiche : recale salaire de base (et rubrique
// si vide) à la lecture, à partir de (grade / classe / echelon). Appliqué à toutes les lectures d'employé.
function enrichirGrille(e) {
  if (!e) return e;
  const g = grilleSalaire(e.grade, e.classe, e.echelon);
  if (g) {
    e.salaire_base = String(g.valeur);
    if (!e.rubrique) e.rubrique = g.rubrique;
  }
  return e;
}

const BASE = `
  SELECT e.id, e.matricule, e.nom, e.prenom, e.actif, e.categorie_id,
         e.date_naissance, e.date_embauche, e.photo_url,
         e.rubrique, e.grade, e.classe, e.echelon,
         e.adresse, e.telephone, e.situation_familiale, e.nombre_enfants,
         e.lieu_naissance, e.sexe, e.nationalite, e.groupe_sanguin, e.cin, e.date_emission_cin, e.service_militaire, e.cnss,
         e.rue, e.code_postal, e.localite, e.gouvernorat, e.gsm, e.adresse_electronique,
         e.conjoint_nom, e.conjoint_date_naissance, e.enfants_details,
         e.niveau_etudes, e.diplome, e.date_emission_diplome,
         e.cnam, e.type_contrat, e.banque, e.titulaire_compte, e.type_compte, e.rib,
         e.salaire_base, e.indemnite_presence, e.indemnite_transport, e.indemnite_fonction, e.intitule_poste,
         e.departement,
         c.libelle AS categorie
  FROM employes e
  JOIN categories c ON c.id = e.categorie_id
`;

router.get('/', lecture, (req, res) => {
  const { search, categorie, actif } = req.query;
  let sql = BASE + ' WHERE 1=1';
  const params = [];
  if (search) {
    sql += ' AND (e.matricule LIKE ? OR e.nom LIKE ? OR e.prenom LIKE ? OR e.nom || \' \' || e.prenom LIKE ?)';
    const p = `%${search}%`;
    params.push(p, p, p, p);
  }
  if (categorie) {
    sql += ' AND e.categorie_id = ?';
    params.push(Number(categorie));
  }
  if (actif !== undefined) {
    sql += ' AND e.actif = ?';
    params.push(Number(actif));
  }
  sql += ' ORDER BY CAST(e.matricule AS INTEGER), e.matricule';
  const rows = db.prepare(sql).all(...params).map(enrichirGrille);
  res.json(rows.map((r) => ({ ...r, solde: soldeCongeRestantDate(r.id, todayISO()), solde_maladie: soldeMaladie(r.id) })));
});

router.get('/:id', lecture, (req, res) => {
  const e = enrichirGrille(db.prepare(BASE + ' WHERE e.id = ?').get(req.params.id));
  if (!e) return res.status(404).json({ error: 'Employé introuvable.' });

  // Solde de congé cohérent avec le « Journal du solde de congé » (source de vérité RMA) :
  // accorde = dotations crédit, consomme = prélèvements CA/DJ du journal RMA (toute cellule
  // de la grille = jour consommé), solde = accorde − consomme. Le solde maladie reste sur le
  // grand livre des mouvements.
  const journal = journalSoldeConge(e.id);
  const accorde = Math.round(journal.lignes.filter((l) => l.signe > 0).reduce((s, l) => s + l.jours, 0) * 1000) / 1000;
  const consomme = Math.round(journal.lignes.filter((l) => l.signe < 0).reduce((s, l) => s + l.jours, 0) * 1000) / 1000;
  const solde = journal.solde;
  const soldeMaladieSolde = soldeMaladie(e.id);
  const accordeMaladie = db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN type_operation IN ('solde_initial','ajout_annuel') THEN jours ELSE 0 END), 0) AS accorde
    FROM mouvements WHERE employe_id = ? AND solde_type = 'maladie'
  `).get(e.id).accorde;
  const consommeMaladie = db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN type_operation = 'maladie' THEN jours ELSE 0 END), 0) AS consomme
    FROM mouvements WHERE employe_id = ? AND solde_type = 'maladie'
  `).get(e.id).consomme;
  const mouvements = db.prepare(`
    SELECT m.* FROM mouvements m
    WHERE m.employe_id = ?
    ORDER BY m.date_operation DESC, m.id DESC
  `).all(e.id);

  res.json({ ...e, solde, solde_maladie: soldeMaladieSolde, accorde, consomme, accorde_maladie: accordeMaladie, consomme_maladie: consommeMaladie, mouvements, annees_service: anneesService(e.date_embauche) });
});

router.post('/', (req, res) => {
  const { matricule, nom, prenom, categorie_id, rubrique, grade, classe, echelon, actif, date_naissance, date_embauche, adresse, telephone, situation_familiale, nombre_enfants, lieu_naissance, sexe, nationalite, groupe_sanguin, cin, date_emission_cin, service_militaire, cnss, rue, code_postal, localite, gouvernorat, gsm, adresse_electronique, conjoint_nom, conjoint_date_naissance, enfants_details, niveau_etudes, diplome, date_emission_diplome, cnam, type_contrat, banque, titulaire_compte, type_compte, rib, salaire_base, indemnite_presence, indemnite_transport, indemnite_fonction, intitule_poste } = req.body || {};
  if (!matricule || !nom || !prenom || !categorie_id) {
    return res.status(400).json({ error: 'Matricule, nom, prénom et catégorie sont obligatoires.' });
  }
  const mat = String(matricule).trim();
  const exists = db.prepare('SELECT id FROM employes WHERE matricule = ?').get(mat);
  if (exists) return res.status(400).json({ error: 'Ce matricule existe déjà.' });
  const cat = db.prepare('SELECT id FROM categories WHERE id = ?').get(Number(categorie_id));
  if (!cat) return res.status(400).json({ error: 'Catégorie inconnue.' });
  try {
    const gr = grilleSalaire(grade, classe, echelon);
    const rubriqueRef = String(rubrique || '').trim() || (gr ? gr.rubrique : '');
    const r = db.prepare('INSERT INTO employes (matricule, nom, prenom, categorie_id, rubrique, grade, classe, echelon, actif, date_naissance, date_embauche, adresse, telephone, situation_familiale, nombre_enfants, lieu_naissance, sexe, nationalite, groupe_sanguin, cin, date_emission_cin, service_militaire, cnss, rue, code_postal, localite, gouvernorat, gsm, adresse_electronique, conjoint_nom, conjoint_date_naissance, enfants_details, niveau_etudes, diplome, date_emission_diplome, cnam, type_contrat, banque, titulaire_compte, type_compte, rib, salaire_base, indemnite_presence, indemnite_transport, indemnite_fonction, intitule_poste, departement) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(mat, String(nom).trim(), String(prenom).trim(), Number(categorie_id),
        rubriqueRef, String(grade || '').trim(), String(classe || '').trim(), String(echelon || '').trim(),
        actif === false ? 0 : 1,
        date_naissance || null, date_embauche || null,
        adresse ? String(adresse).trim() : null, telephone ? String(telephone).trim() : null,
        situation_familiale ? String(situation_familiale).trim() : null, nombre_enfants ? Number(nombre_enfants) : 0,
        lieu_naissance ? String(lieu_naissance).trim() : null, sexe || null, nationalite ? String(nationalite).trim() : null, groupe_sanguin || null, cin ? String(cin).trim() : null, date_emission_cin || null, service_militaire || null, cnss ? String(cnss).trim() : null,
        rue ? String(rue).trim() : null, code_postal ? String(code_postal).trim() : null, localite ? String(localite).trim() : null, gouvernorat ? String(gouvernorat).trim() : null, gsm ? String(gsm).trim() : null, adresse_electronique ? String(adresse_electronique).trim() : null,
        conjoint_nom ? String(conjoint_nom).trim() : null, conjoint_date_naissance || null, enfants_details ? (typeof enfants_details==='string'? enfants_details : JSON.stringify(enfants_details)) : null,
        niveau_etudes || null, diplome ? String(diplome).trim() : null, date_emission_diplome || null,
        cnam ? String(cnam).trim() : null, type_contrat || null, banque ? String(banque).trim() : null, titulaire_compte ? String(titulaire_compte).trim() : null, type_compte || null, rib ? String(rib).replace(/\s/g, '') : null,
        salaire_base !== undefined && salaire_base !== '' ? String(salaire_base).trim() : (gr ? String(gr.valeur) : null), indemnite_presence !== undefined && indemnite_presence !== '' ? String(indemnite_presence).trim() : null, indemnite_transport !== undefined && indemnite_transport !== '' ? String(indemnite_transport).trim() : null, indemnite_fonction !== undefined && indemnite_fonction !== '' ? String(indemnite_fonction).trim() : null, intitule_poste !== undefined && intitule_poste !== '' ? String(intitule_poste).trim() : null,
        departement ? String(departement).trim() : null);
    res.status(201).json({ id: r.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ---- Import des dates RH (naissance / embauche) par matricule — complète les fiches existantes (session 15) ----

// Normalise une date vers AAAA-MM-JJ : accepte AAAA-MM-JJ, AAAA/MM/JJ, JJ/MM/AAAA, JJ-MM-AAAA
// ET les années à 2 chiffres (ex. 12/11/68) — pivot 30 (convention Excel) : 00-29 → 20xx, 30-99 → 19xx
function normaliserDateRH(valeur) {
  const s = String(valeur || '').trim().replace(/["']/g, '');
  if (!s) return { ok: true, iso: null };
  let m = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/); // AAAA-MM-JJ / AAAA/MM/JJ
  let an, mois, jour;
  if (m) {
    an = m[1]; mois = m[2]; jour = m[3];
  } else {
    m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/); // JJ/MM/AAAA ou JJ/MM/AA
    if (!m) return { ok: false, message: `Date invalide : ${s}` };
    jour = m[1]; mois = m[2]; an = m[3];
  }
  let anN = Number(an);
  if (String(an).length <= 2) anN = anN < 30 ? 2000 + anN : 1900 + anN;
  const moisN = Number(mois), jourN = Number(jour);
  const dt = new Date(Date.UTC(anN, moisN - 1, jourN));
  if (dt.getUTCFullYear() !== anN || dt.getUTCMonth() !== moisN - 1 || dt.getUTCDate() !== jourN) {
    return { ok: false, message: `Date invalide : ${s}` };
  }
  return { ok: true, iso: `${anN}-${String(moisN).padStart(2, '0')}-${String(jourN).padStart(2, '0')}` };
}

// POST /api/employes/import-rh — met à jour date_naissance / date_embauche des employés existants (matricule)
router.post('/import-rh', (req, res) => {
  const { csv } = req.body || {};
  if (!csv || !String(csv).trim()) {
    return res.status(400).json({ error: 'Contenu CSV vide.' });
  }
  const lignes = String(csv).trim().split(/\r?\n/).filter((l) => l.trim().length > 0);
  const sep = lignes[0].includes(';') ? ';' : ',';
  const parsed = lignes.map((l) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, '')));

  let start = 0;
  const firstLower = parsed[0].map((c) => c.toLowerCase());
  if (firstLower.some((c) => c.includes('matricule') || c.includes('naissance') || c.includes('embauche'))) start = 1;
  if (parsed.length <= start) {
    return res.status(400).json({ error: 'Aucune ligne de données trouvée dans le CSV.' });
  }

  const getEmp = db.prepare('SELECT id, matricule, nom, prenom FROM employes WHERE matricule = ? OR CAST(matricule AS INTEGER) = CAST(? AS INTEGER)');
  const upd = db.prepare('UPDATE employes SET date_naissance = ?, date_embauche = ? WHERE id = ?');

  const resultats = [];
  const nonReconnus = [];
  let importes = 0;

  try {
    const tx = db.transaction(() => {
      for (let i = start; i < parsed.length; i++) {
        const [matricule, naissance, embauche] = parsed[i];
        const ligne = i + 1;
        if (!matricule) {
          resultats.push({ ligne, statut: 'erreur', message: 'matricule manquant' });
          continue;
        }
        const e = getEmp.get(matricule, matricule);
        if (!e) {
          nonReconnus.push(matricule);
          resultats.push({ ligne, statut: 'non reconnu', matricule, message: 'matricule absent de la base' });
          continue;
        }
        const dN = normaliserDateRH(naissance);
        const dE = normaliserDateRH(embauche);
        if (!dN.ok || !dE.ok) {
          const msg = [dN.message, dE.message].filter(Boolean).join(' ; ');
          resultats.push({ ligne, statut: 'erreur', matricule, message: msg });
          continue;
        }
        upd.run(dN.iso, dE.iso, e.id);
        importes++;
        resultats.push({ ligne, statut: 'ok', matricule: e.matricule, message: `${e.nom} ${e.prenom} : dates mises à jour` });
      }
    });
    tx();
    res.json({ ok: true, importes, total: parsed.length - start, nonReconnus, resultats });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/:id', (req, res) => {
  const { matricule, nom, prenom, categorie_id, rubrique, grade, classe, echelon, actif, date_naissance, date_embauche, adresse, telephone, situation_familiale, nombre_enfants, lieu_naissance, sexe, nationalite, groupe_sanguin, cin, date_emission_cin, service_militaire, cnss, rue, code_postal, localite, gouvernorat, gsm, adresse_electronique, conjoint_nom, conjoint_date_naissance, enfants_details, niveau_etudes, diplome, date_emission_diplome, cnam, type_contrat, banque, titulaire_compte, type_compte, rib, salaire_base, indemnite_presence, indemnite_transport, indemnite_fonction, intitule_poste, departement } = req.body || {};
  const id = Number(req.params.id);
  const e = db.prepare('SELECT id, matricule FROM employes WHERE id = ?').get(id);
  if (!e) return res.status(404).json({ error: 'Employé introuvable.' });

  if (categorie_id && !db.prepare('SELECT id FROM categories WHERE id = ?').get(Number(categorie_id))) {
    return res.status(400).json({ error: 'Catégorie inconnue.' });
  }

  let nouveauMatricule = e.matricule;
  if (matricule !== undefined && String(matricule).trim() !== e.matricule) {
    nouveauMatricule = String(matricule).trim();
    if (!nouveauMatricule) return res.status(400).json({ error: 'Le matricule ne peut pas être vide.' });
    const conflict = db.prepare('SELECT id FROM employes WHERE matricule = ? AND id != ?').get(nouveauMatricule, id);
    if (conflict) return res.status(400).json({ error: 'Ce matricule est déjà utilisé par un autre employé.' });
  }

  const gr = grilleSalaire(grade, classe, echelon);

  db.prepare(`
    UPDATE employes SET
      matricule = ?,
      nom = COALESCE(?, nom),
      prenom = COALESCE(?, prenom),
      categorie_id = COALESCE(?, categorie_id),
      rubrique = COALESCE(?, rubrique),
      grade = COALESCE(?, grade),
      classe = COALESCE(?, classe),
      echelon = COALESCE(?, echelon),
      actif = COALESCE(?, actif),
      date_naissance = COALESCE(?, date_naissance),
      date_embauche = COALESCE(?, date_embauche),
      adresse = COALESCE(?, adresse),
      telephone = COALESCE(?, telephone),
      situation_familiale = COALESCE(?, situation_familiale),
      nombre_enfants = COALESCE(?, nombre_enfants),
      lieu_naissance = COALESCE(?, lieu_naissance),
      sexe = COALESCE(?, sexe),
      nationalite = COALESCE(?, nationalite),
      groupe_sanguin = COALESCE(?, groupe_sanguin),
      cin = COALESCE(?, cin),
      date_emission_cin = COALESCE(?, date_emission_cin),
      service_militaire = COALESCE(?, service_militaire),
      cnss = COALESCE(?, cnss),
      rue = COALESCE(?, rue),
      code_postal = COALESCE(?, code_postal),
      localite = COALESCE(?, localite),
      gouvernorat = COALESCE(?, gouvernorat),
      gsm = COALESCE(?, gsm),
      adresse_electronique = COALESCE(?, adresse_electronique),
      conjoint_nom = COALESCE(?, conjoint_nom),
      conjoint_date_naissance = COALESCE(?, conjoint_date_naissance),
      enfants_details = COALESCE(?, enfants_details),
      niveau_etudes = COALESCE(?, niveau_etudes),
      diplome = COALESCE(?, diplome),
      date_emission_diplome = COALESCE(?, date_emission_diplome),
      cnam = COALESCE(?, cnam),
      type_contrat = COALESCE(?, type_contrat),
      banque = COALESCE(?, banque),
      titulaire_compte = COALESCE(?, titulaire_compte),
      type_compte = COALESCE(?, type_compte),
      rib = COALESCE(?, rib),
      salaire_base = COALESCE(?, salaire_base),
      indemnite_presence = COALESCE(?, indemnite_presence),
      indemnite_transport = COALESCE(?, indemnite_transport),
      indemnite_fonction = COALESCE(?, indemnite_fonction),
      intitule_poste = COALESCE(?, intitule_poste),
      departement = COALESCE(?, departement)
    WHERE id = ?
  `).run(
    nouveauMatricule,
    nom !== undefined ? String(nom).trim() : null,
    prenom !== undefined ? String(prenom).trim() : null,
    categorie_id !== undefined ? Number(categorie_id) : null,
    rubrique !== undefined ? (String(rubrique).trim() || (gr ? gr.rubrique : '')) : (gr ? gr.rubrique : null),
    grade !== undefined ? String(grade).trim() : null,
    classe !== undefined ? String(classe).trim() : null,
    echelon !== undefined ? String(echelon).trim() : null,
    actif !== undefined ? (actif ? 1 : 0) : null,
    date_naissance !== undefined ? (date_naissance || null) : null,
    date_embauche !== undefined ? (date_embauche || null) : null,
    adresse !== undefined ? (adresse ? String(adresse).trim() : null) : null,
    telephone !== undefined ? (telephone ? String(telephone).trim() : null) : null,
    situation_familiale !== undefined ? (situation_familiale ? String(situation_familiale).trim() : null) : null,
    nombre_enfants !== undefined ? (nombre_enfants !== '' ? Number(nombre_enfants) : null) : null,
    lieu_naissance !== undefined ? (lieu_naissance ? String(lieu_naissance).trim() : null) : null,
    sexe !== undefined ? (sexe || null) : null,
    nationalite !== undefined ? (nationalite ? String(nationalite).trim() : null) : null,
    groupe_sanguin !== undefined ? (groupe_sanguin || null) : null,
    cin !== undefined ? (cin ? String(cin).trim() : null) : null,
    date_emission_cin !== undefined ? (date_emission_cin || null) : null,
    service_militaire !== undefined ? (service_militaire || null) : null,
    cnss !== undefined ? (cnss ? String(cnss).trim() : null) : null,
    rue !== undefined ? (rue ? String(rue).trim() : null) : null,
    code_postal !== undefined ? (code_postal ? String(code_postal).trim() : null) : null,
    localite !== undefined ? (localite ? String(localite).trim() : null) : null,
    gouvernorat !== undefined ? (gouvernorat ? String(gouvernorat).trim() : null) : null,
    gsm !== undefined ? (gsm ? String(gsm).trim() : null) : null,
    adresse_electronique !== undefined ? (adresse_electronique ? String(adresse_electronique).trim() : null) : null,
    conjoint_nom !== undefined ? (conjoint_nom ? String(conjoint_nom).trim() : null) : null,
    conjoint_date_naissance !== undefined ? (conjoint_date_naissance || null) : null,
    enfants_details !== undefined ? (enfants_details ? (typeof enfants_details==='string'? enfants_details : JSON.stringify(enfants_details)) : null) : null,
    niveau_etudes !== undefined ? (niveau_etudes || null) : null,
    diplome !== undefined ? (diplome ? String(diplome).trim() : null) : null,
    date_emission_diplome !== undefined ? (date_emission_diplome || null) : null,
    cnam !== undefined ? (cnam ? String(cnam).trim() : null) : null,
    type_contrat !== undefined ? (type_contrat || null) : null,
    banque !== undefined ? (banque ? String(banque).trim() : null) : null,
    titulaire_compte !== undefined ? (titulaire_compte ? String(titulaire_compte).trim() : null) : null,
    type_compte !== undefined ? (type_compte || null) : null,
    rib !== undefined ? (rib ? String(rib).replace(/\s/g, '') : null) : null,
    salaire_base !== undefined ? (salaire_base !== '' ? String(salaire_base).trim() : (gr ? String(gr.valeur) : null)) : (gr ? String(gr.valeur) : null),
    indemnite_presence !== undefined ? (indemnite_presence !== '' ? String(indemnite_presence).trim() : null) : null,
    indemnite_transport !== undefined ? (indemnite_transport !== '' ? String(indemnite_transport).trim() : null) : null,
    indemnite_fonction !== undefined ? (indemnite_fonction !== '' ? String(indemnite_fonction).trim() : null) : null,
    intitule_poste !== undefined ? (intitule_poste !== '' ? String(intitule_poste).trim() : null) : null,
    departement !== undefined ? (departement ? String(departement).trim() : null) : null,
    id
  );
  res.json({ ok: true, id, matricule: nouveauMatricule });
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const e = db.prepare('SELECT id FROM employes WHERE id = ?').get(id);
  if (!e) return res.status(404).json({ error: 'Employé introuvable.' });

  const tx = db.transaction(() => {
    // Purger toutes les tables qui référencent employe_id (ordre : enfants d'abord)
    const tables = [
      'codes_importes',
      'demandes_conge',
      'arrets_maladie',
      'pointages',
      'corrections_pointages',
      'horaires_travail',
      'horaires_pointages',
      'notifications_absence',
      'mouvements',
      'utilisateurs',
    ];
    for (const t of tables) {
      db.prepare(`DELETE FROM ${t} WHERE employe_id = ?`).run(id);
    }
    db.prepare('DELETE FROM employes WHERE id = ?').run(id);
  });
  tx();
  res.json({ ok: true });
});

// ---- Espace Employé / Consultation : accès par MATRICULE ----

// Un compte de rôle 'employe' ne peut accéder qu'à SA propre fiche
function validerAccesMatricule(req, res, next) {
  const e = db.prepare('SELECT id FROM employes WHERE matricule = ?').get(String(req.params.matricule));
  if (!e) return res.status(404).json({ error: 'Employé introuvable.' });
  req.employe = e;
  if (req.user.role === 'employe') {
    const c = db.prepare('SELECT employe_id FROM utilisateurs WHERE id = ?').get(req.user.id);
    if (!c || c.employe_id !== e.id) {
      return res.status(403).json({ error: 'Accès refusé : vous ne pouvez consulter que votre propre espace.' });
    }
  }
  return next();
}

function anneesService(dateEmbauche) {
  if (!dateEmbauche) return null;
  const d = new Date(dateEmbauche + 'T00:00:00');
  if (isNaN(d)) return null;
  const now = new Date();
  let ans = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) ans -= 1;
  return ans;
}

// GET /api/employes/:matricule/fiche — fiche complète (protégée : super_admin/consultation, ou l'employé lui-même)
router.get('/:matricule/fiche', validerAccesMatricule, (req, res) => {
  const e = enrichirGrille(db.prepare(BASE + ' WHERE e.matricule = ?').get(req.params.matricule));
  if (!e) return res.status(404).json({ error: 'Employé introuvable.' });
  // Solde de congé cohérent avec le « Journal du solde de congé » (source de vérité RMA) :
  // accorde = dotations crédit, consomme = prélèvements CA/DJ du journal RMA (toute cellule
  // de la grille = jour consommé), solde = accorde − consomme. Le solde maladie reste sur le
  // grand livre des mouvements.
  const journal = journalSoldeConge(e.id);
  const accorde = Math.round(journal.lignes.filter((l) => l.signe > 0).reduce((s, l) => s + l.jours, 0) * 1000) / 1000;
  const consomme = Math.round(journal.lignes.filter((l) => l.signe < 0).reduce((s, l) => s + l.jours, 0) * 1000) / 1000;
  const solde = journal.solde;
  const soldeMaladieSolde = soldeMaladie(e.id);
  const accordeMaladie = db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN type_operation IN ('solde_initial','ajout_annuel') THEN jours ELSE 0 END), 0) AS accorde
    FROM mouvements WHERE employe_id = ? AND solde_type = 'maladie'
  `).get(e.id).accorde;
  const consommeMaladie = db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN type_operation = 'maladie' THEN jours ELSE 0 END), 0) AS consomme
    FROM mouvements WHERE employe_id = ? AND solde_type = 'maladie'
  `).get(e.id).consomme;

  res.json({
    ...e,
    solde, solde_maladie: soldeMaladieSolde,
    accorde, consomme, accorde_maladie: accordeMaladie, consomme_maladie: consommeMaladie,
    annees_service: anneesService(e.date_embauche),
  });
});

// GET /api/employes/:matricule/mouvements?type=&debut=&fin= — journal du compte, filtrable
router.get('/:matricule/mouvements', validerAccesMatricule, (req, res) => {
  const { type, debut, fin } = req.query;
  let sql = `SELECT m.*, a.statut AS arret_statut FROM mouvements m
             LEFT JOIN arrets_maladie a ON a.id = m.arret_id
             WHERE m.employe_id = ?`;
  const params = [req.employe.id];
  if (type) {
    sql += ' AND m.type_operation = ?';
    params.push(type);
  }
  if (debut) { sql += ' AND m.date_operation >= ?'; params.push(debut); }
  if (fin) { sql += ' AND m.date_operation <= ?'; params.push(fin); }
  sql += ' ORDER BY m.date_operation DESC, m.id DESC';

  const rows = db.prepare(sql).all(...params).map((m) => {
    let statut = '—';
    if (m.arret_statut) statut = m.arret_statut;
    else if (m.type_operation === 'prelevement') statut = 'acceptee';
    else if (m.type_operation === 'maladie') statut = 'valide';
    else if (m.type_operation === 'absence') statut = 'enregistree';
    else if (m.type_operation === 'solde_initial') statut = 'credite';
    else if (m.type_operation === 'ajout_annuel') statut = 'credite';
    return { id: m.id, date_operation: m.date_operation, type_operation: m.type_operation, jours: m.jours, motif: m.motif, solde_apres: m.solde_apres, solde_type: m.solde_type, statut, created_at: m.created_at };
  });
  res.json(rows);
});

// GET /api/employes/:matricule/stats?debut=&fin= — agrégats pour les 3 diagrammes (congé/maladie/absence)
router.get('/:matricule/stats', validerAccesMatricule, (req, res) => {
  const { debut, fin } = req.query;
  const debutPar = debut || '0000-01-01';
  const finPar = fin || '9999-12-31';

  const parMois = (typeOp, soldeType, debits) => db.prepare(`
    SELECT substr(date_operation,1,7) AS mois,
           COUNT(*) AS episodes,
           COALESCE(SUM(jours),0) AS jours
    FROM mouvements
    WHERE employe_id = ? AND type_operation = ? AND solde_type = ? AND date_operation BETWEEN ? AND ?
    GROUP BY substr(date_operation,1,7)
    ORDER BY mois
  `).all(req.employe.id, typeOp, soldeType, debutPar, finPar);

  const somm = (typeOp, soldeType) => db.prepare(`
    SELECT COUNT(*) AS episodes, COALESCE(SUM(jours),0) AS jours
    FROM mouvements
    WHERE employe_id = ? AND type_operation = ? AND solde_type = ? AND date_operation BETWEEN ? AND ?
  `).get(req.employe.id, typeOp, soldeType, debutPar, finPar);

  // Congé consommé : source de vérité = grille RMA (codes_importes CA/DJ) — toute cellule est un
  // jour consommé (CA = 1, DJ / demi-journée = 0,5), aligné sur le dashboard, la fiche, le journal
  // du solde et le journal RMA lui-même (même regroupement mensuel par date de la cellule).
  const congeMois = db.prepare(`
    SELECT substr(ci.date,1,7) AS mois, COUNT(*) AS episodes,
           COALESCE(SUM(CASE WHEN ci.code='DJ' OR ci.demi_journee=1 THEN 0.5 ELSE 1 END),0) AS jours
    FROM codes_importes ci JOIN employes e ON e.id = ci.employe_id
    WHERE e.matricule = ? AND ci.code IN ('CA','DJ') AND ci.date BETWEEN ? AND ?
    GROUP BY substr(ci.date,1,7) ORDER BY mois
  `).all(String(req.params.matricule), debutPar, finPar);
  const conge = congeMois.reduce((a, r) => {
    a.episodes += r.episodes;
    a.jours = Math.round((a.jours + r.jours) * 1000) / 1000;
    return a;
  }, { episodes: 0, jours: 0 });

  const maladie = somm('maladie', 'maladie');
  const absence = somm('absence', 'conge');

  res.json({
    employe: db.prepare('SELECT e.matricule, e.nom, e.prenom, c.libelle AS categorie FROM employes e JOIN categories c ON c.id=e.categorie_id WHERE e.id = ?').get(req.employe.id),
    periode: { debut: debutPar, fin: finPar },
    conge: { ...conge, restant: soldeCongeRestantDate(req.employe.id), parMois: congeMois },
    maladie: { ...maladie, restant: soldeMaladie(req.employe.id), parMois: parMois('maladie', 'maladie') },
    absence: { ...absence, parMois: parMois('absence', 'conge') },
  });
});

// Mois de travail (règle 21 → 20) : un jour (année y, mois m 1-based, jour d) appartient à la
// période (py, pm) avec pm (0-based) — jour ≤ 20 → période du mois courant ; jour > 20 → période
// du mois suivant (décembre → janvier de l'année suivante). Ex. juillet 2026 = 21/06 → 20/07.
function moisTravail(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  let py = y, pm = m - 1;
  if (d > 20) { pm += 1; if (pm === 12) { pm = 0; py += 1; } }
  return { annee: py, mois: pm };
}

// GET /api/employes/:matricule/heures?debut=&fin= — heures travaillées vs heures légales du calendrier
// par jour et par mois, avec % de présence. Source légale : jours_travail (calendrier de l'année) ;
// source travaillée : horaires_travail (import des pointages). Protégé par validerAccesMatricule
// (employé : sa propre fiche uniquement ; super_admin/consultation/moderateur : tous).
// Les mois agrégés suivent la règle du mois de travail (21 du mois précédent → 20 du mois courant).
router.get('/:matricule/heures', validerAccesMatricule, (req, res) => {
  const { debut, fin } = req.query;
  const debutPar = debut || '0000-01-01';
  const finPar = fin || '9999-12-31';

  const an1 = Number(debutPar.slice(0, 4));
  const an2 = Number(finPar.slice(0, 4));

  // Heures légales par jour depuis le calendrier (jours_travail) pour toutes les années couvertes
  const legalMap = {};
  const pLegal = db.prepare('SELECT date, heures, source, label FROM jours_travail WHERE annee = ?');
  for (let a = an1; a <= an2; a++) {
    for (const r of pLegal.all(a)) legalMap[r.date] = { heures: Number(r.heures) || 0, source: r.source, label: r.label };
  }

  // Heures réellement travaillées (pointages importés)
  const travailMap = {};
  const pTravail = db.prepare(
    'SELECT date, duree_secondes FROM horaires_travail WHERE employe_id = ? AND date >= ? AND date <= ?'
  );
  for (const r of pTravail.all(req.employe.id, debutPar, finPar)) {
    travailMap[r.date] = Number(r.duree_secondes) / 3600;
  }
  // Repli badges bruts : toute journée badgée absente de horaires_travail (ex. nouveaux imports
  // de pointages non encore fusionnés dans le journal des heures) compte aussi, durée =
  // dernier badgeage − premier badgeage. horaires_travail reste prioritaire (journal de référence).
  const pBadges = db.prepare(`
    SELECT date, MIN(horodatage) AS mn, MAX(horodatage) AS mx, COUNT(*) AS nb
    FROM pointages WHERE employe_id = ? AND date >= ? AND date <= ?
    GROUP BY date
  `);
  for (const r of pBadges.all(req.employe.id, debutPar, finPar)) {
    if (!r.mn || !r.mx || r.nb < 2 || travailMap[r.date]) continue;
    const sec = Math.max(0, Math.round((new Date(String(r.mx).replace(' ', 'T')).getTime() - new Date(String(r.mn).replace(' ', 'T')).getTime()) / 1000));
    if (sec) travailMap[r.date] = sec / 3600;
  }

  // Jours d'arrêt maladie VALIDÉ de l'employé chevauchant la période (pour déduire
  // les heures correspondantes des heures à travailler avant le calcul du % présence).
  const maladieJours = new Set();
  for (const a of db.prepare(
    "SELECT date_debut, date_fin FROM arrets_maladie WHERE employe_id = ? AND statut = 'valide' AND date_debut <= ? AND date_fin >= ?"
  ).all(req.employe.id, finPar, debutPar)) {
    const sD = a.date_debut > debutPar ? a.date_debut : debutPar;
    const eD = a.date_fin < finPar ? a.date_fin : finPar;
    const cur = new Date(sD + 'T00:00:00');
    const end = new Date(eD + 'T00:00:00');
    while (cur <= end) {
      maladieJours.add(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`);
      cur.setDate(cur.getDate() + 1);
    }
  }

  const arrondi = (v) => Math.round(v * 100) / 100;

  const parJour = [];
  const moisMap = {};
  const d = new Date(debutPar + 'T00:00:00');
  const f = new Date(finPar + 'T00:00:00');
  while (d <= f) {
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const legal = legalMap[date];
    const travaille = travailMap[date] || 0;
    const legalHeures = legal ? legal.heures : null;
    const enMaladie = maladieJours.has(date);
    // Jour en arrêt maladie validé : aucune exigence de présence → pas de % négatif
    const presence = legalHeures && !enMaladie && legalHeures > 0 ? Math.round((travaille / legalHeures) * 1000) / 10 : null;
    parJour.push({
      date,
      jour_type: legal ? legal.source : null,
      label: legal ? legal.label : null,
      legal_heures: legalHeures,
      travaille_heures: arrondi(travaille),
      maladie: enMaladie ? 1 : 0,
      presence_pct: presence,
    });
    // Mois de travail : 21 du mois précédent → 20 du mois courant (ex. juillet 2026 = 21/06 → 20/07)
    const mt = moisTravail(date);
    const key = `${mt.annee}-${mt.mois}`;
    if (!moisMap[key]) {
      const sY = mt.mois === 0 ? mt.annee - 1 : mt.annee;
      const sM = mt.mois === 0 ? 11 : mt.mois - 1;
      moisMap[key] = {
        mois: `${mt.annee}-${String(mt.mois + 1).padStart(2, '0')}`,
        debut: `${sY}-${String(sM + 1).padStart(2, '0')}-21`,
        fin: `${mt.annee}-${String(mt.mois + 1).padStart(2, '0')}-20`,
        legal_heures: 0, maladie_heures: 0, travaille_heures: 0, jours_legaux: 0, jours_presents: 0, jours: 0,
      };
    }
    const m = moisMap[key];
    m.jours++;
    if (legalHeures) {
      m.legal_heures += legalHeures;
      m.jours_legaux++;
      if (enMaladie) m.maladie_heures += legalHeures;
    }
    if (travaille > 0) m.jours_presents++;
    m.travaille_heures += travaille;
    d.setDate(d.getDate() + 1);
  }

  const parMois = Object.values(moisMap).map((m) => {
    const legalNette = Math.max(0, m.legal_heures - m.maladie_heures);
    return {
      ...m,
      legal_heures: arrondi(m.legal_heures),
      heures_maladie: arrondi(m.maladie_heures),
      legal_nette: arrondi(legalNette),
      travaille_heures: arrondi(m.travaille_heures),
      presence_pct: legalNette ? Math.round((m.travaille_heures / legalNette) * 1000) / 10 : null,
    };
  });

  const totLegalBrut = parMois.reduce((s, m) => s + m.legal_heures, 0);
  const totMaladieH = parMois.reduce((s, m) => s + m.heures_maladie, 0);
  const totLegal = Math.max(0, totLegalBrut - totMaladieH);
  const totTrav = parMois.reduce((s, m) => s + m.travaille_heures, 0);

  res.json({
    employe: db.prepare(
      'SELECT e.matricule, e.nom, e.prenom, c.libelle AS categorie FROM employes e JOIN categories c ON c.id = e.categorie_id WHERE e.id = ?'
    ).get(req.employe.id),
    periode: { debut: debutPar, fin: finPar },
    parJour,
    parMois,
    totaux: {
      legal_heures: arrondi(totLegal),
      legal_avant_maladie: arrondi(totLegalBrut),
      heures_maladie: arrondi(totMaladieH),
      travaille_heures: arrondi(totTrav),
      presence_pct: totLegal ? Math.round((totTrav / totLegal) * 1000) / 10 : null,
      jours_legaux: parMois.reduce((s, m) => s + m.jours_legaux, 0),
      jours_presents: parMois.reduce((s, m) => s + m.jours_presents, 0),
    },
  });
});

// POST /api/employes/:matricule/photo — upload → conversion webp + redimensionnement (300×300)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const PHOTOS_DIR = path.join(__dirname, '..', '..', 'data', 'photos');

router.post('/:matricule/photo', validerAccesMatricule, upload.single('photo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier photo fourni (champ "photo").' });
  try {
    if (!fs.existsSync(PHOTOS_DIR)) fs.mkdirSync(PHOTOS_DIR, { recursive: true });
    const nomFichier = `${req.params.matricule}.webp`;
    const dest = path.join(PHOTOS_DIR, nomFichier);
    await sharp(req.file.buffer)
      .resize(300, 300, { fit: 'cover' })
      .webp({ quality: 82 })
      .toFile(dest);
    db.prepare('UPDATE employes SET photo_url = ? WHERE id = ?').run(`/photos/${nomFichier}`, req.employe.id);
    res.json({ ok: true, photo_url: `/photos/${nomFichier}` });
  } catch (e) {
    res.status(400).json({ error: 'Conversion de l\'image impossible : ' + e.message });
  }
});

module.exports = router;
