import { Link } from 'react-router-dom';

export default function AccesRefuse() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="card w-full max-w-md p-8 text-center">
        <p className="text-6xl font-bold text-slate-300">403</p>
        <h1 className="mt-3 text-xl font-bold text-slate-900">Accès refusé</h1>
        <p className="mt-2 text-sm text-slate-500">
          Votre espace ne vous permet pas d'accéder à cette rubrique.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link to="/" className="btn-primary">Retour à l'accueil</Link>
          <Link to="/login" className="btn-secondary">Se connecter</Link>
        </div>
      </div>
    </div>
  );
}