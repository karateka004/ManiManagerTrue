/**
 * Thin wrapper over window.Telegram.WebApp.
 * Works inside Telegram AND in regular browser (for local dev).
 */

type HapticStyle = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'
type NotificationType = 'error' | 'success' | 'warning'

interface TelegramWebApp {
  ready: () => void
  expand: () => void
  close: () => void
  themeParams: Record<string, string>
  colorScheme: 'light' | 'dark'
  setHeaderColor: (color: string) => void
  setBackgroundColor: (color: string) => void
  onEvent: (event: string, cb: () => void) => void
  offEvent: (event: string, cb: () => void) => void
  HapticFeedback: {
    impactOccurred: (style: HapticStyle) => void
    notificationOccurred: (type: NotificationType) => void
    selectionChanged: () => void
  }
  MainButton: {
    text: string
    show: () => void
    hide: () => void
    enable: () => void
    disable: () => void
    onClick: (cb: () => void) => void
    offClick: (cb: () => void) => void
    setParams: (params: { text?: string; color?: string; text_color?: string; is_active?: boolean; is_visible?: boolean }) => void
  }
  BackButton: {
    show: () => void
    hide: () => void
    onClick: (cb: () => void) => void
    offClick: (cb: () => void) => void
  }
  initDataUnsafe?: { user?: { id: number; first_name?: string; username?: string } }
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp }
  }
}

const noopHaptic = {
  impactOccurred: () => {},
  notificationOccurred: () => {},
  selectionChanged: () => {},
}

export const tg = {
  get webApp(): TelegramWebApp | null {
    return window.Telegram?.WebApp ?? null
  },
  get isInTelegram() {
    return Boolean(window.Telegram?.WebApp?.initDataUnsafe?.user)
  },
  get haptic() {
    return this.webApp?.HapticFeedback ?? noopHaptic
  },
  get colorScheme(): 'light' | 'dark' {
    return this.webApp?.colorScheme ?? 'light'
  },
  get user() {
    return this.webApp?.initDataUnsafe?.user ?? null
  },
}

export function initTelegram() {
  const webApp = window.Telegram?.WebApp
  if (!webApp) {
    console.info('[tg] Running outside Telegram — using fallback theme')
    return
  }

  try {
    webApp.ready()
    webApp.expand()

    // Map Telegram theme params to CSS vars (useTheme переключит .dark отдельно)
    const params = webApp.themeParams
    if (params) {
      const root = document.documentElement
      Object.entries(params).forEach(([key, value]) => {
        root.style.setProperty(`--tg-theme-${key.replace(/_/g, '-')}`, value as string)
      })
    }
  } catch (e) {
    console.warn('[tg] init failed', e)
  }
}

/** Convenience hooks for common patterns */
export function hapticTap(style: HapticStyle = 'light') {
  tg.haptic.impactOccurred(style)
}

export function hapticSelect() {
  tg.haptic.selectionChanged()
}

export function hapticNotify(type: NotificationType) {
  tg.haptic.notificationOccurred(type)
}

/** Subscribe to Telegram themeChanged. Returns cleanup. Safe outside Telegram. */
export function onThemeChange(cb: () => void): () => void {
  const wa = tg.webApp
  if (!wa?.onEvent) return () => {}
  wa.onEvent('themeChanged', cb)
  return () => wa.offEvent?.('themeChanged', cb)
}

/** Update Telegram chrome colors to match current theme. */
export function syncTelegramChrome(isDark: boolean) {
  const wa = tg.webApp
  if (!wa) return
  try {
    if (isDark) {
      wa.setHeaderColor('#0F1A14')
      wa.setBackgroundColor('#0F1A14')
    } else {
      wa.setHeaderColor('#3CA37B')
      wa.setBackgroundColor('#FAFBF9')
    }
  } catch {
    /* older clients */
  }
}
