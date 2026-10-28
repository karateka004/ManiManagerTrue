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
  /** Bot API 7.10+: цвет нижней полосы Telegram под приложением. */
  setBottomBarColor?: (color: string) => void
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
  /** Клиент Telegram: ios, android, tdesktop, macos, weba, webk… */
  platform?: string
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
      /** Бот может писать человеку в личку (нажимал Start или разрешил). */
      allows_write_to_pm?: boolean
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
  /** Bot API 6.9+: родное окно «разрешить боту писать вам». */
  requestWriteAccess?: (callback?: (granted: boolean) => void) => void
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

/**
 * Цвета Telegram вокруг приложения — под тему: шапка, фон под страницей и
 * нижняя полоса (Bot API 7.10). Фон — ровно фон страницы (--c-surface в
 * index.css): иначе на стыке видна полоса другого оттенка. Тёмная тема бывает
 * и при светлом Telegram — без нижней полосы под цвет снизу оставалась бы
 * светлая плашка.
 */
export function syncTelegramChrome(isDark: boolean) {
  const wa = tg.webApp
  if (!wa) return
  const bg = isDark ? '#0E0F0E' : '#F6F6F3'
  try {
    wa.setHeaderColor(isDark ? bg : '#3CA37B')
    wa.setBackgroundColor(bg)
    if (wa.setBottomBarColor && wa.isVersionAtLeast?.('7.10')) wa.setBottomBarColor(bg)
  } catch {
    /* older clients */
  }
}

/* ---------- Разрешение боту писать ---------- */

const BOT_WRITE_KEY = 'koshel:botWrite'

/**
 * Может ли бот написать человеку. Без этого напоминания не доходят: кто открыл
 * мини-апп по ссылке и ни разу не нажимал Start в чате, получает от Telegram
 * отказ (403) на первое же сообщение. initData фиксируется при запуске, поэтому
 * разрешение, выданное в этой сессии, помним сами.
 */
export function botCanWrite(): boolean {
  if (tg.webApp?.initDataUnsafe?.user?.allows_write_to_pm === true) return true
  try {
    return localStorage.getItem(BOT_WRITE_KEY) === '1'
  } catch {
    return false
  }
}

/** Telegram умеет спросить разрешение сам (Bot API 6.9+). */
export function canRequestBotWrite(): boolean {
  const wa = tg.webApp
  return !!wa?.requestWriteAccess && !!wa.isVersionAtLeast?.('6.9')
}

let writeRequest: Promise<boolean> | null = null

/**
 * Родное окно Telegram «Разрешить боту писать вам?». true — разрешил (или уже
 * было). Окно уже открыто (двойной тап) — ждём тот же ответ, второго окна нет:
 * Telegram на повторный вызов бросает исключение.
 */
export function requestBotWrite(): Promise<boolean> {
  if (botCanWrite()) return Promise.resolve(true)
  const wa = tg.webApp
  if (!wa?.requestWriteAccess || !canRequestBotWrite()) return Promise.resolve(false)
  if (writeRequest) return writeRequest
  writeRequest = new Promise<boolean>((resolve) => {
    try {
      wa.requestWriteAccess!((granted) => {
        if (granted) {
          try {
            localStorage.setItem(BOT_WRITE_KEY, '1')
          } catch {
            /* приватный режим — спросим ещё раз в следующий запуск */
          }
        }
        resolve(!!granted)
      })
    } catch {
      resolve(false)
    }
  }).finally(() => {
    writeRequest = null
  })
  return writeRequest
}

