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
        accent: { cyan: '#14b1a5', emerald: '#0f9d63', amber: '#c2740a', rose: '#d4353b', violet: '#7c5cf5', orange: '#e06c2b', blue: '#3b6af6', 'cyan-dark': '#30cdbf' },
        chart: { 1: '#2549eb', 2: '#14b1a5', 3: '#e06c2b', 4: '#7c5cf5', 5: '#0f9d63', 6: '#c2740a' },
        status: { approved: '#0f9d63', pending: '#c2740a', rejected: '#d4353b', draft: '#94a3b8', 'approved-dark': '#34d399', 'pending-dark': '#facc15', 'rejected-dark': '#f87171' },
        app: '#f6f8fc',
        appdark: '#0a0e17',
        panel: 'rgba(255,255,255,0.03)',
        card: '#ffffff',
        border: '#e4e9f2',
        'text-primary': '#0f172a',
        'text-secondary': '#64748b',
        brand: {
          50: '#eef4ff', 100: '#dbe6fe', 200: '#bfd3fe', 300: '#93b4fd', 400: '#608cfa',
          500: '#3b6af6', 600: '#2549eb', 700: '#1d37d8', 800: '#1e2faf', 900: '#1e2f8a', 950: '#172054',
        },
        teal: {
          50: '#eefdfa', 100: '#d3f9f2', 200: '#abf1e7', 300: '#71e4d7', 400: '#30cdbf',
          500: '#14b1a5', 600: '#0d8e87', 700: '#0f716d', 800: '#115a58', 900: '#124b49',
        },
        success: '#0f9d63', warning: '#c2740a', danger: '#d4353b', info: '#2549eb',
      },
      fontFamily: { sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Noto Sans', 'Arial', 'sans-serif'] },
      fontSize: { kpi: 'clamp(1.25rem, 0.95rem + 1.5vw, 1.75rem)' },
      boxShadow: {
        xs: '0 1px 2px rgba(16,30,66,0.05)',
        card: '0 1px 3px rgba(16,30,66,0.07), 0 1px 2px rgba(16,30,66,0.04)',
        sm: '0 1px 3px rgba(16,30,66,0.07), 0 1px 2px rgba(16,30,66,0.04)',
        md: '0 4px 12px rgba(16,30,66,0.08), 0 2px 4px rgba(16,30,66,0.04)',
        lg: '0 12px 28px rgba(16,30,66,0.12), 0 4px 8px rgba(16,30,66,0.05)',
        xl: '0 24px 48px rgba(16,30,66,0.16)',
      },
      borderRadius: { xs: '6px', sm: '8px', md: '12px', lg: '16px', xl: '20px', full: '999px' },
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
