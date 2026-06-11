import { useEffect } from 'react'
import { tg, onThemeChange, syncTelegramChrome } from './telegram'
import { useStore } from '../store/transactions'
import { ACCENT_PALETTES } from './rewards'

/**
 * Управляет атрибутом `.dark` на <html> в зависимости от themeMode:
 *   'auto'  → следует за Telegram.colorScheme (или prefers-color-scheme).
 *   'light' → принудительно светлая.
 *   'dark'  → принудительно тёмная.
 *
 * Подписывается на событие Telegram themeChanged, чтобы переключаться
 * на лету. Также синхронизирует цвет шапки/бэкграунда Telegram.
 */
export function useTheme() {
  const mode = useStore((s) => s.themeMode)

  useEffect(() => {
    const apply = () => {
      let isDark: boolean
      if (mode === 'dark') isDark = true
      else if (mode === 'light') isDark = false
      else {
        // auto
        const fromTg = tg.webApp?.colorScheme
        if (fromTg) isDark = fromTg === 'dark'
        else isDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
      }

      document.documentElement.classList.toggle('dark', isDark)
      syncTelegramChrome(isDark)
    }

    apply()

    let unsubscribe = () => {}
    let mediaCleanup = () => {}

    if (mode === 'auto') {
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

  useEffect(() => {
    const root = document.documentElement
    const palette = ACCENT_PALETTES[accent]
    const shades = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const

    if (!palette || accent === 'accent_mint') {
      // дефолт — убираем инлайновые оверрайды
      for (const sh of shades) root.style.removeProperty(`--brand-${sh}`)
      return
    }
    for (const sh of shades) root.style.setProperty(`--brand-${sh}`, palette[sh])
  }, [accent])
}
