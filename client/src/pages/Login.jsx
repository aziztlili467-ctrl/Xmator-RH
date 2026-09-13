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
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden px-4"
      style={{ background: 'linear-gradient(160deg, #2B1810 0%, #22130B 55%, #1A0E07 100%)' }}
    >
      {/* Filigrane : image de la Banque Centrale de Tunisie */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40 saturate-125 brightness-[0.95]"
        style={{
          backgroundImage: "url('/assets/bqct-watermark.webp')",
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      />
      {/* Voile sombre pour détacher nettement la carte */}
      <div className="pointer-events-none absolute inset-0 bg-stone-950/50 backdrop-blur-[1px]" />

      <div className="relative z-10 w-full max-w-md">
        <div className="overflow-hidden rounded-2xl border border-[#E5D5B5] bg-white p-6 shadow-2xl sm:p-8">
          {/* Liseré supérieur : or brossé Prestige */}
          <div className="mb-6 h-1.5 w-full rounded-full" style={{ background: 'var(--gold-grad)' }} />

          <div className="mb-6 flex flex-col items-center gap-1.5 text-center">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-[#33261A] sm:text-3xl">
              Espace Amicale
            </h1>
            <p className="text-sm font-medium text-[#6B5F52]">
              Gestion des congés, maladies et absences
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-5 rounded-lg border border-[#FECDD3] bg-[#FFF1F2] px-4 py-3 text-sm font-medium text-[#BE123C]"
            >
              {error}
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="label mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#6B5F52]" htmlFor="login">
                Identifiant
              </label>
              <input
                id="login"
                className="input text-base text-[#33261A] placeholder:text-[#8A7D6D]"
                value={loginVal}
                onChange={(e) => setLoginVal(e.target.value)}
                placeholder="Votre identifiant"
                autoComplete="username"
                required
              />
            </div>

            <div>
              <label className="label mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#6B5F52]" htmlFor="password">
                Mot de passe
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={show ? 'text' : 'password'}
                  className="input pe-20 text-base text-[#33261A] placeholder:text-[#8A7D6D]"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Votre mot de passe"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute end-2 top-1/2 -translate-y-1/2 rounded-md px-2.5 py-1 text-xs font-semibold text-[#6B5F52] hover:bg-stone-100 hover:text-[#33261A]"
                >
                  {show ? 'Masquer' : 'Afficher'}
                </button>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                className="btn-primary flex-1 rounded-lg py-3 text-base transition"
                disabled={busy}
              >
                {busy ? 'Connexion…' : 'Se connecter'}
              </button>
              <button
                type="button"
                className="btn-secondary flex-1 rounded-lg py-3 text-base font-semibold transition"
                onClick={annuler}
              >
                Annuler
              </button>
            </div>
          </form>
        </div>

        <div className="mt-4 text-center">
          <p className="text-xs font-semibold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
            Amicale du Personnel de la Banque Centrale de Tunisie
          </p>
          <p className="mt-1 text-[11px] font-medium text-stone-200 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
            Mot de passe oublié ? Contactez l'administrateur système.
          </p>
        </div>
      </div>
    </div>
  );
}