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
  /** Сырая подписанная строка для валидации на бэкенде. */
  initData?: string
  initDataUnsafe?: {
    user?: {
      id: number
      first_name?: string
      last_name?: string
      username?: string
      photo_url?: string
      language_code?: string
    }
    /** Параметр из deep-link (?startapp=… или ?start=…). */
    start_param?: string
  }
  openLink: (url: string, options?: { try_instant_view?: boolean }) => void
  openTelegramLink: (url: string) => void
  /** Bot API 7.7+: вертикальный свайп сворачивает мини-апп — его можно выключить. */
  disableVerticalSwipes?: () => void
  enableVerticalSwipes?: () => void
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
  /** Сырая подписанная initData (для запросов к воркеру). */
  get initData(): string {
    return this.webApp?.initData ?? ''
  },
  /** start_param из deep-link (используется для рефералов). */
  get startParam(): string | null {
    return this.webApp?.initDataUnsafe?.start_param ?? null
  },
}

/** Открыть внешнюю ссылку (вне Telegram — в новой вкладке). */
export function openLink(url: string) {
  const wa = tg.webApp
  if (wa?.openLink) wa.openLink(url)
  else window.open(url, '_blank', 'noopener,noreferrer')
}

/** Открыть t.me / tg ссылку внутри Telegram. */
export function openTelegramLink(url: string) {
  const wa = tg.webApp
  if (wa?.openTelegramLink) wa.openTelegramLink(url)
  else window.open(url, '_blank', 'noopener,noreferrer')
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

/**
 * Выключить сворачивание мини-аппа вертикальным свайпом, пока открыта шторка:
 * её закрывают свайпом вниз, и тот же жест иначе сворачивал бы приложение.
 * Счётчик — шторки бывают одна поверх другой (операция → редактор категорий);
 * свайп возвращается, только когда закрылась последняя. Возвращает «отпустить».
 */
let swipeLocks = 0
export function lockVerticalSwipes(): () => void {
  const wa = tg.webApp
  if (!wa?.disableVerticalSwipes || !wa.enableVerticalSwipes) return () => {}
  if (swipeLocks++ === 0) {
    try {
      wa.disableVerticalSwipes()
    } catch {
      /* старый клиент */
    }
  }
  let released = false
  return () => {
    if (released) return
    released = true
    if (--swipeLocks === 0) {
      try {
        wa.enableVerticalSwipes?.()
      } catch {
        /* старый клиент */
      }
    }
  }
}

/**
 * Системная кнопка «Назад» Telegram для вложенных экранов и шторок.
 *
 * Обработчики — стопкой: нажатие закрывает только верхний слой (шторку над
 * Магазином, а не Магазин вместе с ней). Кнопка видна, пока в стопке кто-то
 * есть. Telegram вызывает все подписанные обработчики, поэтому подписываемся
 * один раз и сами выбираем верхний.
 */
const backStack: Array<() => void> = []
let backBound = false
function onTelegramBack() {
  backStack[backStack.length - 1]?.()
}
export function pushBackHandler(fn: () => void): () => void {
  const bb = tg.webApp?.BackButton
  if (!bb) return () => {}
  backStack.push(fn)
  try {
    if (!backBound) {
      bb.onClick(onTelegramBack)
      backBound = true
    }
    bb.show()
  } catch {
    /* старый клиент без BackButton */
  }
  return () => {
    const i = backStack.lastIndexOf(fn)
    if (i >= 0) backStack.splice(i, 1)
    if (backStack.length === 0) {
      try {
        bb.hide()
      } catch {
        /* старый клиент */
      }
    }
  }
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
