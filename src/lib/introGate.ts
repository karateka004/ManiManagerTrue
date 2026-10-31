import { ONBOARDED_KEY, QS_KEY } from './introKeys'
import { useStore } from '../store/transactions'

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
