const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'amicale.db');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = -64000');
db.pragma('temp_store = MEMORY');
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
  rubrique     TEXT NOT NULL DEFAULT '',
  grade        TEXT NOT NULL DEFAULT '',
  classe       TEXT NOT NULL DEFAULT '',
  echelon      TEXT NOT NULL DEFAULT '',
  actif        INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS mouvements (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  employe_id     INTEGER NOT NULL REFERENCES employes(id),
  type_operation TEXT NOT NULL CHECK (type_operation IN
                  ('solde_initial','ajout_annuel','prelevement','maladie','absence')),
  date_operation TEXT NOT NULL,
  date_debut     TEXT,
  date_fin       TEXT,
  jours          REAL NOT NULL CHECK ((type_operation = 'solde_initial' AND jours <> 0)
                                      OR (type_operation != 'solde_initial' AND jours > 0)),
  motif          TEXT,
  solde_apres    REAL NOT NULL,
  solde_type     TEXT NOT NULL DEFAULT 'conge'
                 CHECK (solde_type IN ('conge','maladie')),
  created_at     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_mouvements_employe ON mouvements(employe_id);
CREATE INDEX IF NOT EXISTS idx_mouvements_date   ON mouvements(date_operation);
CREATE INDEX IF NOT EXISTS idx_mouvements_solde  ON mouvements(employe_id, solde_type, type_operation);

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
  demi_journee       INTEGER NOT NULL DEFAULT 0,
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

-- Application Web : tracking des appareils/sessions (une ligne par connexion réussie)
CREATE TABLE IF NOT EXISTS sessions_appareils (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  utilisateur_id    INTEGER REFERENCES utilisateurs(id),
  login             TEXT NOT NULL,
  role              TEXT,
  type_appareil     TEXT CHECK (type_appareil IN ('pc','mobile','tablette','autre')),
  nom_appareil      TEXT,
  user_agent        TEXT,
  ip_adresse        TEXT,
  date_connexion    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  derniere_activite TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  date_deconnexion  TEXT,
  duree_secondes    INTEGER,
  statut            TEXT NOT NULL DEFAULT 'connecte' CHECK (statut IN ('connecte','deconnecte'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_login   ON sessions_appareils(login);
CREATE INDEX IF NOT EXISTS idx_sessions_statut  ON sessions_appareils(statut);
CREATE INDEX IF NOT EXISTS idx_sessions_date    ON sessions_appareils(date_connexion);

-- Application Web : chat en direct utilisateur ↔ Super Admin (1 conversation par compte)
CREATE TABLE IF NOT EXISTS messages_chat (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  utilisateur_id  INTEGER NOT NULL REFERENCES utilisateurs(id),
  expediteur_id   INTEGER NOT NULL REFERENCES utilisateurs(id),
  expediteur_role TEXT NOT NULL CHECK (expediteur_role IN ('admin','utilisateur')),
  contenu         TEXT NOT NULL,
  date_envoi      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  lu              INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_chat_user_date ON messages_chat(utilisateur_id, date_envoi);
CREATE INDEX IF NOT EXISTS idx_chat_lu        ON messages_chat(utilisateur_id, expediteur_role, lu);

-- Paie mensuelle : Paramètres & Codification (codes de présence du futur journal de paie)
CREATE TABLE IF NOT EXISTS codes_paie (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  code       TEXT NOT NULL UNIQUE,
  libelle    TEXT NOT NULL,
  couleur    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT
);

-- Paie mensuelle : Journal RMA — codifications importées (A1/CA/MA/R3/RP…) par employé et date,
-- fusionnées avec P1 (pointages badgeuse) dans le journal de paie.
CREATE TABLE IF NOT EXISTS codes_importes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  employe_id   INTEGER NOT NULL REFERENCES employes(id),
  matricule    TEXT,
  date         TEXT NOT NULL,
  code         TEXT NOT NULL,
  demi_journee INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (employe_id, date, code)
);
CREATE INDEX IF NOT EXISTS idx_codes_importes_emp_date ON codes_importes(employe_id, date);
CREATE INDEX IF NOT EXISTS idx_codes_importes_date     ON codes_importes(date);

-- Rubrique Horaires : Notification d'Absences (formulaire du supérieur hiérarchique / responsable RH).
-- nb_jours = jours PRÉVUS au calendrier administratif (jours_travail.heures > 0),
-- c'est-à-dire hors repos hebdomadaire et hors jours fériés payés (religieux/nationaux).
CREATE TABLE IF NOT EXISTS notifications_absence (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  employe_id  INTEGER NOT NULL REFERENCES employes(id),
  matricule   TEXT NOT NULL,
  date_debut  TEXT NOT NULL,
  date_fin    TEXT NOT NULL,
  nb_jours    REAL NOT NULL,
  superieur   TEXT NOT NULL,
  cree_par    TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_notif_abs_emp   ON notifications_absence(employe_id);
CREATE INDEX IF NOT EXISTS idx_notif_abs_dates ON notifications_absence(date_debut, date_fin);

-- Paie mensuelle : Grille de Salaire (paramétrage par Rubrique / Grade / Classe / Echelon / Valeur)
CREATE TABLE IF NOT EXISTS grille_salaire (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  rubrique    TEXT NOT NULL,
  grade       TEXT NOT NULL,
  classe      TEXT NOT NULL,
  echelon     TEXT NOT NULL,
  valeur      REAL NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_grille_rubrique ON grille_salaire(rubrique);
CREATE INDEX IF NOT EXISTS idx_grille_grade    ON grille_salaire(grade);
`);

// ---- Migration d'une base existante ----
function migrate() {
  const cols = db.prepare('PRAGMA table_info(mouvements)').all().map((c) => c.name);
  if (!cols.includes('solde_type')) {
    db.exec("ALTER TABLE mouvements ADD COLUMN solde_type TEXT NOT NULL DEFAULT 'conge'");
  }
  // Période [début → fin] d'une dotation de solde (Éditer solde de congé).
  // Pour les lignes existantes, on initialise la période à la date d'opération.
  if (!cols.includes('date_debut')) {
    db.exec('ALTER TABLE mouvements ADD COLUMN date_debut TEXT');
  }
  if (!cols.includes('date_fin')) {
    db.exec('ALTER TABLE mouvements ADD COLUMN date_fin TEXT');
  }
  db.exec("UPDATE mouvements SET date_debut = COALESCE(date_debut, date_operation), date_fin = COALESCE(date_fin, date_operation)");
  if (!cols.includes('arret_id')) {
    db.exec('ALTER TABLE mouvements ADD COLUMN arret_id INTEGER REFERENCES arrets_maladie(id)');
  }

  // Autorise les soldes initiaux NÉGATIFS (dette/avance consommée, soustraits des droits annuels futurs) :
  // l'ancien CHECK « jours > 0 » interdit les valeurs négatives. On reconstruit la table (aucune autre
  // table ne référence mouvements) en remplaçant la contrainte par une règle conditionnelle
  // (solde_initial ≠ 0, autres mouvements > 0).
  const sqlMvt = (db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='mouvements'").get() || {}).sql || '';
  if (/CHECK\s*\(\s*jours\s*>\s*0\s*\)/.test(sqlMvt) && !/type_operation\s*=\s*'solde_initial'/.test(sqlMvt)) {
    db.pragma('foreign_keys = OFF');
    const tx = db.transaction(() => {
      db.exec(`
        CREATE TABLE mouvements_new (
          id             INTEGER PRIMARY KEY AUTOINCREMENT,
          employe_id     INTEGER NOT NULL REFERENCES employes(id),
          type_operation TEXT NOT NULL CHECK (type_operation IN
                            ('solde_initial','ajout_annuel','prelevement','maladie','absence')),
          date_operation TEXT NOT NULL,
          date_debut     TEXT,
          date_fin       TEXT,
          jours          REAL NOT NULL CHECK ((type_operation = 'solde_initial' AND jours <> 0)
                                              OR (type_operation != 'solde_initial' AND jours > 0)),
          motif          TEXT,
          solde_apres    REAL NOT NULL,
          solde_type     TEXT NOT NULL DEFAULT 'conge'
                         CHECK (solde_type IN ('conge','maladie')),
          arret_id       INTEGER REFERENCES arrets_maladie(id),
          created_at     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        INSERT INTO mouvements_new (id, employe_id, type_operation, date_operation, date_debut, date_fin, jours, motif, solde_apres, solde_type, arret_id, created_at)
          SELECT id, employe_id, type_operation, date_operation, date_debut, date_fin, jours, motif, solde_apres, solde_type, arret_id, created_at FROM mouvements;
        DROP TABLE mouvements;
        ALTER TABLE mouvements_new RENAME TO mouvements;
        CREATE INDEX IF NOT EXISTS idx_mouvements_employe ON mouvements(employe_id);
        CREATE INDEX IF NOT EXISTS idx_mouvements_date   ON mouvements(date_operation);
        CREATE INDEX IF NOT EXISTS idx_mouvements_solde  ON mouvements(employe_id, solde_type, type_operation);
      `);
    });
    tx();
    db.pragma('foreign_keys = ON');
  }
  const empCols = db.prepare('PRAGMA table_info(employes)').all().map((c) => c.name);
  if (!empCols.includes('date_naissance')) db.exec('ALTER TABLE employes ADD COLUMN date_naissance TEXT');
  if (!empCols.includes('date_embauche')) db.exec('ALTER TABLE employes ADD COLUMN date_embauche TEXT');
  if (!empCols.includes('photo_url')) db.exec('ALTER TABLE employes ADD COLUMN photo_url TEXT');
  if (!empCols.includes('rubrique')) db.exec("ALTER TABLE employes ADD COLUMN rubrique TEXT NOT NULL DEFAULT ''");
  if (!empCols.includes('grade')) db.exec("ALTER TABLE employes ADD COLUMN grade TEXT NOT NULL DEFAULT ''");
  if (!empCols.includes('classe')) db.exec("ALTER TABLE employes ADD COLUMN classe TEXT NOT NULL DEFAULT ''");
  if (!empCols.includes('echelon')) db.exec("ALTER TABLE employes ADD COLUMN echelon TEXT NOT NULL DEFAULT ''");
  if (!empCols.includes('adresse')) db.exec("ALTER TABLE employes ADD COLUMN adresse TEXT");
  if (!empCols.includes('telephone')) db.exec("ALTER TABLE employes ADD COLUMN telephone TEXT");
  if (!empCols.includes('situation_familiale')) db.exec("ALTER TABLE employes ADD COLUMN situation_familiale TEXT");
  if (!empCols.includes('nombre_enfants')) db.exec("ALTER TABLE employes ADD COLUMN nombre_enfants INTEGER DEFAULT 0");
  if (!empCols.includes('lieu_naissance')) db.exec("ALTER TABLE employes ADD COLUMN lieu_naissance TEXT");
  if (!empCols.includes('sexe')) db.exec("ALTER TABLE employes ADD COLUMN sexe TEXT");
  if (!empCols.includes('nationalite')) db.exec("ALTER TABLE employes ADD COLUMN nationalite TEXT");
  if (!empCols.includes('groupe_sanguin')) db.exec("ALTER TABLE employes ADD COLUMN groupe_sanguin TEXT");
  if (!empCols.includes('cin')) db.exec("ALTER TABLE employes ADD COLUMN cin TEXT");
  if (!empCols.includes('date_emission_cin')) db.exec("ALTER TABLE employes ADD COLUMN date_emission_cin TEXT");
  if (!empCols.includes('service_militaire')) db.exec("ALTER TABLE employes ADD COLUMN service_militaire TEXT");
  if (!empCols.includes('cnss')) db.exec("ALTER TABLE employes ADD COLUMN cnss TEXT");
  if (!empCols.includes('rue')) db.exec("ALTER TABLE employes ADD COLUMN rue TEXT");
  if (!empCols.includes('code_postal')) db.exec("ALTER TABLE employes ADD COLUMN code_postal TEXT");
  if (!empCols.includes('localite')) db.exec("ALTER TABLE employes ADD COLUMN localite TEXT");
  if (!empCols.includes('gouvernorat')) db.exec("ALTER TABLE employes ADD COLUMN gouvernorat TEXT");
  if (!empCols.includes('gsm')) db.exec("ALTER TABLE employes ADD COLUMN gsm TEXT");
  if (!empCols.includes('adresse_electronique')) db.exec("ALTER TABLE employes ADD COLUMN adresse_electronique TEXT");
  if (!empCols.includes('conjoint_nom')) db.exec("ALTER TABLE employes ADD COLUMN conjoint_nom TEXT");
  if (!empCols.includes('conjoint_date_naissance')) db.exec("ALTER TABLE employes ADD COLUMN conjoint_date_naissance TEXT");
  if (!empCols.includes('enfants_details')) db.exec("ALTER TABLE employes ADD COLUMN enfants_details TEXT");
  if (!empCols.includes('niveau_etudes')) db.exec("ALTER TABLE employes ADD COLUMN niveau_etudes TEXT");
  if (!empCols.includes('diplome')) db.exec("ALTER TABLE employes ADD COLUMN diplome TEXT");
  if (!empCols.includes('date_emission_diplome')) db.exec("ALTER TABLE employes ADD COLUMN date_emission_diplome TEXT");
  if (!empCols.includes('cnam')) db.exec("ALTER TABLE employes ADD COLUMN cnam TEXT");
  if (!empCols.includes('type_contrat')) db.exec("ALTER TABLE employes ADD COLUMN type_contrat TEXT");
  db.exec("UPDATE employes SET type_contrat = 'CDI (Titulaire)' WHERE type_contrat = 'CDI'");
  if (!empCols.includes('banque')) db.exec("ALTER TABLE employes ADD COLUMN banque TEXT");
  if (!empCols.includes('titulaire_compte')) db.exec("ALTER TABLE employes ADD COLUMN titulaire_compte TEXT");
  if (!empCols.includes('type_compte')) db.exec("ALTER TABLE employes ADD COLUMN type_compte TEXT");
  if (!empCols.includes('rib')) db.exec("ALTER TABLE employes ADD COLUMN rib TEXT");
  if (!empCols.includes('salaire_base')) db.exec("ALTER TABLE employes ADD COLUMN salaire_base TEXT");
  if (!empCols.includes('indemnite_presence')) db.exec("ALTER TABLE employes ADD COLUMN indemnite_presence TEXT");
  if (!empCols.includes('indemnite_transport')) db.exec("ALTER TABLE employes ADD COLUMN indemnite_transport TEXT");
  if (!empCols.includes('indemnite_fonction')) db.exec("ALTER TABLE employes ADD COLUMN indemnite_fonction TEXT");
  if (!empCols.includes('intitule_poste')) db.exec("ALTER TABLE employes ADD COLUMN intitule_poste TEXT");
  if (!empCols.includes('departement')) db.exec("ALTER TABLE employes ADD COLUMN departement TEXT DEFAULT ''");

  // Jours fériés : colonne `automatique` (jours fériés auto-gérés, ex. les 2 jours de l'Aïd el-Fitr)
  const jfCols = db.prepare('PRAGMA table_info(jours_feries)').all().map((c) => c.name);
  if (!jfCols.includes('automatique')) db.exec('ALTER TABLE jours_feries ADD COLUMN automatique INTEGER NOT NULL DEFAULT 0');

  // Appareils connectés : identifiant unique de l'appareil (fingerprint navigateur, équivalent MAC web)
  if (!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions_appareils'").get()) {
    // table créée plus haut au premier démarrage — rien à faire
  } else {
    const saCols = db.prepare('PRAGMA table_info(sessions_appareils)').all().map((c) => c.name);
    if (!saCols.includes('identifiant_appareil')) {
      db.exec('ALTER TABLE sessions_appareils ADD COLUMN identifiant_appareil TEXT');
      db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_appareil ON sessions_appareils(identifiant_appareil)');
    }
  }

  // Horaires travaillés : colonnes `debut` / `fin` (premier / dernier badgeage de la journée)
  const hCols = db.prepare('PRAGMA table_info(horaires_travail)').all().map((c) => c.name);
  if (!hCols.includes('debut')) db.exec('ALTER TABLE horaires_travail ADD COLUMN debut TEXT');
  if (!hCols.includes('fin')) db.exec('ALTER TABLE horaires_travail ADD COLUMN fin TEXT');

  // Demandes de congé : `demi_journee` = dernier jour de la demande compté comme demi-journée
  const dcCols = db.prepare('PRAGMA table_info(demandes_conge)').all().map((c) => c.name);
  if (!dcCols.includes('demi_journee')) db.exec('ALTER TABLE demandes_conge ADD COLUMN demi_journee INTEGER NOT NULL DEFAULT 0');

  // Journal RMA : `demi_journee` = congé d'une demi-journée (CA en noir)
  const ciCols = db.prepare('PRAGMA table_info(codes_importes)').all().map((c) => c.name);
  if (!ciCols.includes('demi_journee')) db.exec('ALTER TABLE codes_importes ADD COLUMN demi_journee INTEGER NOT NULL DEFAULT 0');

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

  // Rémunération : calage du salaire de base depuis la grille de salaire (grade / classe / echelon)
  // pour tous les profils — valeur de la grille (aucune indemnité : saisie manuelle). Idempotent.
  db.exec(`
    UPDATE employes
    SET salaire_base = (SELECT g.valeur FROM grille_salaire g
                        WHERE g.grade = employes.grade AND g.classe = employes.classe AND g.echelon = employes.echelon
                        LIMIT 1),
        rubrique = CASE WHEN employes.rubrique = '' THEN
                    (SELECT g.rubrique FROM grille_salaire g
                     WHERE g.grade = employes.grade AND g.classe = employes.classe AND g.echelon = employes.echelon
                     LIMIT 1)
                   ELSE employes.rubrique END
    WHERE employes.grade <> '' AND employes.classe <> '' AND employes.echelon <> ''
      AND EXISTS (SELECT 1 FROM grille_salaire g2
                  WHERE g2.grade = employes.grade AND g2.classe = employes.classe AND g2.echelon = employes.echelon)
  `);
}

migrate();

// Amorçage des codes de présence par défaut (Paramètres & Codification — journal de paie)
// + migration : ajoute les codifications manquantes si la table existe déjà (sans écraser les couleurs personnalisées)
const codesParDefaut = [
  ['P1', 'PRÉSENT', '#10b981'],
  ['A1', 'ABSENT', '#f59e0b'],
  ['CA', 'CONGÉ ANNUEL', '#0ea5e9'],
  ['DJ', 'DEMI-JOURNÉE', '#000000'],
  ['MA', 'MALADIE', '#f43f5e'],
  ['RP', 'REPOS', '#64748b'],
  ['R3', 'REPOS PAYÉ', '#8b5cf6'],
];
const nbCodesPaie = db.prepare('SELECT COUNT(*) AS n FROM codes_paie').get().n;
if (nbCodesPaie === 0) {
  const insCode = db.prepare('INSERT INTO codes_paie (code, libelle, couleur) VALUES (?,?,?)');
  db.transaction(() => {
    for (const [c, l, col] of codesParDefaut) insCode.run(c, l, col);
  })();
} else {
  for (const [c, l, col] of codesParDefaut) {
    if (!db.prepare('SELECT id FROM codes_paie WHERE code = ?').get(c)) {
      db.prepare('INSERT INTO codes_paie (code, libelle, couleur) VALUES (?,?,?)').run(c, l, col);
    }
  }
  // corrige la couleur historique de R3 si elle doublonne P1 ( #10b981 → #8b5cf6 pour différencier)
  const r3 = db.prepare("SELECT couleur FROM codes_paie WHERE code = 'R3'").get();
  if (r3 && String(r3.couleur).toLowerCase() === '#10b981') {
    db.prepare("UPDATE codes_paie SET couleur = '#8b5cf6' WHERE code = 'R3'").run();
  }
}

const TYPES_CREDIT = ['solde_initial', 'ajout_annuel'];
const TYPES_DEBIT_CONGE = ['prelevement'];
const TYPES_DEBIT_MALADIE = ['maladie'];
const TYPES_NEUTRE = ['absence'];
const TYPES = [...TYPES_CREDIT, ...TYPES_DEBIT_CONGE, ...TYPES_DEBIT_MALADIE, ...TYPES_NEUTRE];
const TYPES_DEBIT = [...TYPES_DEBIT_CONGE, ...TYPES_DEBIT_MALADIE];

const isDebit = (type) => TYPES_DEBIT.includes(type);

// Le prélèvement CA/DJ du congé se calcule exclusivement depuis la grille RMA (`codes_importes`) :
// TOUTE cellule CA/DJ qui y figure est un jour de congé consommé (CA = 1, DJ / demi-journée = 0,5).
// Aucune exclusion calendaire (férié/week-end) ni couverture par demande acceptée : la grille RMA
// est le miroir exact des indicateurs (tableau de bord, fiche, Mon Espace, « Éditer solde de congé »).

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

// Solde de congé restant « synchronisé à une date » (par défaut aujourd'hui) selon la règle RH :
//   solde restant = (solde_initial + ajout_annuel) − prélèvements de congé du journal RMA,
// Le « prélèvement CA du journal RMA » est compté depuis la source de vérité des congés RMA
// (codes_importes) : TOUTE cellule CA/DJ de la grille est un jour de congé consommé (`CA` = 1 jour,
// demi-journée / `DJ` = 0,5) — aucune exclusion calendaire (férié/week-end) ni couverture par une
// demande acceptée, afin que la grille RMA soit le miroir exact du tableau de bord et du journal.
// Tous les mouvements créditeurs et les jours CA sont bornés à date (date_operation/demi ≤ date).
function soldeCongeRestantDate(employeId, date) {
  const d = (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) ? date : '9999-12-31';
  // Les mouvements de compensation « RMA — restauration » (créés par le journal RMA quand un jour CA/DJ
  // est retiré/rectifié) ne sont PAS recomptés ici : le journal RMA recalcule déjà les prélèvements depuis
  // codes_importes, sinon chaque correction créditerait deux fois le solde dans « Éditer solde de congé ».
  const credits = db.prepare(`
    SELECT COALESCE(SUM(jours),0) AS c FROM mouvements
    WHERE employe_id = ? AND solde_type = 'conge'
      AND type_operation IN ('solde_initial','ajout_annuel') AND date_operation <= ?
      AND (motif IS NULL OR motif NOT LIKE 'RMA%restauration%')
  `).get(employeId, d).c;
  // Prélèvement CA/DJ du journal RMA (source de vérité : codes_importes) : dans la période,
  // CA = 1 jour, DJ / demi-journée = 0,5 — sans exclusion calendaire ni couverture par demande.
  const prlv = db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN ci.code = 'DJ' THEN 0.5 WHEN ci.demi_journee = 1 THEN 0.5 ELSE 1 END),0) AS c
    FROM codes_importes ci
    WHERE ci.employe_id = ? AND ci.code IN ('CA','DJ') AND ci.date <= ?
  `).get(employeId, d).c;
  return Math.round((credits - prlv) * 1000) / 1000;
}

// « Journal du solde de congé » par employé — combinaison en lecture seule, triée chronologiquement :
//   • dotations crédit (solde_initial / ajout_annuel) issues de `mouvements`,
//   • prélèvements CA/DJ synchronisés depuis le journal RMA (`codes_importes` — source de vérité) :
//     chaque cellule CA/DJ de la grille est une ligne déduite, sans exclusion calendaire.
// Chaque ligne porte un solde courant recalculé en continu (édition de type « grand livre »).
function journalSoldeConge(employeId) {
  const mouvements = db.prepare(`
    SELECT * FROM mouvements
    WHERE employe_id = ? AND solde_type = 'conge'
      AND type_operation IN ('solde_initial','ajout_annuel')
      AND (motif IS NULL OR motif NOT LIKE 'RMA%restauration%')
    ORDER BY date_operation ASC, id ASC
  `).all(employeId);

  const prelevements = db.prepare(`
    SELECT ci.date, ci.code, ci.demi_journee, ci.id AS codes_importes_id
    FROM codes_importes ci
    WHERE ci.employe_id = ? AND ci.code IN ('CA','DJ')
    ORDER BY ci.date ASC, ci.id ASC
  `).all(employeId);

  const joursParCode = (r) => {
    if (r.code === 'DJ') return 0.5;
    if (r.demi_journee) return 0.5;
    return 1;
  };

  const items = [];
  for (const m of mouvements) {
    items.push({
      type: 'dotation',
      type_operation: m.type_operation,
      date_operation: m.date_operation,
      date_debut: m.date_debut || m.date_operation,
      date_fin: m.date_fin || m.date_operation,
      jours: m.jours,
      signe: +1,
      motif: m.motif || null,
      source: 'mouvement',
      mouvement_id: m.id,
      id: m.id,
      code: null,
    });
  }
  for (const p of prelevements) {
    // Chaque cellule CA/DJ de la grille RMA est une ligne déduite du solde (miroir exact de la
    // grille), cohérente avec soldeCongeRestantDate. Le champ `deduit` reste toujours `true`.
    const jours = joursParCode(p);
    items.push({
      type: 'prelevement_rma',
      type_operation: 'prelevement',
      date_operation: p.date,
      date_debut: p.date,
      date_fin: p.date,
      jours,
      signe: -1,
      deduit: true,
      motif: `RMA — Congé ${p.code} du ${p.date}`,
      source: 'codes_importes',
      mouvement_id: null,
      code: p.code,
    });
  }

  items.sort((a, b) => (a.date_operation === b.date_operation ? a.signe - b.signe : a.date_operation < b.date_operation ? -1 : 1));

  let running = 0;
  for (const it of items) {
    // Toutes les lignes CA/DJ de la grille RMA participent au solde courant.
    running = Math.round((running + it.signe * it.jours) * 1000) / 1000;
    it.solde_apres = running;
  }
  return { solde: running, lignes: items };
}

function insertMouvement({ employe_id, type_operation, date_operation, jours, motif, solde_type, arret_id, date_debut, date_fin }) {
  const st = solde_type || (type_operation === 'maladie' ? 'maladie' : 'conge');
  const solde_apres = computeSoldeApres(employe_id, type_operation, jours, st);
  const r = db.prepare(`
    INSERT INTO mouvements (employe_id, type_operation, date_operation, date_debut, date_fin, jours, motif, solde_apres, solde_type, arret_id)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(employe_id, type_operation, date_operation, date_debut || date_operation, date_fin || date_operation, jours, motif || null, solde_apres, st, arret_id || null);
  return db.prepare('SELECT * FROM mouvements WHERE id = ?').get(r.lastInsertRowid);
}

// Recalcule la colonne solde_apres de TOUS les mouvements d'un employé (ordre chronologique),
// après une création / édition / suppression. Garantit la cohérence du solde courant.
function recomputeSoldeChain(employeId, soldeType = 'conge') {
  const rows = db.prepare(`
    SELECT * FROM mouvements
    WHERE employe_id = ? AND solde_type = ?
    ORDER BY date_operation ASC, id ASC
  `).all(employeId, soldeType);
  let running = 0;
  const upd = db.prepare('UPDATE mouvements SET solde_apres = ? WHERE id = ?');
  for (const m of rows) {
    if (m.type_operation === 'solde_initial' || m.type_operation === 'ajout_annuel') running += m.jours;
    else if (m.type_operation === 'prelevement' || m.type_operation === 'maladie') running -= m.jours;
    upd.run(Math.round(running * 1000) / 1000, m.id);
  }
  return Math.round(running * 1000) / 1000;
}

function updateMouvement(id, { date_operation, date_debut, date_fin, jours, motif }) {
  const m = db.prepare('SELECT * FROM mouvements WHERE id = ?').get(Number(id));
  if (!m) return null;
  const j = jours !== undefined ? Number(jours) : m.jours;
  // Un solde initial peut être négatif (dette) ; les autres mouvements restent positifs.
  const initialNegatif = m.type_operation === 'solde_initial' && j < 0;
  if (!Number.isFinite(j) || j === 0 || (!initialNegatif && j < 0)) {
    throw new Error(m.type_operation === 'solde_initial' ? 'Le nombre de jours doit être non nul (négatif autorisé pour un solde initial).' : 'Le nombre de jours doit être positif.');
  }
  const dOp = date_operation || m.date_operation;
  const dD = date_debut || m.date_debut || dOp;
  const dF = date_fin || m.date_fin || dOp;
  db.prepare(`
    UPDATE mouvements
    SET date_operation = ?, date_debut = ?, date_fin = ?, jours = ?, motif = ?, solde_apres = 0
    WHERE id = ?
  `).run(dOp, dD, dF, j, motif !== undefined ? (motif || null) : m.motif, Number(id));
  recomputeSoldeChain(m.employe_id, m.solde_type);
  return db.prepare('SELECT * FROM mouvements WHERE id = ?').get(Number(id));
}

function deleteMouvement(id) {
  const m = db.prepare('SELECT * FROM mouvements WHERE id = ?').get(Number(id));
  if (!m) return null;
  db.prepare('DELETE FROM mouvements WHERE id = ?').run(Number(id));
  recomputeSoldeChain(m.employe_id, m.solde_type);
  return m;
}

module.exports = {
  db,
  soldeEmploye,
  soldeMaladie,
  soldeEmployeAt,
  soldeCongeRestantDate,
  journalSoldeConge,
  insertMouvement,
  updateMouvement,
  deleteMouvement,
  recomputeSoldeChain,
  computeSoldeApres,
  TYPES,
  TYPES_CREDIT,
  TYPES_DEBIT,
  isDebit,
  CODE_RMA_DEMI: 'DJ',
};
