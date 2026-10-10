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
  /** Версия Bot API клиента и проверка «не ниже». */
  version?: string
  isVersionAtLeast?: (version: string) => boolean
  /** Bot API 6.2+: родное окно подтверждения клиента. */
  showConfirm?: (message: string, callback?: (ok: boolean) => void) => void
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
 * «Назад» для вложенных экранов и шторок: системная кнопка Telegram и Escape.
 *
 * Обработчики — стопкой: нажатие закрывает только верхний слой (шторку над
 * Магазином, а не Магазин вместе с ней). Кнопка видна, пока в стопке кто-то
 * есть. Telegram вызывает все подписанные обработчики, поэтому подписываемся
 * один раз и сами выбираем верхний.
 *
 * Стопка живёт и без Telegram (браузер, старый клиент): по ней работает
 * Escape. Раньше каждая шторка слушала Escape сама, и одно нажатие закрывало
 * сразу обе — редактор категорий вместе со шторкой операции под ним.
 */
interface BackEntry {
  fn: () => void
  /** Шторка или экран поверх всего: Escape закрывает её и из поля ввода. */
  modal: boolean
}
const backStack: BackEntry[] = []
let backBound = false
let escapeBound = false
function onBack() {
  backStack[backStack.length - 1]?.fn()
}
function onEscape(e: KeyboardEvent) {
  if (e.key !== 'Escape' || e.defaultPrevented || backStack.length === 0) return
  e.preventDefault()
  // На вложенном экране (Настройки) Escape в поле ввода сначала только выводит
  // из поля: человек мог передумать печатать, а уход с экрана стёр бы
  // набранное. Шторку Escape закрывает сразу — как любое модальное окно.
  const el = e.target instanceof HTMLElement ? e.target : null
  const editing =
    !!el && (el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')
  if (editing && !backStack[backStack.length - 1].modal) {
    el!.blur()
    return
  }
  onBack()
}
export function pushBackHandler(fn: () => void, modal = false): () => void {
  const entry: BackEntry = { fn, modal }
  backStack.push(entry)
  if (!escapeBound && typeof window !== 'undefined') {
    window.addEventListener('keydown', onEscape)
    escapeBound = true
  }
  const bb = tg.webApp?.BackButton
  if (bb) {
    try {
      if (!backBound) {
        bb.onClick(onBack)
        backBound = true
      }
      bb.show()
    } catch {
      /* старый клиент без BackButton */
    }
  }
  return () => {
    const i = backStack.lastIndexOf(entry)
    if (i >= 0) backStack.splice(i, 1)
    if (backStack.length === 0 && bb) {
      try {
        bb.hide()
      } catch {
        /* старый клиент */
      }
    }
  }
}

/**
 * Подтверждение действия («Удалить цель?»). В Telegram — родное окно клиента
 * (`showConfirm`, Bot API 6.2+): `window.confirm` в WebView мини-аппа есть не
 * везде и может молча вернуть «нет» — и тогда, например, из быстрого старта
 * было бы не выйти. Вне Telegram и в старых клиентах — обычный confirm.
 */
export function confirmAction(message: string): Promise<boolean> {
  const wa = tg.webApp
  if (wa?.showConfirm && wa.isVersionAtLeast?.('6.2')) {
    return new Promise((resolve) => {
      try {
        // У окна Telegram потолок — 256 символов.
        wa.showConfirm!(message.slice(0, 256), (ok) => resolve(!!ok))
      } catch {
        // Окно клиента уже открыто (двойной тап по «Удалить») — второе не
        // показываем: считаем, что человек не подтвердил.
        resolve(false)
      }
    })
  }
  return Promise.resolve(window.confirm(message))
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
