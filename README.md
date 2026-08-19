# Xmator-RH — SaaS Gestion des congés, maladies et absences

Application SaaS de gestion RH pour l'**Amicale du Personnel de la Banque Centrale de Tunisie** : congés, arrêts maladie, absences, pointages et horaires de travail.

- Frontend : React 18 + Vite + Tailwind CSS + Recharts (interface 100 % français)
- Backend : Node.js + Express + SQLite (better-sqlite3), authentification JWT, PDF via pdfkit
- Multi-rôles : super admin, modérateur (droits par rubrique), consultation, employé

## Prérequis

- Node.js **>= 22** (testé avec v24)
- npm

## Installation

```bash
# Dépendances (racine + server + client)
npm install && npm --prefix server install && npm --prefix client install
# ou
npm run install:all
```

## Configuration

Copier `.env.example` vers `.env` et renseigner les valeurs :

```bash
cp .env.example .env
```

| Variable | Description |
| --- | --- |
| `PORT` | Port HTTP (défaut 4000) |
| `JWT_SECRET` | Clé de signature des jetons JWT — **obligatoire en production** |
| `ADMIN_PASSWORD` | Mot de passe du super admin initial (si base vide) |
| `DB_PATH` | Chemin de la base SQLite (défaut `data/amicale.db`) |
| `CORS_ORIGIN` | Origines autorisées, séparées par des virgules (vide = même origine) |

À la première exécution avec une base vide, le serveur crée automatiquement :
un compte super admin `Xmator` (mot de passe `ADMIN_PASSWORD` ou aléatoire affiché dans la console) et un jeu de données de démonstration.

## Démarrage

```bash
# Production (build du client puis serveur)
npm start

# Développement (client + serveur avec rechargement)
npm run dev

# Serveur seul (après un build du client)
npm --prefix server run start
```

Le serveur est accessible sur **http://localhost:4000** (client construit servi par le serveur).

## Comptes par défaut (démo)

| Login | Rôle |
| --- | --- |
| `Xmator` | super_admin |

## Structure

```
├── server/            # API Express (routes, middleware, base SQLite)
│   ├── routes/        # 76 endpoints répartis sur 16 routeurs
│   └── middleware/    # Auth JWT, rôles, mouchard (journal d'activité)
├── client/            # Application React (Vite)
│   └── src/           # 24 pages, 9 composants, 26 routes
├── data/              # Base SQLite + photos (ignoré par git — données personnelles)
└── instructions2026.md # Journal de développement interne (ignoré par git)
```

## Sécurité

- Les mots de passe sont hashés (bcrypt), jamais stockés en clair
- `data/` (base réelle, photos, sauvegardes) et `instructions2026.md` sont **ignorés par git**
- En production : définir `NODE_ENV=production` et une `JWT_SECRET` forte

## Licence

Projet privé — Amicale du Personnel de la Banque Centrale de Tunisie.