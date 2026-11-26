/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
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
          amber: '#F59E0B', // highlight amber
          poor: '#F97316', // orange
          verypoor: '#EF4444', // red
          severe: '#7F1D1D', // dark reddish maroon
          hazardous: '#450A0A',
        },
        surface: {
          base: '#0B0F17',
          nav: '#0d121c',
          panel: '#121826',
          card: '#131b2c',
          elevated: '#141C2E',
          popover: '#0e1626',
          selected: '#122531',
          chart: '#121927',
          'hero-top': '#182030',
          'hero-bottom': '#101624',
          'mint-card': '#102424',
          'danger-card': '#291314',
          'warning-card': '#281b10',
          'reveal-top': '#2b1612',
          'reveal-bottom': '#1b1012',
          'share-from': '#0f292e',
          'share-via': '#101828',
          'share-to': '#1e1522',
          'slate-deep': '#0f172a',
        },
        haze: {
          'severe-from': '#2a1711',
          'severe-via': '#1c1615',
          'verypoor-from': '#2b1810',
          'verypoor-via': '#1c1417',
          'poor-from': '#241a0d',
          'poor-via': '#16171c',
          'good-from': '#052222',
          'good-via': '#091b22',
          'good-to': '#0a0f18',
          'base-to': '#0c0d12',
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['"Space Grotesk"', 'sans-serif'],
        numbers: ['"Space Grotesk"', 'sans-serif'],
      },
      backgroundImage: {
        'haze-radial':
          'radial-gradient(circle at 50% 20%, rgba(45, 212, 191, 0.08) 0%, rgba(15, 23, 42, 0) 70%)',
        'severe-haze':
          'radial-gradient(circle at 50% 10%, rgba(120, 53, 15, 0.22) 0%, rgba(15, 23, 42, 0.95) 75%)',
        'clean-dawn':
          'radial-gradient(circle at 50% 10%, rgba(45, 212, 191, 0.20) 0%, rgba(11, 28, 36, 0.95) 75%)',
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
