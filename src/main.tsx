import React from 'react'
import ReactDOM from 'react-dom/client'
import { LazyMotion, MotionConfig } from 'framer-motion'
import App from './App'
import { initTelegram } from './lib/telegram'
import { initPerfFlags } from './lib/perf'
import { clearChunkReloadFlag } from './lib/lazyRetry'
// Шрифт лежит в нашем же бандле, а не на Google Fonts. С внешнего домена он
// приходил ПОСЛЕ первой отрисовки (а на медленной сети не приходил вовсе), и
// интерфейс показывался системным шрифтом — тяжёлым и широким, совсем не тем,
// под который он свёрстан. Вариативный файл: все насыщенности одним запросом,
// браузер качает только нужные алфавиты (кириллица ~15 КБ, латиница ~25 КБ).
import '@fontsource-variable/manrope'
import './index.css'
// Движение (токены, утилиты, барабаны цифр, эффекты) и обложки карты — обычный CSS
// без @layer: Tailwind-директивы живут только в index.css.
import './styles/motion.css'
import './styles/skins.css'

// Initialize Telegram WebApp (graceful fallback if outside Telegram)
initTelegram()
// Слабое устройство и свёрнутый мини-апп — флаги для анимаций (lib/perf).
initPerfFlags()

// Страница успешно загрузилась → снимаем флаг авто-перезагрузки чанков
// (если она и была — значит, восстановление удалось). Защита от зацикливания.
window.addEventListener('load', clearChunkReloadFlag)

// Фичи анимаций грузятся отдельным async-чанком (см. motionFeatures.ts).
const loadMotionFeatures = () => import('./lib/motionFeatures').then((m) => m.default)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LazyMotion features={loadMotionFeatures} strict>
      {/* «Меньше движения» в системе — framer тоже его слушается (шторки
          появляются без выезда), как и CSS-анимации в styles/motion.css. */}
      <MotionConfig reducedMotion="user">
        <App />
      </MotionConfig>
    </LazyMotion>
  </React.StrictMode>,
)
