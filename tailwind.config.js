/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Brand palette — soft mint/sage greens (одинаковая в обеих темах)
        brand: {
          50: '#F1FAF5',
          100: '#DCF2E5',
          200: '#B8E5CC',
          300: '#8FD3AC',
          400: '#5DB996',
          500: '#3CA37B',
          600: '#2D8866',
          700: '#246E54',
          800: '#1D5743',
          900: '#143F30',
        },
        expense: {
          DEFAULT: '#E97373',
          soft: '#FCE4E4',
          deep: '#C84B4B',
        },
        income: {
          DEFAULT: '#3CA37B',
          soft: '#DCF2E5',
          deep: '#246E54',
        },
        // Surfaces — через CSS-переменные, переключаются классом .dark
        surface: {
          DEFAULT: 'rgb(var(--c-surface) / <alpha-value>)',
          raised: 'rgb(var(--c-surface-raised) / <alpha-value>)',
          sunken: 'rgb(var(--c-surface-sunken) / <alpha-value>)',
        },
        ink: {
          DEFAULT: 'rgb(var(--c-ink) / <alpha-value>)',
          muted: 'rgb(var(--c-ink-muted) / <alpha-value>)',
          subtle: 'rgb(var(--c-ink-subtle) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['Manrope', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Manrope', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // Tight display sizes for amounts
        'display-lg': ['2.75rem', { lineHeight: '1', letterSpacing: '-0.03em', fontWeight: '700' }],
        'display-md': ['2rem', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '700' }],
      },
      borderRadius: {
        '4xl': '2rem',
        '5xl': '2.5rem',
      },
      boxShadow: {
        soft: '0 2px 12px rgba(20, 63, 48, 0.06)',
        raised: '0 8px 24px rgba(20, 63, 48, 0.10)',
        fab: '0 10px 24px rgba(20, 63, 48, 0.18)',
        'soft-dark': '0 2px 10px rgba(0, 0, 0, 0.35)',
        'raised-dark': '0 8px 24px rgba(0, 0, 0, 0.45)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
