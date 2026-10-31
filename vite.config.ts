import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Шрифт — предзагрузкой прямо из index.html. Без неё браузер узнаёт о Manrope
 * только на первой раскладке, когда текст уже расставлен системным шрифтом:
 * файл приходит позже, и вся страница раскладывается второй раз (под CPU ×4 —
 * ~300 мс главного потока при запуске), а текст на глазах меняет ширину.
 * Только основные наборы: латиница (цифры, $, €) и кириллица. Остальные
 * (знаки ₽, ₴, ₸ и др.) — по валюте человека, из main.tsx (warmFonts).
 */
function preloadFonts(): Plugin {
  return {
    name: 'koshel-preload-fonts',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        return Object.keys(ctx.bundle ?? {})
          .filter((f) => /manrope-(latin|cyrillic)-wght-normal-[\w-]+\.woff2$/.test(f))
          .map((f) => ({
            tag: 'link',
            // Низкий приоритет: на узком канале сначала JS (без него нет экрана),
            // шрифт — сразу следом; до первой раскладки он всё равно успевает.
            attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href: './' + f, crossorigin: '', fetchpriority: 'low' },
            injectTo: 'head' as const,
          }))
      },
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), preloadFonts()],
  base: './',
  server: {
    port: 5173,
    host: true,
    // Allow Cloudflare/ngrok tunnel hostnames (they change every run).
    // Dev-only: lets the Telegram Mini App reach Vite through the tunnel.
    allowedHosts: ['.trycloudflare.com', '.ngrok-free.app', '.ngrok.io'],
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    // Шрифты — всегда отдельными файлами. Мелкий набор Manrope (cyrillic-ext,
    // 2,5 кБ) Vite по умолчанию встраивал в CSS как data:, а CSP страницы
    // (`font-src 'self'`) такой шрифт блокирует. В этом наборе знак гривны ₴ —
    // он молча рисовался системным шрифтом. Политику не ослабляем: файл лучше.
    assetsInlineLimit: (filePath) => (/\.(woff2?|ttf|otf)$/.test(filePath) ? false : undefined),
    rollupOptions: {
      output: {
        // Делим вендоры на отдельные чанки: кэшируются между релизами
        // и парсятся параллельно, ускоряя первый запуск.
        // lucide-react сюда НЕ кладём: этот чанк грузится при запуске, и в нём
        // оказывались все иконки приложения (~100 КБ из 113 — магазин,
        // настройки, редактор категорий). Без него каждая иконка едет с тем
        // экраном, где нужна, а при запуске — только иконки Главной.
        manualChunks: {
          react: ['react', 'react-dom'],
          vendor: ['dayjs', 'zustand', 'clsx'],
        },
      },
    },
  },
})
