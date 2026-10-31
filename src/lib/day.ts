/**
 * Работа с «днём» как с локальной полночью.
 *
 * Единая трактовка дня на всё приложение: серия входов, ритм недели, разбивка
 * по дням в «Обзоре». Держим её в одном месте — если где-то завести вторую,
 * суммы на соседних блоках одного экрана разойдутся на границе суток.
 *
 * Здесь намеренно нет dayjs: эти функции зовут в циклах по всем операциям, а
 * dayjs создаёт объект на каждый вызов — на порядок дороже голого Date.
 */

export const DAY_MS = 86400000

/** Локальная полночь того дня, в который попадает момент времени. */
export function localDayKey(at: number): number {
  const d = new Date(at)
  d.setHours(0, 0, 0, 0)
  return +d
}

/**
 * Предыдущий календарный день. Через Date, а не вычитание суток: переход на
 * летнее время сдвигает сутки, и арифметика по миллисекундам промахнулась бы.
 */
export function prevDayKey(key: number): number {
  const d = new Date(key)
  d.setDate(d.getDate() - 1)
  d.setHours(0, 0, 0, 0)
  return +d
}

/** Следующий календарный день. Через Date по той же причине, что и prevDayKey. */
export function nextDayKey(key: number): number {
  const d = new Date(key)
  d.setDate(d.getDate() + 1)
  d.setHours(0, 0, 0, 0)
  return +d
}

/**
 * Сколько календарных дней прошло от `fromKey` до `key`. Округление, а не
 * усечение: в сутки перевода часов между двумя полуночами не ровно 24 часа.
 */
export function daysBetween(fromKey: number, key: number): number {
  return Math.round((key - fromKey) / DAY_MS)
}


/**
 * Дата операции («ГГГГ-ММ-ДД») как ЛОКАЛЬНАЯ полночь.
 *
 * Так делать обязательно, и вот почему. `Date.parse('2026-08-01')` по
 * спецификации разбирает дату БЕЗ времени как полночь UTC. Границы периодов
 * приложение строит через dayjs — а это полночь ЛОКАЛЬНАЯ. Восточнее Гринвича
 * разницы не видно, но западнее операция за первое число оказывается раньше
 * начала месяца и выпадает из него: в Нью-Йорке август показывал 300 € вместо
 * 400 €, а первое августа утекало в июль.
 *
 * Возвращает NaN для мусора — вызывающая сторона проверяет Number.isFinite.
 *
 * С кэшем по строке: селекторы разбирают даты всех операций на каждый пересчёт
 * (десятки тысяч вызовов при запуске на ~2 400 записях), а разных дней в них
 * — сотни. Локальная полночь требует пересчёта часового пояса в `new Date` —
 * это и было дорого. Полночь каждого дня Date считает с поправкой на летнее
 * время сам, поэтому кэш нужно сбрасывать только при смене пояса устройства
 * (перелёт): main.tsx проверяет это при каждом возвращении в приложение.
 */
const dayCache = new Map<string, number>()
let cacheOffset = new Date().getTimezoneOffset()

export function parseDay(iso: string): number {
  let v = dayCache.get(iso)
  if (v !== undefined) return v
  if (dayCache.size > 20000) dayCache.clear()
  const y = +iso.slice(0, 4)
  const m = +iso.slice(5, 7)
  const d = +iso.slice(8, 10)
  v = !y || !m || !d ? NaN : +new Date(y, m - 1, d)
  dayCache.set(iso, v)
  return v
}

/** Пояс устройства сменился (перелёт) — старые полуночи уже не те. */
export function resetDayCacheIfZoneChanged() {
  const off = new Date().getTimezoneOffset()
  if (off !== cacheOffset) {
    cacheOffset = off
    dayCache.clear()
  }
}

/** День недели с понедельника: 0 = пн … 6 = вс. */
export function weekdayIndex(key: number): number {
  return (new Date(key).getDay() + 6) % 7
}
