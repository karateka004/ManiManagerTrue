/**
 * Новогодний сезон: адвент-календарь и праздничный вид «Прогресса».
 *
 * Даты — по местным часам, как день серии и день операции:
 *   teaser — с 24 ноября: праздничный вид и отсчёт до первого окошка;
 *   live   — 1–31 декабря: окошко дня вместо «Серии дня» (открытое в свой
 *            день засчитывает и день серии);
 *   finale — 1–14 января: главный подарок и пропущенные окошки, серия — снова
 *            своей плиткой;
 *   off    — остальное время.
 *
 * Модуль крошечный и без dayjs: его читают стартовый чанк (Главная, панель
 * вкладок). Содержимое окошек — в lib/advent.ts, ленивым чанком.
 *
 * В сторе — список ключей `advent`: '2026-12-05' — окошко открыто в свой
 * день, '2026-12-05:late' — позже, за монеты, '2026-final' — главный подарок.
 * Списком строк — чтобы облако сливало его объединением (syncMerge), как
 * купленное и забранные задания.
 */

export type AdventPhase = 'off' | 'teaser' | 'live' | 'finale'

export interface Season {
  phase: AdventPhase
  /** Год декабря, к которому относится сезон (в январе — прошлый). */
  year: number
  /** Число декабря в live, иначе 0. */
  day: number
}

/** Окошек в календаре — весь декабрь. */
export const ADVENT_DAYS = 31
/** Сколько окошек нужно открыть, чтобы 1 января открылся главный подарок. */
export const ADVENT_FINAL_NEED = 24
/** Пропущенное окошко можно открыть позже — за монеты. */
export const ADVENT_LATE_PRICE = 30
/** С какого числа ноября сезон виден (отсчёт до первого окошка). */
const TEASER_FROM = 24
/** До какого числа января ждут главный подарок и пропущенные окошки. */
export const FINALE_TO = 14

/** Окошко, открытое позже своего дня (за монеты). */
export const LATE = ':late'

export function season(now: Date = new Date()): Season {
  const y = now.getFullYear()
  const m = now.getMonth()
  const d = now.getDate()
  if (m === 11) return { phase: 'live', year: y, day: d }
  if (m === 10 && d >= TEASER_FROM) return { phase: 'teaser', year: y, day: 0 }
  if (m === 0 && d <= FINALE_TO) return { phase: 'finale', year: y - 1, day: 0 }
  return { phase: 'off', year: y, day: 0 }
}

/** Праздничный вид включён (тизер, декабрь, первые дни января). */
export const festive = (s: Season): boolean => s.phase !== 'off'

/** Ключ окошка: '2026-12-05'. */
export const doorKey = (year: number, day: number): string => `${year}-12-${String(day).padStart(2, '0')}`

/** Ключ главного подарка: '2026-final'. */
export const finalKey = (year: number): string => `${year}-final`

/** Открыто ли окошко — в свой день или позже. */
export function isDoorOpen(advent: readonly string[], year: number, day: number): boolean {
  const k = doorKey(year, day)
  return advent.includes(k) || advent.includes(k + LATE)
}

/** Сколько окошек сезона открыто. */
export function openedCount(advent: readonly string[], year: number): number {
  let n = 0
  for (let day = 1; day <= ADVENT_DAYS; day++) if (isDoorOpen(advent, year, day)) n++
  return n
}

/**
 * Заморозка серии — подарок окошек FREEZE_DAYS: пропущенный день не обнуляет
 * серию (одна заморозка — один день). Действует, пока идёт сезон (декабрь и
 * до 14 января). Выданные считаются по открытым окошкам, потраченные — ключами
 * '2026-frz-2026-12-08' (сезон и спасённый день) в том же списке `advent`:
 * облако сливает его объединением, и день, спасённый на двух телефонах,
 * тратит одну заморозку.
 */
export const FREEZE_DAYS = [7, 21]
export const freezeKey = (year: number, missed: string): string => `${year}-frz-${missed}`

export function freezesLeft(advent: readonly string[], now: Date = new Date()): number {
  const s = season(now)
  if (s.phase !== 'live' && s.phase !== 'finale') return 0
  let n = 0
  for (const day of FREEZE_DAYS) if (isDoorOpen(advent, s.year, day)) n++
  const used = new Set(advent.filter((k) => k.startsWith(`${s.year}-frz-`))).size
  return Math.max(0, n - used)
}

/** Окошко дня ждёт: декабрь, и сегодняшнее ещё не открыто. */
export function todayDoorWaiting(advent: readonly string[], now: Date = new Date()): boolean {
  const s = season(now)
  return s.phase === 'live' && !isDoorOpen(advent, s.year, s.day)
}

/** Дней до 1 января (по местным суткам; 31 декабря — 1). */
export function daysToNewYear(now: Date = new Date()): number {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const ny = new Date(now.getFullYear() + 1, 0, 1)
  // round, а не floor: сутки перехода на зимнее время длиннее 24 часов.
  return Math.round((+ny - +today) / 86_400_000)
}

/** Дней до 1 декабря (для тизера). */
export function daysToAdvent(now: Date = new Date()): number {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dec1 = new Date(now.getFullYear(), 11, 1)
  return Math.max(0, Math.round((+dec1 - +today) / 86_400_000))
}
