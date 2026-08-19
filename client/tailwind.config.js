/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef4ff',
          100: '#d9e4fd',
          200: '#bccffb',
          300: '#8eaff7',
          400: '#5a85f1',
          500: '#3860ea',
          600: '#2142de',
          700: '#1c34cc',
          800: '#1c2ea6',
          900: '#1d2c83',
          950: '#141b4f',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Segoe UI', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 3px rgba(15, 23, 42, 0.06), 0 1px 2px rgba(15, 23, 42, 0.04)',
      },
    },
  },
  plugins: [],
};
