import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@shared/AuthContext';

export default function LoginTerminal() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [loginVal, setLoginVal] = useState('');
  const [password, setPassword] = useState('');
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);

  const soumettre = async (e) => {
    e.preventDefault();
    setErreur('');
    setChargement(true);
    try {
      await login(loginVal, password);
      navigate('/borne', { replace: true });
    } catch (err) {
      setErreur(err?.message || 'Identifiants incorrects.');
    } finally {
      setChargement(false);
    }
  };

  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-slate-950 px-4">
      {/* Décor immersif */}
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-24 h-[28rem] w-[28rem] rounded-full bg-teal-500/10 blur-3xl" />

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center">
          <img
            src="/terminal/xmator-eye-logo.png"
            alt="Xmator Terminal"
            className="h-20 w-20 rounded-3xl object-cover shadow-2xl ring-4 ring-emerald-500/30"
          />
          <h1 className="mt-5 text-2xl font-black tracking-wide text-white">XMATOR TERMINAL</h1>
          <p className="mt-1 text-xs uppercase tracking-[0.3em] text-slate-400">Borne de pointage biométrique</p>
        </div>

        {/* Formulaire */}
        <form onSubmit={soumettre} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">Login</label>
            <input
              type="text"
              value={loginVal}
              onChange={(e) => setLoginVal(e.target.value)}
              autoComplete="username"
              required
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white placeholder-slate-500 outline-none transition focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20"
              placeholder="Votre identifiant"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white placeholder-slate-500 outline-none transition focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20"
              placeholder="••••••••"
            />
          </div>

          {erreur && (
            <p className="rounded-xl border border-red-500/30 bg-red-950/40 px-4 py-2.5 text-center text-xs font-semibold text-red-300">
              {erreur}
            </p>
          )}

          <button
            type="submit"
            disabled={chargement || !loginVal || !password}
            className="w-full rounded-xl bg-emerald-600 px-6 py-3.5 text-sm font-black uppercase tracking-wider text-white shadow-lg shadow-emerald-900/50 transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {chargement ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>

        <p className="mt-6 text-center text-[10px] uppercase tracking-[0.2em] text-slate-600">
          XMATOR EYE · Amicale du Personnel — Banque Centrale
        </p>
      </div>
    </div>
  );
}
