import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, homeForRole } from '../AuthContext';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [loginVal, setLoginVal] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!loginVal || !password) return setError('Veuillez saisir votre login et votre mot de passe.');
    setBusy(true);
    setError('');
    try {
      const user = await login(loginVal, password);
      navigate(homeForRole(user.role), { replace: true });
    } catch (err) {
      setError(err.message || 'Connexion impossible.');
    } finally {
      setBusy(false);
    }
  };

  const annuler = () => {
    setLoginVal('');
    setPassword('');
    setShow(false);
    setError('');
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-900 px-4">
      {/* Filigrane : image de la Banque Centrale en couleurs vives, pleine page, adaptée à l'écran */}
      <div
        className="pointer-events-none absolute inset-0 opacity-60 saturate-150 brightness-[1.1]"
        style={{
          backgroundImage: "url('/assets/bqct-watermark.webp')",
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      />
      {/* Voile dégradé très léger pour la lisibilité de la carte */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-900/25 via-slate-900/0 to-slate-900/35" />

      <div className="relative z-10 w-full max-w-lg">
        <div className="overflow-hidden rounded-2xl bg-white/90 p-8 shadow-[0_25px_70px_-15px_rgba(13,27,74,0.65)] ring-1 ring-white/60 backdrop-blur-sm">
          <div className="mb-6 h-1.5 w-full rounded-full bg-gradient-to-r from-brand-700 via-brand-400 to-amber-400" />
          <div className="mb-6 flex flex-col items-center gap-3">
            <h1 className="bg-gradient-to-r from-brand-800 to-brand-500 bg-clip-text text-3xl font-extrabold text-transparent">
              Espace Amicale
            </h1>
            <p className="text-sm font-medium text-slate-500">Gestion des congés, maladies et absences</p>
          </div>

          {error && (
            <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
              {error}
            </p>
          )}

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="label text-base" htmlFor="login">Login</label>
              <input
                id="login"
                className="input rounded-xl px-5 py-4 text-lg"
                value={loginVal}
                onChange={(e) => setLoginVal(e.target.value)}
                placeholder="Votre identifiant"
                autoComplete="username"
              />
            </div>

            <div>
              <label className="label text-base" htmlFor="password">Mot de passe</label>
              <div className="relative">
                <input
                  id="password"
                  type={show ? 'text' : 'password'}
                  className="input rounded-xl px-5 py-4 pe-16 text-lg"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Votre mot de passe"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute end-3 top-1/2 -translate-y-1/2 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-slate-500 hover:bg-slate-100"
                >
                  {show ? 'Masquer' : 'Afficher'}
                </button>
              </div>
            </div>

            <div className="flex gap-3 pt-3">
              <button type="submit" className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-700 via-brand-600 to-brand-500 px-7 py-4 text-lg font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:from-brand-800 hover:via-brand-700 hover:to-brand-600 disabled:cursor-not-allowed disabled:opacity-50" disabled={busy}>
                {busy ? 'Connexion…' : 'Accepter'}
              </button>
              <button type="button" className="btn-secondary flex-1 rounded-xl px-7 py-4 text-lg" onClick={annuler}>
                Annuler
              </button>
            </div>
          </form>
        </div>
        <p className="mt-4 text-center text-xs font-medium text-brand-200">
          Amicale du Personnel de la Banque Centrale de Tunisie
        </p>
        <p className="mt-2 text-center text-[11px] text-slate-500/60">
          Mot de passe oublié ? Contactez l'administrateur système.
        </p>
      </div>
    </div>
  );
}