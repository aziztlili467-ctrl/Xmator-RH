import { Link } from 'react-router-dom';
import Dashboard from './Dashboard';
import {
  IconDashboard, IconUsers, IconCalendarCheck, IconClipboardList, IconCamera, IconSettings,
} from '../components/icons';

/**
 * Maquette — vitrine « cockpit dark premium » du tableau de bord.
 * Route publique /maquette : rend le vrai composant Dashboard en mode démo
 * (jeu de données embarqué) dans un chrome minimal, pour la revue design,
 * la génération de captures haute résolution et le partage client — sans
 * toucher au Layout réel ni à l'authentification.
 */
const RAIL = [
  { icon: IconDashboard, label: 'Tableau de bord', to: '/', active: true },
  { icon: IconUsers, label: 'Employés', to: '/employes' },
  { icon: IconCalendarCheck, label: 'Congés', to: '/demandes/instance' },
  { icon: IconClipboardList, label: 'Paie', to: '/calcul-paie' },
  { icon: IconCamera, label: 'Borne Xmator-Eye', to: '/borne' },
  { icon: IconSettings, label: 'Paramètres', to: '/parametres-codification' },
];

export default function Maquette() {
  return (
    <div data-theme="dark-premium" className="maquette-shell">
      <aside className="maquette-rail hidden md:flex" aria-label="Navigation (maquette)">
        <span className="rail-logo" title="XMATOR RH">Xm</span>
        <span className="my-1 h-px w-8" style={{ background: 'linear-gradient(90deg, transparent, rgba(227,185,77,.5), transparent)' }} />
        {RAIL.map((it) => (
          <Link
            key={it.label}
            to={it.to}
            title={it.label}
            aria-label={it.label}
            className={`rail-btn ${it.active ? 'is-active' : ''}`}
          >
            <it.icon />
          </Link>
        ))}
        <span className="mt-auto" />
        <span className="rail-btn" title="Verrouillé — session démo">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></svg>
        </span>
      </aside>

      <main className="min-w-0 flex-1">
        <Dashboard demo />
      </main>
    </div>
  );
}
