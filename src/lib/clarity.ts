/// <reference types="vite/client" />
import { tg } from './telegram'
import { useStore } from '../store/transactions'

/**
 * Microsoft Clarity — записи сессий и тепловые карты для владельца
 * (clarity.microsoft.com, проект «Кошель»).
 *
 * Скрипт грузится после первого кадра, в простое: стартовый бандл и первая
 * отрисовка от него не зависят. Только сборка для прода и только внутри
 * Telegram; человек выключает запись в Настройках («Помогать улучшать Кошель»).
 *
 * На записи видны экраны, нажатия и прокрутка. В Clarity не уходит (скрыто ещё
 * на устройстве): всё, что вводят в поля (их Clarity маскирует всегда), цифры
 * (режим маскировки Balanced — в настройках проекта его не ослаблять) и всё,
 * что помечено `MASK`: суммы, заметки, имена, цели и активы, разговор с
 * ассистентом. Меняешь объём — правь `settings.clarity_hint` и `settings.about_clarity`.
 *
 * Найти человека в Clarity: фильтр «Custom user ID» = его id Telegram (тот же,
 * что в админке); в списке записей он подписан этим id. Метки (фильтр «Custom
 * tags»): platform, source, lang, ops, owner, onboarding. События — `clarityEvent`.
 */
// Номер проекта (clarity.microsoft.com → Settings → Overview → Project ID) — не
// секрет: он и так виден в коде страницы. VITE_CLARITY_ID — для проверочных сборок.
// Тот же номер — CLARITY_PROJECT в админке воркера.
export const CLARITY_ID: string = import.meta.env.VITE_CLARITY_ID || 'z50dung9vo'

const OFF_KEY = 'koshel:clarity'
const OWNER_ID = 439944083

type ClarityFn = ((...args: unknown[]) => void) & { q?: unknown[] }
declare global {
  interface Window {
    clarity?: ClarityFn
  }
}

/**
 * Скрыть содержимое элемента и его потомков на записях: `<span {...MASK}>`.
 * Вся страница и так скрыта (`data-clarity-mask` на `<body>` в index.html):
 * режим Balanced сумм не прячет — «Потрачено 321 $ из 10,000 $» уходил как
 * есть. MASK у сумм, заметок и имён — вторая линия, если их родителя откроют.
 */
export const MASK = { 'data-clarity-mask': 'true' } as const

/**
 * Показать на записях неизменный интерфейс: панель вкладок, заголовки экранов
 * и разделов, тексты и кнопки быстрого старта. Только там, где нет данных
 * человека — ни сумм, ни имён, ни заметок.
 */
export const UNMASK = { 'data-clarity-unmask': 'true' } as const

/** Проект задан, сборка для прода и запущено в Telegram — есть что включать. */
export function clarityAvailable(): boolean {
  return Boolean(CLARITY_ID) && import.meta.env.PROD && tg.isInTelegram
}

/** Запись разрешена на этом устройстве (по умолчанию — да). */
export function clarityAllowed(): boolean {
  try {
    return localStorage.getItem(OFF_KEY) !== '0'
  } catch {
    return true
  }
}

let started = false
// Остановленную в этом запуске запись заново не поднимаем: скрипт Clarity
// второй раз не стартует — включится со следующего запуска.
let stopped = false

function call(...args: unknown[]) {
  if (started) window.clarity?.(...args)
}

/** Откуда пришёл: приглашение, канал, рекламная метка или напрямую. */
function sourceOf(param: string | null): string {
  if (!param) return 'direct'
  if (/^ref\d+$/.test(param)) return 'ref'
  return param.slice(0, 32)
}

function opsBucket(n: number): string {
  if (n === 0) return '0'
  if (n < 5) return '1-4'
  if (n < 20) return '5-19'
  return '20+'
}

/**
 * Запустить запись. Очередь вызовов — сразу (события с первого экрана не
 * теряются), сам скрипт Clarity — в простое после первого кадра.
 */
export function startClarity() {
  if (started || stopped || !clarityAvailable() || !clarityAllowed()) return
  started = true
  // Стандартная заглушка Clarity: копит вызовы, пока не загрузился скрипт.
  const w = window
  w.clarity =
    w.clarity ||
    function (...args: unknown[]) {
      const fn = w.clarity as ClarityFn
      ;(fn.q = fn.q || []).push(args)
    }

  const user = tg.user
  if (user) call('identify', String(user.id), undefined, undefined, String(user.id))
  const s = useStore.getState()
  call('set', 'platform', tg.webApp?.platform ?? 'unknown')
  call('set', 'source', sourceOf(tg.startParam))
  call('set', 'lang', s.lang)
  call('set', 'ops', opsBucket(s.transactions.length))
  if (user?.id === OWNER_ID) call('set', 'owner', 'yes')

  const load = () => {
    const el = document.createElement('script')
    el.async = true
    el.src = `https://www.clarity.ms/tag/${CLARITY_ID}`
    document.head.appendChild(el)
  }
  const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
    .requestIdleCallback
  if (ric) ric(load, { timeout: 4000 })
  else setTimeout(load, 2000)
}

/** Событие в записи — фильтр «Smart events» в Clarity. Без Clarity ничего не делает. */
export function clarityEvent(name: string) {
  call('event', name)
}

/** Метка сессии — фильтр «Custom tags». Повторный вызов с тем же ключом добавляет значение. */
export function clarityTag(key: string, value: string) {
  call('set', key, value)
}

/** Сохранить запись этой сессии наверняка (Clarity прореживает их только сверх 100 000 в день). */
export function clarityKeep(reason: string) {
  call('upgrade', reason)
}

/**
 * Тумблер в Настройках. Выключили — запись останавливается сразу; включили —
 * начинается сейчас, если в этом запуске ещё не шла, иначе со следующего.
 */
export function setClarityAllowed(on: boolean) {
  try {
    if (on) localStorage.removeItem(OFF_KEY)
    else localStorage.setItem(OFF_KEY, '0')
  } catch {
    // приватный режим — выбор живёт до закрытия
  }
  if (!on && started) {
    call('stop')
    started = false
    stopped = true
  } else if (on) startClarity()
}
