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

/**
 * Сколько календарных дней прошло от `fromKey` до `key`. Округление, а не
 * усечение: в сутки перевода часов между двумя полуночами не ровно 24 часа.
 */
export function daysBetween(fromKey: number, key: number): number {
  return Math.round((key - fromKey) / DAY_MS)
}

/** День недели с понедельника: 0 = пн … 6 = вс. */
export function weekdayIndex(key: number): number {
  return (new Date(key).getDay() + 6) % 7
}
