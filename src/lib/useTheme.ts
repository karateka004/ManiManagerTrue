import { useEffect } from 'react'
import { tg, onThemeChange, syncTelegramChrome } from './telegram'
import { useStore } from '../store/transactions'

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
