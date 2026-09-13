import { Component } from 'react';

// Filet de sécurité global : si une page lance une exception pendant le rendu,
// on affiche une erreur lisible DANS cette page au lieu de faire tomber tout le SaaS
// (écran blanc). Le composant est « keyé » par chemin de route pour se réinitialiser
// à chaque navigation (Layout : key={location.pathname}).
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { erreur: null };
  }

  static getDerivedStateFromError(erreur) {
    return { erreur };
  }

  componentDidCatch(erreur, infos) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', erreur, infos);
  }

  render() {
    if (!this.state.erreur) return this.props.children;

    const message = this.state.erreur && this.state.erreur.message
      ? this.state.erreur.message
      : String(this.state.erreur);

    return (
      <div className="mx-auto max-w-xl rounded-xl border border-red-200 bg-red-50/60 p-8 text-center">
        <p className="text-sm font-black uppercase tracking-widest text-red-700">
          Une erreur est survenue dans cette page
        </p>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
          Un problème inattendu a interrompu l'affichage. Le reste de l'application reste accessible.
        </p>
        <p className="mx-auto mt-3 max-w-md break-words rounded-lg bg-white px-3 py-2 text-left font-mono text-[11px] text-slate-500 ring-1 ring-red-100">
          {message}
        </p>
        <button type="button" className="btn-primary mt-5" onClick={() => window.location.reload()}>
          Recharger la page
        </button>
      </div>
    );
  }
}