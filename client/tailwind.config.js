/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    screens: {
      xs: '420px',
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
      // Ciblage tactile / orientation (utile pour les tableaux et le menu mobile)
      tall: { raw: '(min-height: 700px)' },
      landscape: { raw: '(orientation: landscape)' },
      touch: { raw: '(hover: none) and (pointer: coarse)' },
    },
    extend: {
      colors: {
        primary: { 50: '#eef2ff', 500: '#6366f1', 600: '#4f46e5', 700: '#4338ca' },
        accent: { cyan: '#06b6d4', emerald: '#10b981', amber: '#f59e0b', rose: '#f43f5e', violet: '#8b5cf6', orange: '#fb923c', blue: '#3b82f6', 'cyan-dark': '#22d3ee' },
        chart: { 1: '#38bdf8', 2: '#a78bfa', 3: '#fb923c', 4: '#f472b6', 5: '#34d399', 6: '#facc15' },
        status: { approved: '#10b981', pending: '#f59e0b', rejected: '#ef4444', draft: '#94a3b8', 'approved-dark': '#34d399', 'pending-dark': '#facc15', 'rejected-dark': '#f87171' },
        app: '#f8fafc',
        appdark: '#0a0e17',
        panel: 'rgba(255,255,255,0.03)',
        card: '#ffffff',
        border: '#e2e8f0',
        'text-primary': '#0f172a',
        'text-secondary': '#64748b',
        brand: {
          50: '#eef2ff', 100: '#d9e4fd', 200: '#bccffb', 300: '#8eaff7', 400: '#5a85f1',
          500: '#3860ea', 600: '#2142de', 700: '#1c34cc', 800: '#1c2ea6', 900: '#1d2c83', 950: '#141b4f',
        },
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'Segoe UI', 'sans-serif'] },
      boxShadow: { card: '0 1px 3px rgba(15,23,42,0.06), 0 1px 2px rgba(15,23,42,0.04)', sm: '0 1px 2px rgba(15,23,42,0.06)', md: '0 4px 12px rgba(15,23,42,0.08)', lg: '0 12px 24px rgba(15,23,42,0.12)' },
      borderRadius: { sm: '8px', md: '12px', lg: '20px', full: '999px' },
      spacing: {
        // Zones sûres iOS (encoche / barre home) exposées comme utilitaires Tailwind
        'safe-top': 'env(safe-area-inset-top, 0px)',
        'safe-bottom': 'env(safe-area-inset-bottom, 0px)',
        'safe-left': 'env(safe-area-inset-left, 0px)',
        'safe-right': 'env(safe-area-inset-right, 0px)',
        // Hauteur mini recommandée pour une cible tactile (WCAG 2.5.5)
        touch: '44px',
      },
      minHeight: { touch: '44px' },
      minWidth: { touch: '44px' },
      maxWidth: { screen: '100vw' },
    },
  },
  plugins: [],
};
