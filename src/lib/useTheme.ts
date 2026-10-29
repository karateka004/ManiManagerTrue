import { useEffect, useRef } from 'react'
import { tg, onThemeChange, syncTelegramChrome } from './telegram'
import { useStore, type ThemeMode } from '../store/transactions'
import { ACCENT_PALETTES } from './rewards'

/** Тёмная ли тема: выбор в настройках, иначе (system, старое auto) Telegram, иначе система. */
function resolveDark(mode: ThemeMode | string): boolean {
  if (mode === 'dark') return true
  if (mode === 'light') return false
  const fromTg = tg.webApp?.colorScheme
  if (fromTg) return fromTg === 'dark'
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const

/**
 * Палитра акцента — CSS-переменные --brand-50..900 на <html>. Дефолт (мятный)
 * или незнакомая палитра — без оверрайдов, берутся значения из index.css.
 * Пишем только изменившееся: запись в стиль <html> пересчитывает весь документ.
 */
function paintAccent(accent: string) {
  const root = document.documentElement
  const palette = accent === 'accent_mint' ? undefined : ACCENT_PALETTES[accent]
  for (const sh of SHADES) {
    const name = `--brand-${sh}`
    const want = palette ? palette[sh] : ''
    if (root.style.getPropertyValue(name) === want) continue
    if (want) root.style.setProperty(name, want)
    else root.style.removeProperty(name)
  }
}

/**
 * Тема и акцент — до первой отрисовки (main.tsx, до `ready()` Telegram). Из
 * эффекта они ставились уже после первого кадра: у тёмной темы приложение
 * открывалось светлым и потом перетекало в тёмное.
 */
export function applyInitialAppearance() {
  const s = useStore.getState()
  const dark = resolveDark(s.themeMode)
  document.documentElement.classList.toggle('dark', dark)
  paintAccent(s.equipped.accent)
  syncTelegramChrome(dark)
}

/**
 * Управляет атрибутом `.dark` на <html> в зависимости от themeMode:
 *   'system' → следует за Telegram.colorScheme (или prefers-color-scheme).
 *   'light' → принудительно светлая.
 *   'dark'  → принудительно тёмная.
 *
 * Подписывается на событие Telegram themeChanged, чтобы переключаться
 * на лету. Также синхронизирует цвет шапки/бэкграунда Telegram.
 */
export function useTheme() {
  const mode = useStore((s) => s.themeMode)
  // Первое применение темы — без перехода: при запуске перетекать не из чего.
  const started = useRef(false)

  useEffect(() => {
    const apply = () => {
      const isDark = resolveDark(mode)
      const root = document.documentElement
      if (root.classList.contains('dark') === isDark) {
        syncTelegramChrome(isDark)
        return
      }
      const flip = () => {
        root.classList.toggle('dark', isDark)
        syncTelegramChrome(isDark)
      }
      // Смена темы — плавным перетеканием всего экрана (View Transitions API,
      // Chrome 111+/Safari 18+). Нет API, «меньше движения» или первый запуск —
      // просто переключаем: тема не должна зависеть от анимации.
      const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown }
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      if (started.current && doc.startViewTransition && !reduce) {
        try {
          doc.startViewTransition(flip)
          return
        } catch {
          /* старый движок — переключим без перехода */
        }
      }
      flip()
    }

    apply()
    started.current = true

    let unsubscribe = () => {}
    let mediaCleanup = () => {}

    if (mode !== 'dark' && mode !== 'light') {
      // Reagiruет на Telegram themeChanged
      unsubscribe = onThemeChange(apply)

      // Резервно — на prefers-color-scheme (когда вне Telegram)
      if (window.matchMedia) {
        const mq = window.matchMedia('(prefers-color-scheme: dark)')
        const onChange = () => apply()
        mq.addEventListener?.('change', onChange)
        mediaCleanup = () => mq.removeEventListener?.('change', onChange)
      }
    }

    return () => {
      unsubscribe()
      mediaCleanup()
    }
  }, [mode])
}

/**
 * Применяет надетую акцентную палитру: переопределяет CSS-переменные
 * --brand-50..900 на <html>. Если выбран дефолт (мятный) или палитра не
 * найдена — снимает оверрайды, и берутся значения по умолчанию из index.css.
 */
export function useAccent() {
  const accent = useStore((s) => s.equipped.accent)
  const started = useRef(false)

  useEffect(() => {
    const paint = () => paintAccent(accent)

    // Надел новую палитру — приложение перекрашивается перетеканием, как при
    // смене темы. Первый запуск — сразу.
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown }
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (started.current && doc.startViewTransition && !reduce) {
      try {
        doc.startViewTransition(paint)
      } catch {
        paint()
      }
    } else {
      paint()
    }
    started.current = true
  }, [accent])
}
