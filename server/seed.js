const { db, insertMouvement } = require('./db');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

function seed() {
  // Le seed ne s'exécute qu'UNE SEULE fois (marqueur en base) : après une
  // « Réinitialisation » du super admin, les données ne repopulent pas au redémarrage.
  const fait = db.prepare("SELECT valeur FROM settings WHERE cle = 'seed_fait'").get();
  if (fait) return;

  // Compte Super Admin initial (créé si la table utilisateurs est vide) — mot de passe hashé, jamais en clair
  // Mot de passe : variable ADMIN_PASSWORD, sinon généré aléatoirement (affiché une seule fois dans la console).
  const usersCount = db.prepare('SELECT COUNT(*) AS n FROM utilisateurs').get().n;
  if (usersCount === 0) {
    const adminPassword = process.env.ADMIN_PASSWORD || crypto.randomBytes(12).toString('hex');
    db.prepare('INSERT INTO utilisateurs (login, password_hash, role) VALUES (?,?,?)')
      .run('Xmator', bcrypt.hashSync(adminPassword, 10), 'super_admin');
    console.log(`Compte Super Admin créé : Xmator — mot de passe : ${adminPassword} (définir ADMIN_PASSWORD pour le personnaliser)`);
  }

  const count = db.prepare('SELECT COUNT(*) AS n FROM employes').get().n;
  if (count === 0) {

  const insertCat = db.prepare('INSERT OR IGNORE INTO categories (libelle) VALUES (?)');
  const insertEmp = db.prepare('INSERT INTO employes (matricule, nom, prenom, categorie_id) VALUES (?,?,?,?)');

  const categories = [
    'Cadre administratif',
    'Agent de sécurité',
    'Employé de restauration',
    'Femme de ménage',
    'Agent manutentionnaire',
  ];
  const catIds = {};
  for (const c of categories) catIds[c] = insertCat.run(c).lastInsertRowid;

  const employes = [
    ['46', 'Tlili', 'Mohamed Aziz', 'Cadre administratif'],
    ['285', 'Zribi', 'Mohamed Ali', 'Agent de sécurité'],
    ['68', 'Saghroun', 'Naim', 'Employé de restauration'],
    ['292', 'Zahouani', 'Lasaad', 'Agent manutentionnaire'],
    ['245', 'Ben Brika', 'Afef', 'Femme de ménage'],
  ];

  const empIds = {};
  for (const [mat, nom, prenom, cat] of employes) {
    empIds[mat] = insertEmp.run(String(mat), nom, prenom, catIds[cat]).lastInsertRowid;
  }

  const add = (mat, type, date, jours, motif, soldeType) => {
    const id = empIds[mat];
    insertMouvement({ employe_id: id, type_operation: type, date_operation: date, jours, motif, solde_type: soldeType });
  };

  const initiaux = { '46': 30, '285': 30, '68': 30, '292': 30, '245': 30 };
  for (const [mat, j] of Object.entries(initiaux)) add(mat, 'solde_initial', '2026-01-05', j, 'Solde initial année 2026');

  // Droit maladie annuel : 20 jours payés pour chaque employé (solde séparé du solde congé)
  for (const mat of Object.keys(empIds)) add(mat, 'solde_initial', '2026-01-05', 20, 'Droit maladie annuel (20 jours)', 'maladie');

  add('285', 'ajout_annuel', '2026-01-10', 5, 'Complément de crédit annuel');

  add('46', 'prelevement', '2026-03-10', 5, 'Congé annuel mars');
  add('46', 'prelevement', '2026-07-20', 10, 'Vacances d\'été');
  add('285', 'prelevement', '2026-02-02', 7, 'Congé annuel');
  add('285', 'prelevement', '2026-06-15', 12, 'Vacances');
  add('68', 'prelevement', '2026-04-05', 3, 'Congé personnel');
  add('68', 'prelevement', '2026-08-01', 8, 'Vacances d\'été');
  add('292', 'prelevement', '2026-05-10', 4, 'Congé annuel');
  add('245', 'prelevement', '2026-03-20', 6, 'Congé annuel');

    console.log('Base de données initialisée avec les données de démonstration (5 employés).');
  }

  db.prepare("INSERT OR REPLACE INTO settings (cle, valeur) VALUES ('seed_fait', '1')").run();
}

module.exports = seed;
