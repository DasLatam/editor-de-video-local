/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f4ff',
          100: '#dde6ff',
          200: '#c0ceff',
          300: '#97adff',
          400: '#6c84fc',
          500: '#4a5cf8',
          600: '#3340ed',
          700: '#2a2fd2',
          800: '#272aab',
          900: '#242887',
        },
      },
    },
  },
  plugins: [],
}
