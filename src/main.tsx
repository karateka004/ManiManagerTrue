import React from 'react'
import ReactDOM from 'react-dom/client'
import { LazyMotion, MotionConfig } from 'framer-motion'
import App from './App'
import { initTelegram } from './lib/telegram'
import { applyInitialAppearance } from './lib/useTheme'
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
import { startClarity } from './lib/clarity'
import { useStore } from './store/transactions'
import { getCurrency } from './lib/currencies'
import { resetDayCacheIfZoneChanged } from './lib/day'
import { isBaseIcon, loadMoreIcons } from './components/icons/CategoryIcon'

// Тема и акцент — до первого кадра и до `ready()`: Telegram показывает
// приложение сразу после него, и первый кадр должен быть уже в своих цветах.
applyInitialAppearance()
// Initialize Telegram WebApp (graceful fallback if outside Telegram)
initTelegram()
// Слабое устройство и свёрнутый мини-апп — флаги для анимаций (lib/perf).
initPerfFlags()

// Набор шрифта со знаком валюты человека — сразу, а не когда знак впервые
// попадёт в раскладку. Латиницу и кириллицу index.html грузит предзагрузкой,
// а ₽, ₴, ₸ и многие другие знаки лежат в отдельных наборах Manrope: без этого
// файл запрашивался только после первой раскладки Главной, приходил позже и
// раскладка шла второй раз.
function warmFonts() {
  try {
    const s = useStore.getState()
    const codes = new Set([s.currency])
    for (let i = 0; i < s.transactions.length && codes.size < 8; i++) {
      const c = s.transactions[i].currency
      if (c) codes.add(c)
    }
    const sample = [...codes].map((c) => getCurrency(c).symbol).join('')
    void document.fonts?.load('16px "Manrope Variable"', sample).catch(() => {})
  } catch {
    /* без шрифтового API — подгрузится сам */
  }
}
warmFonts()

// Иконки своих категорий сверх встроенного набора — отдельный чанк
// (components/icons/categoryIconsMore). Есть такие категории — грузим сразу,
// параллельно с первой отрисовкой, а не когда список их попросит.
try {
  if (useStore.getState().customCategories.some((c) => !isBaseIcon(c.icon))) void loadMoreIcons()
} catch {
  /* грузятся по требованию */
}

// Даты операций кэшируются как локальные полуночи (lib/day) — после перелёта
// в другой пояс их нужно пересчитать.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) resetDayCacheIfZoneChanged()
})

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

// Записи сессий для владельца (lib/clarity): очередь сразу, скрипт — в простое.
startClarity()
