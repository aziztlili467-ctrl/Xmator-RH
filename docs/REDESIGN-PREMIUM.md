# Refonte UX/UI — Cockpit « Dark Premium » du Tableau de bord

> Livrable de la session de refonte : direction artistique « poste de pilotage
> FinTech » pour le dashboard RH, entièrement scopée pour ne rien casser ailleurs.

## 1. Ce qui a changé

| Éléments du brief | Implémentation |
|---|---|
| Dark Mode Premium (noir profond, or brossé, émeraude / ambre / cobalt) | `client/src/premium-dark.css` — Design tokens **scopés** `[data-theme="dark-premium"]`, fond `#05070d`, or `#e3b94d`, verre dépoli (`backdrop-filter`), liserés or, grille lumineuse en fond |
| Typographie premium data-driven | Inter (UI) + **JetBrains Mono** pour tous les chiffres (`tabular-nums`, séparateur de milliers FR `85 456,96`) |
| Widgets modulaires avec profondeur | `KpiWidget` : verre + ombres douces + halo au survol + sparklines mensuelles intégrées |
| Animation de compteur au chargement | `components/ui/AnimatedNumber.jsx` — count-up ease-out (montage **et** changement de filtre), `prefers-reduced-motion` respecté |
| Donut interactif (expansion + tooltip) | `components/ui/DonutPro.jsx` — SVG maison : segment survolé épaissi + glow, estompement des autres, tooltip glass positionné, centre qui bascule sur la valeur survolée, clic → tiroir |
| Transitions sans rechargement | Les filtres ne rechargent jamais la page : pendant le fetch les anciennes données « s'estompent » (`.data-switching`), les nouvelles « glissent » en place (`@keyframes dp-rise`, stagger par section), jauges et compteurs se ré-animent |
| Filtre condensé + recherche sémantique | `components/ui/SearchSema.jsx` — langage naturel (« trouver tous les ingénieurs en congé ») : détecte catégorie / département / employé / **situation** (congé, retard, maladie, absent, solde faible), suggestions live, `Entrée` applique toutes les intentions, puces supprimables |
| Sélecteur de période moderne | `components/ui/SegmentedControl.jsx` — pastille glissante (Année / N−1 / Mois / M−1 / 12 m / Perso) + date pickers natifs habillés sombre (`color-scheme: dark`) |
| Boutons d'action | `.btn-gold` : dégradé or subtil + **balayage lumineux** au survol + glow (jamais un bloc de couleur unie) ; variantes `.btn-cobalt`, `.btn-ghost` |
| Panneau contextuel droit | `components/ui/TiroirContexte.jsx` — tiroir animé (slide + blur + Échap/voile) : détail d'un KPI (top 8 par département/employé avec barres animées), fiche employé (stats + flux d'activité), détail d'une situation du donut, département, et « alertes du jour » |
| Heatmap de présence par départements | `components/ui/PresenceHeatmap.jsx` — grille départements × (présence / congé / maladie / absence / retards), intensité relative par colonne, zoom cellulaire + tooltip au survol, clic ligne → tiroir |
| Jauges radiales | `components/ui/RadialGauge.jsx` — « Cockpit barométrique » : arcs à dégradé, graduations qui s'allument, balayage animé au chargement |
| Aperçu de la journée | Horloge locale Afrique/Tunis temps réel, météo (widget contextuel à brancher), compteur d'alertes critiques cliquable |
| Authentification visuelle | `components/ui/AvatarMenu.jsx` — avatar à anneau or, pastille de présence, dropdown animé en cascade (fiche, mon espace, journal, préférences, déconnexion) ; posé dans le bandeau du cockpit **et** dans la topbar de `Layout` en mode cockpit |
| Titres & données d'origine conservés | « Tableau de bord », « Effectif concerné : 129 », « Congés sur période : 1 597,5 j », « Heures travaillées : 85 456,96 h », « Jours présents / d'absence », « Taux de présence », « Répartition globale », « Retards & sorties anticipées », « Top des employés en retard », « ★ Évaluation de la ponctualité », « Détail par employé », alertes de solde, calendrier de présence (mode employé), etc. |

## 2. Périmètre & sécurité

* Tout le style est **confine** au selecteur `[data-theme="dark-premium"]` : les autres
  pages de l'application (bordeaux/clair, « chaleur & lisibilité ») sont intactes.
* `Layout.jsx` active le thème sombre sur **la route `/` uniquement** (chrome complet :
  sidebar noire + or, topbar en verre) — les autres routes gardent le thème clair.
* La logique de données (`api.dashboardAudit`, presets 21→20, socket `rh:donnees-change`,
  filtres employé/matricule/catégorie/département, alertes, soldes) est **inchangée** :
  même API, mêmes règles métier.
* Mode démo : `?demo=1` sur `/`, ou la route publique `/maquette` (jeu de données
  déterministe embarqué dans `client/src/demo/demoData.js`) — pour la revue design
  et les captures, sans backend.

## 3. Captures de référence (haute résolution)

* `docs/design/01-cockpit-hero.jpg` — vue « pli » 3200×2000 (KPIs animés, donut, jauges, heatmap).
* `docs/design/02-cockpit-complet.jpg` — page entière (graphiques, retards, évaluations, table).
* Régénérer : `cd client && npx vite build && npx vite preview --port 4173`
  puis ouvrir `http://localhost:4173/maquette` (DevTools → capture, ou Playwright
  `viewport 1600×1000 @2x`).

## 4. Fichiers

```
client/src/premium-dark.css                      design system sombre scopé (nouveau)
client/src/components/ui/AnimatedNumber.jsx      compteurs animés + format FR (nouveau)
client/src/components/ui/DonutPro.jsx            donut interactif SVG (nouveau)
client/src/components/ui/RadialGauge.jsx         jauges radiales « cockpit » (nouveau)
client/src/components/ui/PresenceHeatmap.jsx     heatmap départements (nouveau)
client/src/components/ui/TiroirContexte.jsx      panneau contextuel droit (nouveau)
client/src/components/ui/AvatarMenu.jsx          bloc utilisateur premium (nouveau)
client/src/components/ui/SearchSema.jsx          recherche sémantique (nouveau)
client/src/components/ui/SegmentedControl.jsx    sélecteur de période (nouveau)
client/src/pages/Dashboard.jsx                   refonte complète du tableau de bord
client/src/pages/Maquette.jsx                    vitrine publique /maquette (nouveau)
client/src/demo/demoData.js                      données de démonstration (nouveau)
client/src/App.jsx                               route /maquette
client/src/components/Layout.jsx                 mode cockpit (thème sombre sur « / »)
client/src/main.jsx                              import du thème premium
client/index.html                                + JetBrains Mono, Inter 800/900
```
