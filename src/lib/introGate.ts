import { ONBOARDED_KEY, QS_KEY, TOUR_ASK_KEY, TOUR_DONE_KEY } from './introKeys'
import { useStore } from '../store/transactions'
import { tg } from './telegram'

/** Ключ persist-стора (см. store/transactions.ts) — признак, что приложением уже пользовались. */
const STORE_KEY = 'finance-mini-app:v1'

/**
 * Быстрый старт начат и не закончен: закрыли приложение посреди него (с шага
 * настроек и дальше). Если в сторе есть операции не из быстрого старта —
 * это вернувшийся с облаком, ему быстрый старт снова не показываем.
 */
function unfinishedQuickStart(): boolean {
  try {
    const v = JSON.parse(localStorage.getItem(QS_KEY) ?? 'null') as { s?: unknown; ids?: unknown; inc?: unknown } | null
    if (!v || typeof v.s !== 'number' || v.s < 1) return false
    const mine = new Set([...(Array.isArray(v.ids) ? v.ids : []), v.inc].filter((x) => typeof x === 'string'))
    return useStore.getState().transactions.every((x) => mine.has(x.id))
  } catch {
    return false
  }
}

/**
 * Нужен ли при запуске быстрый старт: совсем новый человек или незаконченный
 * быстрый старт. Решается в стартовом чанке, до загрузки components/Intro:
 * постоянным пользователям его чанк (а раньше с ним и ~25 КБ «Что нового»)
 * при каждом запуске был не нужен.
 */
export function introNeeded(): boolean {
  try {
    if (localStorage.getItem(ONBOARDED_KEY)) return false
    const hasUsedApp = !!localStorage.getItem(STORE_KEY)
    return !hasUsedApp || unfinishedQuickStart()
  } catch {
    return false
  }
}

/**
 * Уже пользовался приложением, быстрый старт не нужен — отмечаем, что он
 * пройден. Список обновлений при запуске больше не всплывает (он в Профиле,
 * о новых говорит счётчик на строке), поэтому VERSION_KEY здесь не трогаем.
 */
export function markOnboarded() {
  try {
    if (localStorage.getItem(ONBOARDED_KEY) !== '1') localStorage.setItem(ONBOARDED_KEY, '1')
  } catch {
    /* приватный режим */
  }
}

/**
 * Обучение по ссылке — проверить его самому: `?startapp=tour` в боте или
 * `?tour=1` в браузере. Показывается всем, в админку не идёт.
 */
export function tourForced(): boolean {
  try {
    if (new URLSearchParams(location.search).get('tour') === '1') return true
  } catch {
    /* нет адреса — не браузер */
  }
  return tg.startParam === 'tour'
}

/** Сколько раз предлагаем обучение повторно — не чаще раза в день. */
const TOUR_ASK_MAX = 3

function dayStart(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/**
 * Повторно предложить обучение тем, кто заходит, а записей у него так и нет
 * (2-й, 3-й, 4-й день…). Кто прошёл обучение до конца, его больше не видит;
 * остальным — не чаще раза в день и не больше трёх раз. Проверяется через пару
 * секунд после запуска: облако на новом устройстве успевает подтянуть записи.
 */
export function tourAgainDue(now = Date.now()): boolean {
  try {
    if (localStorage.getItem(ONBOARDED_KEY) !== '1' || localStorage.getItem(TOUR_DONE_KEY) === '1') return false
    const s = useStore.getState()
    if (s.demoMode || s.transactions.length > 0) return false
    const ask = JSON.parse(localStorage.getItem(TOUR_ASK_KEY) ?? 'null') as { n?: number; d?: number } | null
    return !ask || ((ask.n ?? 0) < TOUR_ASK_MAX && ask.d !== dayStart(now))
  } catch {
    return false
  }
}

/** Повторное предложение показано — считаем (раз в день, не больше трёх). */
export function markTourAsked(now = Date.now()) {
  try {
    const ask = JSON.parse(localStorage.getItem(TOUR_ASK_KEY) ?? 'null') as { n?: number } | null
    localStorage.setItem(TOUR_ASK_KEY, JSON.stringify({ n: (ask?.n ?? 0) + 1, d: dayStart(now) }))
  } catch {
    /* приватный режим */
  }
}
