/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}', '../client/src/**/*.{js,jsx}'],
  theme: {
    screens: {
      xs: '420px',
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
      tall: { raw: '(min-height: 700px)' },
      landscape: { raw: '(orientation: landscape)' },
      touch: { raw: '(hover: none) and (pointer: coarse)' },
    },
    extend: {
      colors: {
        primary: { 50: '#FBF7EA', 500: '#B08A2E', 600: '#8F701E', 700: '#75581A' },
        brand: {
          50: '#FBF7EA', 100: '#F6EDD2', 200: '#EDDBA4', 300: '#E2C672',
          400: '#D4AF37', 500: '#B08A2E', 600: '#8F701E', 700: '#75581A',
          800: '#5C4413', 900: '#453310', 950: '#2C220A',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Noto Sans', 'Arial', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderRadius: { xs: '8px', sm: '8px', md: '12px', lg: '12px', xl: '20px', full: '999px' },
      spacing: {
        'safe-top': 'env(safe-area-inset-top, 0px)',
        'safe-bottom': 'env(safe-area-inset-bottom, 0px)',
        'safe-left': 'env(safe-area-inset-left, 0px)',
        'safe-right': 'env(safe-area-inset-right, 0px)',
        touch: '44px',
      },
      minHeight: { touch: '44px' },
      minWidth: { touch: '44px' },
      maxWidth: { screen: '100vw' },
    },
  },
  plugins: [],
};
