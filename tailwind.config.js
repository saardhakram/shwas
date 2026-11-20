/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        mint: {
          DEFAULT: '#2DD4BF',
          50: '#F0FDF4',
          100: '#CCFBF1',
          200: '#99F6E4',
          300: '#5EEAD4',
          400: '#2DD4BF', // primary brand mint for clean air actions
          500: '#14B8A6',
          600: '#0D9488',
        },
        aqi: {
          good: '#2DD4BF', // clear teal
          moderate: '#FBBF24', // mild amber
          poor: '#F97316', // orange
          verypoor: '#EF4444', // red
          severe: '#7F1D1D', // dark reddish maroon
          hazardous: '#450A0A',
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['"Space Grotesk"', 'sans-serif'],
        numbers: ['"Space Grotesk"', 'sans-serif'],
      },
      backgroundImage: {
        'haze-radial': 'radial-gradient(circle at 50% 20%, rgba(45, 212, 191, 0.08) 0%, rgba(15, 23, 42, 0) 70%)',
        'severe-haze': 'radial-gradient(circle at 50% 10%, rgba(120, 53, 15, 0.22) 0%, rgba(15, 23, 42, 0.95) 75%)',
        'clean-dawn': 'radial-gradient(circle at 50% 10%, rgba(45, 212, 191, 0.20) 0%, rgba(11, 28, 36, 0.95) 75%)',
      },
      backdropBlur: {
        xs: '2px',
      },
      animation: {
        'pulse-subtle': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
};
