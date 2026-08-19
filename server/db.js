const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'amicale.db');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  libelle    TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS employes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  matricule    TEXT NOT NULL UNIQUE,
  nom          TEXT NOT NULL,
  prenom       TEXT NOT NULL,
  categorie_id INTEGER NOT NULL REFERENCES categories(id),
  actif        INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS mouvements (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  employe_id     INTEGER NOT NULL REFERENCES employes(id),
  type_operation TEXT NOT NULL CHECK (type_operation IN
                  ('solde_initial','ajout_annuel','prelevement','maladie','absence')),
  date_operation TEXT NOT NULL,
  jours          REAL NOT NULL CHECK (jours > 0),
  motif          TEXT,
  solde_apres    REAL NOT NULL,
  solde_type     TEXT NOT NULL DEFAULT 'conge'
                 CHECK (solde_type IN ('conge','maladie')),
  created_at     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_mouvements_employe ON mouvements(employe_id);
CREATE INDEX IF NOT EXISTS idx_mouvements_date   ON mouvements(date_operation);

CREATE TABLE IF NOT EXISTS demandes_conge (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  numero_sequentiel  INTEGER NOT NULL UNIQUE,
  employe_id         INTEGER NOT NULL REFERENCES employes(id),
  matricule          TEXT NOT NULL,
  nom_prenom         TEXT NOT NULL,
  direction          TEXT NOT NULL DEFAULT 'Amicale',
  nature_conge       TEXT NOT NULL CHECK (nature_conge IN ('legal','exceptionnel')),
  date_demande       TEXT NOT NULL,
  date_debut         TEXT NOT NULL,
  date_fin           TEXT NOT NULL,
  nombre_jours       REAL NOT NULL CHECK (nombre_jours > 0),
  solde_a_la_demande REAL NOT NULL,
  statut             TEXT NOT NULL DEFAULT 'en_instance'
                     CHECK (statut IN ('en_instance','acceptee','rejetee')),
  date_decision      TEXT,
  motif_rejet        TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_demandes_statut    ON demandes_conge(statut);
CREATE INDEX IF NOT EXISTS idx_demandes_employe   ON demandes_conge(employe_id);
CREATE INDEX IF NOT EXISTS idx_demandes_sequence  ON demandes_conge(numero_sequentiel);

CREATE TABLE IF NOT EXISTS arrets_maladie (
  id                         INTEGER PRIMARY KEY AUTOINCREMENT,
  numero_sequentiel          INTEGER NOT NULL UNIQUE,
  employe_id                 INTEGER NOT NULL REFERENCES employes(id),
  matricule                  TEXT NOT NULL,
  nom_prenom                 TEXT NOT NULL,
  categorie                  TEXT NOT NULL,
  numero_bulletin            TEXT NOT NULL,
  certificat                 TEXT,
  date_debut                 TEXT NOT NULL,
  date_fin                   TEXT NOT NULL,
  nombre_jours               REAL NOT NULL CHECK (nombre_jours > 0),
  solde_maladie_a_la_demande REAL NOT NULL,
  statut                     TEXT NOT NULL DEFAULT 'en_instance'
                             CHECK (statut IN ('en_instance','valide','rejete')),
  date_decision              TEXT,
  motif_rejet                TEXT,
  created_at                 TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_arrets_statut   ON arrets_maladie(statut);
CREATE INDEX IF NOT EXISTS idx_arrets_employe  ON arrets_maladie(employe_id);
CREATE INDEX IF NOT EXISTS idx_arrets_sequence ON arrets_maladie(numero_sequentiel);

CREATE TABLE IF NOT EXISTS utilisateurs (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  login             TEXT NOT NULL UNIQUE,
  password_hash     TEXT NOT NULL,
  role              TEXT NOT NULL CHECK (role IN ('super_admin','consultation','moderateur','employe')),
  employe_id        INTEGER REFERENCES employes(id),
  actif             INTEGER NOT NULL DEFAULT 1,
  date_creation     TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  derniere_connexion TEXT,
  permissions       TEXT
);

CREATE INDEX IF NOT EXISTS idx_utilisateurs_employe ON utilisateurs(employe_id);

CREATE TABLE IF NOT EXISTS settings (
  cle    TEXT PRIMARY KEY,
  valeur TEXT
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  utilisateur_id INTEGER REFERENCES utilisateurs(id),
  login          TEXT NOT NULL,
  role           TEXT,
  action         TEXT NOT NULL CHECK (action IN ('login','logout','lire','ajouter','modifier','supprimer','echec_login')),
  module         TEXT,
  detail         TEXT,
  statut         INTEGER,
  ip             TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_audit_login    ON audit_logs(login);
CREATE INDEX IF NOT EXISTS idx_audit_created  ON audit_logs(created_at);

CREATE TABLE IF NOT EXISTS horaires_travail (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  employe_id     INTEGER NOT NULL REFERENCES employes(id),
  date           TEXT NOT NULL,
  debut          TEXT,
  fin            TEXT,
  duree_secondes INTEGER NOT NULL DEFAULT 0,
  heures         TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_horaires_emp_date ON horaires_travail(employe_id, date);

-- Badges du journal « Horaires de travail » : même norme d'import que les pointages (Matricule+Horodatage).
-- La durée quotidienne = dernier badgeage − premier badgeage de la journée (recalculée à chaque import).
CREATE TABLE IF NOT EXISTS horaires_pointages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  employe_id  INTEGER NOT NULL REFERENCES employes(id),
  matricule   TEXT NOT NULL,
  horodatage  TEXT NOT NULL,
  date        TEXT NOT NULL,
  source      TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_horaires_pts_ts ON horaires_pointages(employe_id, horodatage);
CREATE INDEX IF NOT EXISTS idx_horaires_pts_date ON horaires_pointages(employe_id, date);

CREATE TABLE IF NOT EXISTS config_annees (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  annee           INTEGER NOT NULL UNIQUE,
  heures_normales REAL NOT NULL DEFAULT 8,
  heures_reduites REAL NOT NULL DEFAULT 6,
  ramadan_debut   TEXT,
  ramadan_fin     TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS jours_feries (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  annee      INTEGER NOT NULL,
  nom        TEXT NOT NULL,
  date       TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'nationale' CHECK (type IN ('nationale','religieuse')),
  heures     REAL NOT NULL DEFAULT 0,
  automatique INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (annee, date)
);

CREATE TABLE IF NOT EXISTS jours_travail (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  annee      INTEGER NOT NULL,
  date       TEXT NOT NULL,
  heures     REAL NOT NULL DEFAULT 0,
  source     TEXT NOT NULL DEFAULT 'normal'
             CHECK (source IN ('normal','ete','ramadan','weekend','ferie','manuel')),
  label      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (annee, date)
);

CREATE TABLE IF NOT EXISTS pointages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  employe_id  INTEGER NOT NULL REFERENCES employes(id),
  matricule   TEXT NOT NULL,
  horodatage  TEXT NOT NULL,
  date        TEXT NOT NULL,
  source      TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pointages_emp_ts ON pointages(employe_id, horodatage);
CREATE INDEX IF NOT EXISTS idx_pointages_emp_date ON pointages(employe_id, date);

CREATE TABLE IF NOT EXISTS corrections_pointages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  employe_id INTEGER NOT NULL REFERENCES employes(id),
  date       TEXT NOT NULL,
  retard_secondes             INTEGER,
  sortie_anticipee_secondes   INTEGER,
  motif      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT,
  UNIQUE (employe_id, date)
);
CREATE INDEX IF NOT EXISTS idx_corrections_emp_date ON corrections_pointages(employe_id, date);
`);

// ---- Migration d'une base existante ----
function migrate() {
  const cols = db.prepare('PRAGMA table_info(mouvements)').all().map((c) => c.name);
  if (!cols.includes('solde_type')) {
    db.exec("ALTER TABLE mouvements ADD COLUMN solde_type TEXT NOT NULL DEFAULT 'conge'");
  }
  if (!cols.includes('arret_id')) {
    db.exec('ALTER TABLE mouvements ADD COLUMN arret_id INTEGER REFERENCES arrets_maladie(id)');
  }
  const empCols = db.prepare('PRAGMA table_info(employes)').all().map((c) => c.name);
  if (!empCols.includes('date_naissance')) db.exec('ALTER TABLE employes ADD COLUMN date_naissance TEXT');
  if (!empCols.includes('date_embauche')) db.exec('ALTER TABLE employes ADD COLUMN date_embauche TEXT');
  if (!empCols.includes('photo_url')) db.exec('ALTER TABLE employes ADD COLUMN photo_url TEXT');

  // Jours fériés : colonne `automatique` (jours fériés auto-gérés, ex. les 2 jours de l'Aïd el-Fitr)
  const jfCols = db.prepare('PRAGMA table_info(jours_feries)').all().map((c) => c.name);
  if (!jfCols.includes('automatique')) db.exec('ALTER TABLE jours_feries ADD COLUMN automatique INTEGER NOT NULL DEFAULT 0');

  // Horaires travaillés : colonnes `debut` / `fin` (premier / dernier badgeage de la journée)
  const hCols = db.prepare('PRAGMA table_info(horaires_travail)').all().map((c) => c.name);
  if (!hCols.includes('debut')) db.exec('ALTER TABLE horaires_travail ADD COLUMN debut TEXT');
  if (!hCols.includes('fin')) db.exec('ALTER TABLE horaires_travail ADD COLUMN fin TEXT');

  // Utilisateurs : rôle 'moderateur' + colonne permissions (reconstruction de la table si nécessaire)
  const uCols = db.prepare('PRAGMA table_info(utilisateurs)').all().map((c) => c.name);
  const uSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='utilisateurs'").get();
  const besoinPerms = !uCols.includes('permissions');
  const besoinRole = uSql && !String(uSql.sql).includes('moderateur');
  if (besoinPerms || besoinRole) {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE utilisateurs_new (
          id                 INTEGER PRIMARY KEY AUTOINCREMENT,
          login              TEXT NOT NULL UNIQUE,
          password_hash      TEXT NOT NULL,
          role               TEXT NOT NULL CHECK (role IN ('super_admin','consultation','moderateur','employe')),
          employe_id         INTEGER REFERENCES employes(id),
          actif              INTEGER NOT NULL DEFAULT 1,
          date_creation      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
          derniere_connexion TEXT,
          permissions        TEXT
        );
        INSERT INTO utilisateurs_new (id, login, password_hash, role, employe_id, actif, date_creation, derniere_connexion)
          SELECT id, login, password_hash, role, employe_id, actif, date_creation, derniere_connexion FROM utilisateurs;
        DROP TABLE utilisateurs;
        ALTER TABLE utilisateurs_new RENAME TO utilisateurs;
        CREATE INDEX IF NOT EXISTS idx_utilisateurs_employe ON utilisateurs(employe_id);
      `);
    })();
  }
  // Rétro-remplissage : droit maladie annuel (20 j) pour les employés sans aucun mouvement maladie
  const hasMaladie = db.prepare("SELECT COUNT(*) AS n FROM mouvements WHERE solde_type = 'maladie'").get().n;
  if (hasMaladie === 0) {
    const empList = db.prepare('SELECT id FROM employes').all();
    if (empList.length) {
      const ins = db.prepare(`
        INSERT INTO mouvements (employe_id, type_operation, date_operation, jours, motif, solde_apres, solde_type)
        VALUES (?, 'solde_initial', '2026-01-05', 20, 'Droit maladie annuel (20 jours)', 20, 'maladie')
      `);
      const tx = db.transaction(() => empList.forEach((e) => ins.run(e.id)));
      tx();
    }
  }
}

migrate();

const TYPES_CREDIT = ['solde_initial', 'ajout_annuel'];
const TYPES_DEBIT_CONGE = ['prelevement'];
const TYPES_DEBIT_MALADIE = ['maladie'];
const TYPES_NEUTRE = ['absence'];
const TYPES = [...TYPES_CREDIT, ...TYPES_DEBIT_CONGE, ...TYPES_DEBIT_MALADIE, ...TYPES_NEUTRE];
const TYPES_DEBIT = [...TYPES_DEBIT_CONGE, ...TYPES_DEBIT_MALADIE];

const isDebit = (type) => TYPES_DEBIT.includes(type);

function balanceSql(soldeType) {
  const debits = soldeType === 'maladie' ? ["'maladie'"] : ["'prelevement'"];
  return `
    SELECT COALESCE(SUM(CASE
      WHEN type_operation IN ('solde_initial','ajout_annuel') THEN jours
      WHEN type_operation IN (${debits.join(',')}) THEN -jours
      ELSE 0 END), 0) AS solde
    FROM mouvements
    WHERE employe_id = ? AND solde_type = ?
  `;
}

// soldeType : 'conge' (défaut) ou 'maladie'
function soldeEmploye(employeId, soldeType = 'conge') {
  const row = db.prepare(balanceSql(soldeType)).get(employeId, soldeType);
  return row ? Math.round(row.solde * 1000) / 1000 : 0;
}

const soldeMaladie = (employeId) => soldeEmploye(employeId, 'maladie');

function computeSoldeApres(employeId, typeOperation, jours, soldeType = 'conge') {
  const avant = soldeEmploye(employeId, soldeType);
  let delta;
  if (TYPES_NEUTRE.includes(typeOperation)) delta = 0; // absence = événement sans impact solde
  else delta = isDebit(typeOperation) ? -jours : jours;
  return Math.round((avant + delta) * 1000) / 1000;
}

function soldeEmployeAt(employeId, date, soldeType = 'conge') {
  const row = db.prepare(balanceSql(soldeType) + ' AND date_operation <= ?').get(employeId, soldeType, date || '9999-12-31');
  return row ? Math.round(row.solde * 1000) / 1000 : 0;
}

function insertMouvement({ employe_id, type_operation, date_operation, jours, motif, solde_type, arret_id }) {
  const st = solde_type || (type_operation === 'maladie' ? 'maladie' : 'conge');
  const solde_apres = computeSoldeApres(employe_id, type_operation, jours, st);
  const r = db.prepare(`
    INSERT INTO mouvements (employe_id, type_operation, date_operation, jours, motif, solde_apres, solde_type, arret_id)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(employe_id, type_operation, date_operation, jours, motif || null, solde_apres, st, arret_id || null);
  return db.prepare('SELECT * FROM mouvements WHERE id = ?').get(r.lastInsertRowid);
}

module.exports = {
  db,
  soldeEmploye,
  soldeMaladie,
  soldeEmployeAt,
  insertMouvement,
  computeSoldeApres,
  TYPES,
  TYPES_CREDIT,
  TYPES_DEBIT,
  isDebit,
};
