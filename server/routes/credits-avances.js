const { Router } = require('express');
const { db } = require('../db');

const router = Router();

// ---------------------------------------------------------------------------
// Utilitaires de calcul des crédits / avances
// ---------------------------------------------------------------------------
const arrondi = (n, dec = 3) => {
  const p = 10 ** dec;
  return Math.round((Number(n) || 0) * p) / p;
};

// Échéancier prévisionnel :
//   Intérêts = Capital × Taux_annuel% × (Durée_mois / 12)     (intérêts simples)
//   Total à retenir = Capital + Intérêts + Frais de dossier
//   Mensualité = Total à retenir / Durée_mois                 (échéance constante)
// La dernière échéance absorbe l'arrondi pour que la somme des échéances
// soit exactement égale au total à retenir.
function calculerPlan({ capital, tauxInteretAnnuel, fraisDossier, dureeMois, differeMois = 0, dateDebut }) {
  const c = Math.max(0, Number(capital) || 0);
  const taux = Math.max(0, Number(tauxInteretAnnuel) || 0);
  const frais = Math.max(0, Number(fraisDossier) || 0);
  const d = Math.max(1, Math.floor(Number(dureeMois) || 1));
  const diff = Math.max(0, Math.floor(Number(differeMois) || 0));
  const interets = arrondi(c * (taux / 100) * (d / 12));
  const total = arrondi(c + interets + frais);
  const mensualite = arrondi(total / d);
  const [ay, am] = String(dateDebut || '').split('-').map((x) => Number(x) || 0);
  let anc = ay || new Date().getFullYear();
  let amc = am || new Date().getMonth() + 1;
  for (let k = 0; k < diff; k++) { amc += 1; if (amc > 12) { amc = 1; anc += 1; } }
  const echeances = [];
  let reste = total;
  for (let k = 1; k <= d; k++) {
    const montant = k === d ? arrondi(reste) : mensualite;
    reste = arrondi(reste - montant);
    echeances.push({ num: k, annee: anc, mois: amc, montant });
    amc += 1;
    if (amc > 12) { amc = 1; anc += 1; }
  }
  return { interets, total, mensualite, echeances };
}

// Salaire de référence employeur = base + indemnités (transport / présence / fonction).
function salaireReferencePour(e) {
  const vals = [e && e.salaire_base, e && e.indemnite_presence, e && e.indemnite_transport, e && e.indemnite_fonction];
  return arrondi(vals.reduce((s, v) => s + (Number(v) || 0), 0));
}

// Vue détaillée d'un contrat : CRD, cumul remboursé et échéancier.
function detailContrat(c, avecEcheances = true) {
  const echs = db.prepare(`
    SELECT id, num, annee, mois, montant, statut, date_paiement
    FROM credits_echeances WHERE credit_id = ? ORDER BY num ASC
  `).all(c.id);
  const payes = echs.filter((e) => e.statut === 'paye');
  const totalRetenu = Number(c.total_retenu) || 0;
  const cumul = arrondi(payes.reduce((s, e) => s + (Number(e.montant) || 0), 0));
  const crd = arrondi(totalRetenu - cumul, 2);
  return {
    id: c.id,
    employe_id: c.employe_id,
    type_id: c.type_id,
    nom_type: c.nom_type,
    code_paie: c.code_paie,
    montant_actuel: arrondi(c.montant_actuel, 2),
    frais_dossier: arrondi(c.frais_dossier, 2),
    taux_interet_annuel: Number(c.taux_interet_annuel) || 0,
    duree_mois: c.duree_mois,
    differe_mois: c.differe_mois,
    mensualite: arrondi(c.mensualite, 2),
    total_retenu: arrondi(totalRetenu, 2),
    taux_endettement: c.taux_endettement != null ? arrondi(c.taux_endettement, 2) : null,
    salaire_reference: c.salaire_reference != null ? arrondi(c.salaire_reference, 2) : null,
    date_octroi: c.date_octroi,
    date_debut_retenue: c.date_debut_retenue,
    statut: c.statut,
    motif: c.motif || null,
    justificatifs: c.justificatifs ? JSON.parse(c.justificatifs) : null,
    cumul_rembourse: cumul,
    crd,
    echeances_restantes: echs.filter((e) => e.statut === 'prevu').length,
    nb_echeances: echs.length,
    nb_payees: payes.length,
    ...(avecEcheances
      ? { echeances: echs.map((e) => ({
          id: e.id, num: e.num, annee: e.annee, mois: e.mois,
          montant: arrondi(e.montant, 2), statut: e.statut, date_paiement: e.date_paiement,
        })) }
      : {}),
  };
}

// Recalcule le statut d'un contrat après une opération sur une échéance :
// toutes ses mensualités prélevées → « solde » (la retenue disparaît du bulletin).
function recalculerStatutContrat(creditId) {
  const c = db.prepare('SELECT id FROM credits_employe WHERE id = ?').get(creditId);
  if (!c) return;
  const prevues = db.prepare('SELECT COUNT(*) AS n FROM credits_echeances WHERE credit_id = ? AND statut = ?').get(creditId, 'prevu');
  if ((Number(prevues.n) || 0) === 0) {
    db.prepare(`UPDATE credits_employe SET statut = 'solde', updated_at = datetime('now','localtime') WHERE id = ?`).run(creditId);
  } else {
    const actuel = db.prepare('SELECT statut FROM credits_employe WHERE id = ?').get(creditId);
    if (actuel && actuel.statut === 'solde') {
      db.prepare(`UPDATE credits_employe SET statut = 'en_cours', updated_at = datetime('now','localtime') WHERE id = ?`).run(creditId);
    }
  }
}

const BASE_CONTRAT = `
  SELECT c.*, t.nom AS nom_type, t.code_paie
  FROM credits_employe c
  JOIN credits_types t ON t.id = c.type_id
`;

function trouverEmployeParMatricule(matricule) {
  const mat = String(matricule || '').trim();
  if (!mat) return null;
  return db.prepare(`
    SELECT id, matricule, nom, prenom, salaire_base, indemnite_presence, indemnite_transport, indemnite_fonction, actif
    FROM employes WHERE matricule = ? OR CAST(matricule AS INTEGER) = CAST(? AS INTEGER)
  `).get(mat, mat) || null;
}

function champsDuType(typeId) {
  return db.prepare('SELECT * FROM credits_champs WHERE type_id = ? ORDER BY ordre ASC, id ASC').all(typeId);
}

// ---------------------------------------------------------------------------
// Référentiel : types de crédit (+ champs personnalisés)
// ---------------------------------------------------------------------------
router.get('/types', (req, res) => {
  const types = db.prepare('SELECT * FROM credits_types ORDER BY id ASC').all();
  const parType = {};
  for (const ch of db.prepare('SELECT * FROM credits_champs ORDER BY type_id ASC, ordre ASC, id ASC').all()) {
    (parType[ch.type_id] = parType[ch.type_id] || []).push({
      id: ch.id, nom: ch.nom, type_champ: ch.type_champ,
      obligatoire: !!ch.obligatoire, ordre: ch.ordre,
    });
  }
  res.json({ types: types.map((t) => ({
    id: t.id,
    nom: t.nom,
    code_paie: t.code_paie,
    plafond_montant: t.plafond_montant != null ? arrondi(t.plafond_montant, 2) : null,
    plafond_mode: t.plafond_mode,
    duree_min: t.duree_min,
    duree_max: t.duree_max,
    taux_interet_annuel: Number(t.taux_interet_annuel) || 0,
    frais_dossier: arrondi(t.frais_dossier, 2),
    taux_endettement_max: Number(t.taux_endettement_max) || 0,
    differe_max: t.differe_max,
    pause_mensualite: !!t.pause_mensualite,
    stc_auto: !!t.stc_auto,
    actif: !!t.actif,
    champs: parType[t.id] || [],
  })) });
});

function validerType(body, typeCourant = null) {
  const nom = String(body.nom || '').trim();
  const codePaie = String(body.code_paie || '').trim();
  if (!nom) return 'Le nom du type de crédit est obligatoire.';
  if (!codePaie) return 'Le code de rubrique paie est obligatoire.';
  if (!/^\d+$/.test(codePaie)) return 'Le code de rubrique paie doit être numérique (ex. 5301).';
  const ok = codePaie === typeCourant?.code_paie ? false : db.prepare('SELECT id FROM credits_types WHERE code_paie = ?').get(codePaie);
  if (ok) return `Un type de crédit utilise déjà le code paie « ${codePaie} ».`;
  const dmin = Math.max(1, Math.floor(Number(body.duree_min) || 1));
  const dmax = Math.min(60, Math.max(dmin, Math.floor(Number(body.duree_max) || 36)));
  const diffMax = Math.max(0, Math.floor(Number(body.differe_max) || 0));
  if (diffMax > 3) return 'Le différé maximum autorisé est de 3 mois.';
  return {
    nom,
    code_paie: codePaie,
    plafond_montant: body.plafond_montant === '' || body.plafond_montant == null ? null : arrondi(body.plafond_montant),
    plafond_mode: body.plafond_mode === 'multiple_salaire' ? 'multiple_salaire' : 'dt',
    duree_min: dmin,
    duree_max: dmax,
    taux_interet_annuel: arrondi(body.taux_interet_annuel, 4),
    frais_dossier: arrondi(body.frais_dossier),
    taux_endettement_max: Number(body.taux_endettement_max) > 0 ? arrondi(body.taux_endettement_max) : 30,
    differe_max: diffMax,
    pause_mensualite: body.pause_mensualite ? 1 : 0,
    stc_auto: body.stc_auto ? 1 : 0,
    actif: body.actif !== undefined ? (body.actif ? 1 : 0) : 1,
  };
}

router.post('/types', (req, res) => {
  const v = validerType(req.body || {});
  if (typeof v === 'string') return res.status(400).json({ error: v });
  const r = db.prepare(`
    INSERT INTO credits_types (nom, code_paie, plafond_montant, plafond_mode, duree_min, duree_max,
      taux_interet_annuel, frais_dossier, taux_endettement_max, differe_max, pause_mensualite, stc_auto, actif)
    VALUES (@nom, @code_paie, @plafond_montant, @plafond_mode, @duree_min, @duree_max,
      @taux_interet_annuel, @frais_dossier, @taux_endettement_max, @differe_max, @pause_mensualite, @stc_auto, @actif)
  `).run(v);
  const typeId = r.lastInsertRowid;
  const champs = sauverChamps(typeId, req.body?.champs || []);
  res.status(201).json({ id: typeId, ...v, champs });
});

router.put('/types/:id', (req, res) => {
  const t = db.prepare('SELECT * FROM credits_types WHERE id = ?').get(Number(req.params.id));
  if (!t) return res.status(404).json({ error: 'Type de crédit introuvable.' });
  const v = validerType({ ...t, ...(req.body || {}) }, t);
  if (typeof v === 'string') return res.status(400).json({ error: v });
  db.prepare(`
    UPDATE credits_types SET nom = @nom, code_paie = @code_paie, plafond_montant = @plafond_montant,
      plafond_mode = @plafond_mode, duree_min = @duree_min, duree_max = @duree_max,
      taux_interet_annuel = @taux_interet_annuel, frais_dossier = @frais_dossier,
      taux_endettement_max = @taux_endettement_max, differe_max = @differe_max,
      pause_mensualite = @pause_mensualite, stc_auto = @stc_auto, actif = @actif,
      updated_at = datetime('now','localtime')
    WHERE id = @id
  `).run({ ...v, id: t.id });
  const champs = sauverChamps(t.id, req.body?.champs);
  res.json({ id: t.id, ...v, champs });
});

// Synchronise les champs personnalisés d'un type : mise à jour des champs existants,
// ajout des nouveaux (id nul), suppression de ceux absents de la liste envoyée.
// En création (liste fournie) les champs sont insérés dans l'ordre ; un PUT sans liste
// (undefined) ne modifie rien.
function formatChamp(c) {
  return { id: c.id, nom: c.nom, type_champ: c.type_champ, obligatoire: !!c.obligatoire, ordre: c.ordre };
}

function sauverChamps(typeId, liste) {
  const actuelle = champsDuType(typeId);
  if (liste === undefined) return actuelle.map(formatChamp);
  const cibles = (Array.isArray(liste) ? liste : [])
    .filter((c) => String(c.nom || '').trim())
    .map((c, i) => ({
      id: c.id ? Number(c.id) : null,
      nom: String(c.nom).trim(),
      type_champ: ['texte', 'nombre', 'booleen', 'fichier'].includes(c.type || c.type_champ) ? (c.type || c.type_champ) : 'texte',
      obligatoire: c.obligatoire ? 1 : 0,
      ordre: i + 1,
    }));
  const idsCibles = new Set(cibles.map((c) => c.id).filter(Boolean));
  const tx = db.transaction(() => {
    const upd = db.prepare('UPDATE credits_champs SET nom = ?, type_champ = ?, obligatoire = ?, ordre = ? WHERE id = ? AND type_id = ?');
    const ins = db.prepare('INSERT INTO credits_champs (type_id, nom, type_champ, obligatoire, ordre) VALUES (?, ?, ?, ?, ?)');
    for (const c of cibles) {
      if (c.id) upd.run(c.nom, c.type_champ, c.obligatoire, c.ordre, c.id, typeId);
      else ins.run(typeId, c.nom, c.type_champ, c.obligatoire, c.ordre);
    }
    for (const e of actuelle) {
      if (!idsCibles.has(e.id)) db.prepare('DELETE FROM credits_champs WHERE id = ?').run(e.id);
    }
  });
  tx();
  return champsDuType(typeId).map(formatChamp);
}

router.delete('/types/:id', (req, res) => {
  const t = db.prepare('SELECT * FROM credits_types WHERE id = ?').get(Number(req.params.id));
  if (!t) return res.status(404).json({ error: 'Type de crédit introuvable.' });
  const use = db.prepare('SELECT COUNT(*) AS n FROM credits_employe WHERE type_id = ?').get(t.id);
  if ((Number(use.n) || 0) > 0) {
    return res.status(409).json({ error: `Impossible de supprimer ce type : ${use.n} crédit(s) lui sont déjà rattachés.` });
  }
  db.prepare('DELETE FROM credits_champs WHERE type_id = ?').run(t.id);
  db.prepare('DELETE FROM credits_types WHERE id = ?').run(t.id);
  res.json({ ok: true });
});

// Champs personnalisés (Texte / Nombre / Booléen / Fichier)
router.post('/champs', (req, res) => {
  const typeId = Number(req.body?.type_id);
  const nom = String(req.body?.nom || '').trim();
  const typeChamp = ['texte', 'nombre', 'booleen', 'fichier'].includes(req.body?.type_champ) ? req.body.type_champ : 'texte';
  if (!typeId) return res.status(400).json({ error: 'Type de crédit manquant.' });
  if (!db.prepare('SELECT id FROM credits_types WHERE id = ?').get(typeId)) {
    return res.status(404).json({ error: 'Type de crédit introuvable.' });
  }
  if (!nom) return res.status(400).json({ error: 'Le libellé du champ est obligatoire.' });
  const maxOrdre = db.prepare('SELECT COALESCE(MAX(ordre), 0) AS o FROM credits_champs WHERE type_id = ?').get(typeId);
  const r = db.prepare(`
    INSERT INTO credits_champs (type_id, nom, type_champ, obligatoire, ordre)
    VALUES (?, ?, ?, ?, ?)
  `).run(typeId, nom, typeChamp, req.body.obligatoire ? 1 : 0, (Number(maxOrdre.o) || 0) + 1);
  res.status(201).json({ id: r.lastInsertRowid, type_id: typeId, nom, type_champ: typeChamp, obligatoire: !!req.body.obligatoire });
});

router.put('/champs/:id', (req, res) => {
  const ch = db.prepare('SELECT * FROM credits_champs WHERE id = ?').get(Number(req.params.id));
  if (!ch) return res.status(404).json({ error: 'Champ personnalisé introuvable.' });
  const nom = String(req.body?.nom ?? (ch.nom || '')).trim();
  if (!nom) return res.status(400).json({ error: 'Le libellé du champ est obligatoire.' });
  const typeChamp = ['texte', 'nombre', 'booleen', 'fichier'].includes(req.body?.type_champ) ? req.body.type_champ : ch.type_champ;
  db.prepare('UPDATE credits_champs SET nom = ?, type_champ = ?, obligatoire = ?, ordre = ? WHERE id = ?')
    .run(
      nom,
      typeChamp,
      req.body.obligatoire !== undefined ? (req.body.obligatoire ? 1 : 0) : ch.obligatoire,
      req.body.ordre != null ? Number(req.body.ordre) : ch.ordre,
      ch.id,
    );
  res.json({ ok: true });
});

router.delete('/champs/:id', (req, res) => {
  const ch = db.prepare('SELECT * FROM credits_champs WHERE id = ?').get(Number(req.params.id));
  if (!ch) return res.status(404).json({ error: 'Champ personnalisé introuvable.' });
  db.prepare('DELETE FROM credits_champs WHERE id = ?').run(ch.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Employés éligibles (pour l'octroi d'un crédit)
// ---------------------------------------------------------------------------
router.get('/employes', (req, res) => {
  const rows = db.prepare(`
    SELECT e.id, e.matricule, e.nom, e.prenom, e.actif, e.intitule_poste, e.departement,
           e.salaire_base, e.indemnite_presence, e.indemnite_transport, e.indemnite_fonction
    FROM employes e WHERE e.actif = 1
    ORDER BY e.matricule ASC
  `).all();
  const agg = db.prepare(`
    SELECT c.employe_id,
           COUNT(CASE WHEN c.statut = 'en_cours' THEN 1 END) AS creds_actifs,
           SUM(CASE WHEN c.statut = 'en_cours'
               THEN (SELECT COALESCE(SUM(e.montant), 0) FROM credits_echeances e
                     WHERE e.credit_id = c.id AND e.statut = 'prevu') ELSE 0 END) AS crd_total
    FROM credits_employe c GROUP BY c.employe_id
  `).all();
  const parEmp = {};
  for (const a of agg) parEmp[a.employe_id] = { creds_actifs: Number(a.creds_actifs) || 0, crd_total: arrondi(Number(a.crd_total) || 0, 2) };
  res.json({ employes: rows.map((e) => ({
    id: e.id,
    matricule: String(e.matricule),
    nom: e.nom,
    prenom: e.prenom,
    actif: !!e.actif,
    intitule_poste: e.intitule_poste || null,
    departement: e.departement || null,
    salaire_reference: salaireReferencePour(e),
    ...(parEmp[e.id] || { creds_actifs: 0, crd_total: 0 }),
  })) });
});

// ---------------------------------------------------------------------------
// Contrats (crédits octroyés) & échéancier
// ---------------------------------------------------------------------------
router.get('/contrats', (req, res) => {
  const { employe_id, statut } = req.query;
  const conds = [];
  const args = {};
  if (employe_id) { conds.push('c.employe_id = @employe_id'); args.employe_id = Number(employe_id); }
  if (statut && ['en_cours', 'solde', 'annule'].includes(statut)) { conds.push('c.statut = @statut'); args.statut = statut; }
  const rows = db.prepare(`${BASE_CONTRAT}${conds.length ? ' WHERE ' + conds.join(' AND ') : ''} ORDER BY c.id DESC`).all(args);
  res.json({ contrats: rows.map((c) => detailContrat(c)) });
});

// Octroi d'un crédit / avance : crée le contrat et son échéancier prévisionnel.
router.post('/contrats', (req, res) => {
  const b = req.body || {};
  const employe = b.employe_id
    ? db.prepare('SELECT * FROM employes WHERE id = ?').get(Number(b.employe_id))
    : trouverEmployeParMatricule(b.matricule);
  if (!employe) return res.status(404).json({ error: 'Employé introuvable.' });
  if (!employe.actif) return res.status(400).json({ error: "Impossible d'octroyer un crédit à un employé inactif." });

  const type = db.prepare('SELECT * FROM credits_types WHERE id = ?').get(Number(b.type_id));
  if (!type) return res.status(404).json({ error: 'Type de crédit introuvable.' });
  if (!type.actif) return res.status(400).json({ error: 'Ce type de crédit est désactivé.' });

  const capital = Number(b.montant_actuel);
  if (!Number.isFinite(capital) || capital <= 0) return res.status(400).json({ error: 'Montant du crédit invalide.' });
  const salaireRef = arrondi(b.salaire_reference != null ? b.salaire_reference : salaireReferencePour(employe));
  if (b.salaire_reference != null) {
    const nr = Number(b.salaire_reference);
    if (!Number.isFinite(nr) || nr < 0) return res.status(400).json({ error: 'Salaire de référence invalide.' });
  }

  if (type.plafond_mode === 'multiple_salaire' && type.plafond_montant != null) {
    const plafond = arrondi(Number(type.plafond_montant) * salaireRef);
    if (capital > plafond) {
      return res.status(400).json({ error: `Ce type plafonne le crédit à ${type.plafond_montant} × le salaire de référence (${plafond.toLocaleString('fr-FR')} DT).` });
    }
  } else if (type.plafond_montant != null && capital > type.plafond_montant) {
    return res.status(400).json({ error: `Le montant dépasse le plafond de ${type.plafond_montant.toLocaleString('fr-FR')} DT de ce type.` });
  }

  const duree = Math.floor(Number(b.duree_mois) || 0);
  if (duree < type.duree_min || duree > type.duree_max) {
    return res.status(400).json({ error: `La durée doit être comprise entre ${type.duree_min} et ${type.duree_max} mois.` });
  }
  const differe = Math.max(0, Math.floor(Number(b.differe_mois) || 0));
  if (differe > type.differe_max) {
    return res.status(400).json({ error: `Le différé maximum de ce type est de ${type.differe_max} mois.` });
  }

  const dateDebut = String(b.date_debut_retenue || '');
  if (!/^\d{4}-\d{2}$/.test(dateDebut)) return res.status(400).json({ error: 'Mois de début de retenue invalide (format AAAA-MM).' });

  const taux = b.taux_interet_annuel != null ? Number(b.taux_interet_annuel) : type.taux_interet_annuel;
  const frais = b.frais_dossier != null ? Number(b.frais_dossier) : type.frais_dossier;
  const plan = calculerPlan({ capital, tauxInteretAnnuel: taux, fraisDossier: frais, dureeMois: duree, differeMois: differe, dateDebut });
  const tauxEndettement = salaireRef > 0 ? arrondi((plan.mensualite / salaireRef) * 100, 2) : null;

  // Champs personnalisés obligatoires (justificatifs / garanties / organismes prêteurs…)
  const justifs = {};
  for (const ch of champsDuType(type.id)) {
    const v = b.justificatifs && b.justificatifs[String(ch.id)] !== undefined
      ? b.justificatifs[String(ch.id)]
      : b.justificatifs?.[ch.nom];
    if ((ch.obligatoire) && (v === undefined || v === null || v === '' || v === false)) {
      return res.status(400).json({ error: `Le champ « ${ch.nom} » est obligatoire.` });
    }
    if (v !== undefined && v !== null && v !== '') justifs[String(ch.id)] = v;
  }

  const dateOctroi = String(b.date_octroi || '').slice(0, 10) || new Date().toISOString().slice(0, 10);

  const tx = db.transaction(() => {
    const r = db.prepare(`
      INSERT INTO credits_employe (employe_id, type_id, montant_actuel, frais_dossier, taux_interet_annuel,
        duree_mois, differe_mois, mensualite, total_retenu, taux_endettement, salaire_reference,
        date_octroi, date_debut_retenue, statut, motif, justificatifs, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'en_cours', ?, ?, ?)
    `).run(
      employe.id,
      type.id,
      arrondi(capital, 2),
      arrondi(frais, 2),
      arrondi(taux, 4),
      duree,
      differe,
      arrondi(plan.mensualite, 2),
      arrondi(plan.total, 2),
      tauxEndettement,
      salaireRef,
      dateOctroi,
      dateDebut,
      String(b.motif || '').trim() || null,
      Object.keys(justifs).length ? JSON.stringify(justifs) : null,
      req.user?.id || null,
    );
    const creditId = r.lastInsertRowid;
    const insEch = db.prepare('INSERT INTO credits_echeances (credit_id, num, annee, mois, montant) VALUES (?, ?, ?, ?, ?)');
    for (const e of plan.echeances) insEch.run(creditId, e.num, e.annee, e.mois, arrondi(e.montant, 2));
    return creditId;
  });

  const creditId = tx();
  const c = db.prepare(`${BASE_CONTRAT} WHERE c.id = ?`).get(creditId);
  const alerteEndettement = tauxEndettement != null && tauxEndettement > Number(type.taux_endettement_max);
  res.status(201).json({ ...detailContrat(c), ...(alerteEndettement ? { alerte_endettement: true } : {}) });
});

router.delete('/contrats/:id', (req, res) => {
  const c = db.prepare('SELECT * FROM credits_employe WHERE id = ?').get(Number(req.params.id));
  if (!c) return res.status(404).json({ error: 'Crédit introuvable.' });
  const payees = db.prepare('SELECT COUNT(*) AS n FROM credits_echeances WHERE credit_id = ? AND statut = ?').get(c.id, 'paye');
  if ((Number(payees.n) || 0) > 0) {
    return res.status(409).json({ error: 'Impossible de supprimer ce crédit : des mensualités ont déjà été prélevées. Annulez-le plutôt.' });
  }
  db.prepare('DELETE FROM credits_echeances WHERE credit_id = ?').run(c.id);
  db.prepare('DELETE FROM credits_employe WHERE id = ?').run(c.id);
  res.json({ ok: true });
});

// Marquer une mensualité comme prélevée (après clôture / paie) → décrémente le CRD.
router.post('/contrats/:id/echeances/:eid/payer', (req, res) => {
  const c = db.prepare('SELECT * FROM credits_employe WHERE id = ?').get(Number(req.params.id));
  if (!c) return res.status(404).json({ error: 'Crédit introuvable.' });
  const e = db.prepare('SELECT * FROM credits_echeances WHERE id = ? AND credit_id = ?').get(Number(req.params.eid), c.id);
  if (!e) return res.status(404).json({ error: 'Échéance introuvable.' });
  if (e.statut === 'paye') return res.status(400).json({ error: 'Cette mensualité est déjà prélevée.' });
  db.prepare("UPDATE credits_echeances SET statut = 'paye', date_paiement = date('now','localtime') WHERE id = ?").run(e.id);
  recalculerStatutContrat(c.id);
  res.json(detailContrat(db.prepare(`${BASE_CONTRAT} WHERE c.id = ?`).get(c.id)));
});

// Correction : annuler le prélèvement d'une mensualité.
router.post('/contrats/:id/echeances/:eid/depayer', (req, res) => {
  const c = db.prepare('SELECT * FROM credits_employe WHERE id = ?').get(Number(req.params.id));
  if (!c) return res.status(404).json({ error: 'Crédit introuvable.' });
  const e = db.prepare('SELECT * FROM credits_echeances WHERE id = ? AND credit_id = ?').get(Number(req.params.eid), c.id);
  if (!e) return res.status(404).json({ error: 'Échéance introuvable.' });
  if (e.statut !== 'paye') return res.status(400).json({ error: "Cette mensualité n'est pas prélevée." });
  db.prepare("UPDATE credits_echeances SET statut = 'prevu', date_paiement = NULL WHERE id = ?").run(e.id);
  recalculerStatutContrat(c.id);
  res.json(detailContrat(db.prepare(`${BASE_CONTRAT} WHERE c.id = ?`).get(c.id)));
});

// Annuler un crédit : les échéances restantes (non prélevées) sont supprimées.
router.post('/contrats/:id/annuler', (req, res) => {
  const c = db.prepare('SELECT * FROM credits_employe WHERE id = ?').get(Number(req.params.id));
  if (!c) return res.status(404).json({ error: 'Crédit introuvable.' });
  if (c.statut === 'annule') return res.status(400).json({ error: 'Ce crédit est déjà annulé.' });
  if (c.statut === 'solde') return res.status(400).json({ error: 'Ce crédit est soldé, aucune annulation possible.' });
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM credits_echeances WHERE credit_id = ? AND statut = 'prevu'").run(c.id);
    db.prepare(`UPDATE credits_employe SET statut = 'annule', updated_at = datetime('now','localtime') WHERE id = ?`).run(c.id);
  });
  tx();
  res.json(detailContrat(db.prepare(`${BASE_CONTRAT} WHERE c.id = ?`).get(c.id)));
});

// Retenues de crédit injectées dans le bulletin de paie d'un employé pour un mois :
// contrat « en_cours » dont une mensualité « prevue » tombe le mois demandé.
// (Ligne auto « À déduire » code 5301… ; elle disparaît dès que le CRD = 0.)
router.get('/prets', (req, res) => {
  const { matricule, annee, mois } = req.query;
  if (!matricule) return res.json({ prets: [] });
  const employe = trouverEmployeParMatricule(matricule);
  if (!employe) return res.json({ prets: [] });
  const y = Number(annee) || new Date().getFullYear();
  const m = Number(mois) || new Date().getMonth() + 1;
  const rows = db.prepare(`
    SELECT e.id AS echeance_id, t.code_paie, t.nom AS libelle, e.montant
    FROM credits_echeances e
    JOIN credits_employe c ON c.id = e.credit_id
    JOIN credits_types t ON t.id = c.type_id
    WHERE c.employe_id = ? AND c.statut = 'en_cours' AND e.annee = ? AND e.mois = ?
      AND e.statut = 'prevu'
    ORDER BY e.num ASC
  `).all(employe.id, y, m);
  res.json({
    prets: rows.map((r) => ({
      echeance_id: r.echeance_id,
      code_paie: String(r.code_paie),
      libelle: r.libelle,
      montant: arrondi(r.montant, 2),
    })),
  });
});

module.exports = router;