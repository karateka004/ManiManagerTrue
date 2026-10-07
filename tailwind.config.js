/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Brand palette (акцент) — через CSS-переменные, чтобы менять акцент рантайм.
        // Дефолт — мятно-зелёный (см. --brand-* в index.css).
        brand: {
          50: 'rgb(var(--brand-50) / <alpha-value>)',
          100: 'rgb(var(--brand-100) / <alpha-value>)',
          200: 'rgb(var(--brand-200) / <alpha-value>)',
          300: 'rgb(var(--brand-300) / <alpha-value>)',
          400: 'rgb(var(--brand-400) / <alpha-value>)',
          500: 'rgb(var(--brand-500) / <alpha-value>)',
          600: 'rgb(var(--brand-600) / <alpha-value>)',
          700: 'rgb(var(--brand-700) / <alpha-value>)',
          800: 'rgb(var(--brand-800) / <alpha-value>)',
          900: 'rgb(var(--brand-900) / <alpha-value>)',
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
        // Тонкая линия: обводка карточек и разделители в группах. Полная rgba из
        // переменной — у неё своя прозрачность для светлой и тёмной темы, шкалой
        // Tailwind её не выразить (нужные 6–8 % в шкалу не входят).
        hairline: 'var(--hairline)',
        ink: {
          DEFAULT: 'rgb(var(--c-ink) / <alpha-value>)',
          muted: 'rgb(var(--c-ink-muted) / <alpha-value>)',
          subtle: 'rgb(var(--c-ink-subtle) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['Manrope Variable', 'Manrope', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Manrope Variable', 'Manrope', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // Tight display sizes for amounts
        'display-lg': ['2.75rem', { lineHeight: '1', letterSpacing: '-0.03em', fontWeight: '700' }],
        'display-md': ['2rem', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '700' }],
      },
      // 2.0: радиусы ужаты. Было 32–40 px у карточек и шторок — мягко до
      // бесформенности. Группа и герой — 24 (rounded-3xl), шторка сверху — 28,
      // элементы внутри — 12–16, пилюли — full.
      borderRadius: {
        '4xl': '1.5rem',
        '5xl': '1.75rem',
      },
      boxShadow: {
        // 2.0: «мягкая тень» стала тонкой обводкой. Мягкая зелёная тень под
        // каждой карточкой — главный признак шаблонного интерфейса; обводка в
        // 1 px держит форму и не шумит. Имя оставлено прежним, чтобы не трогать
        // все места использования: смысл «обычная карточка» тот же.
        soft: '0 0 0 1px var(--hairline)',
        'soft-dark': '0 0 0 1px var(--hairline)',
        // Шторки и плавающие элементы действительно лежат над страницей — им
        // тень нужна, но нейтральная, без зелёного оттенка.
        raised: '0 -10px 40px rgba(0, 0, 0, 0.10)',
        'raised-dark': '0 -10px 40px rgba(0, 0, 0, 0.50)',
        fab: '0 8px 20px rgba(0, 0, 0, 0.16)',
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
