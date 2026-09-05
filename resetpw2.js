// Réinitialise le mot de passe du Super Admin à 'admin123'
// Usage : node resetpw2.js
//         node resetpw2.js --show    → affiche juste le login sans changer le mot de passe
const bcrypt = require('./server/node_modules/bcryptjs');
const { db } = require('./server/db');

const showOnly = process.argv.includes('--show');

const admin = db.prepare("SELECT id, login FROM utilisateurs WHERE role = 'super_admin' LIMIT 1").get();
if (!admin) {
  console.error('Aucun compte Super Admin trouvé dans la base.');
  process.exit(1);
}

if (showOnly) {
  console.log(`Super Admin login : ${admin.login}`);
  console.log('Pour réinitialiser le mot de passe à "admin123", lancez : node resetpw2.js');
  process.exit(0);
}

const hash = bcrypt.hashSync('admin123', 10);
db.prepare('UPDATE utilisateurs SET password_hash=? WHERE id=?').run(hash, admin.id);
console.log(`Mot de passe du Super Admin "${admin.login}" réinitialisé à : admin123`);
