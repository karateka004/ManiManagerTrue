/**
 * Ежедневная серия («стрик») — движок ретеншена: заходи каждый день,
 * забирай награду, не пропускай — иначе серия сгорает.
 *
 * Хранится в сторе: streak { count, best, lastClaim }.
 * lastClaim — дата последнего забора в формате YYYY-MM-DD.
 */

import dayjs from 'dayjs'

export interface StreakState {
  count: number
  best: number
  /** YYYY-MM-DD последнего клейма или null. */
  lastClaim: string | null
}

export interface StreakReward {
  coins: number
  xp: number
  /** Если день — рубеж (3/7/14/30), его значение; иначе 0. */
  milestone: number
}

const dayKey = (d = dayjs()) => d.format('YYYY-MM-DD')

/** Рубежи серии и их бонусы (сверх базовой ежедневной награды). */
const MILESTONES: Record<number, { coins: number; xp: number }> = {
  3: { coins: 10, xp: 0 },
  7: { coins: 25, xp: 20 },
  14: { coins: 50, xp: 40 },
  30: { coins: 120, xp: 100 },
}

/** Ближайшие рубежи (для подсказки в UI). */
export const STREAK_MILESTONES = [3, 7, 14, 30]

/** Награда за день серии с номером count (1-based). */
export function streakReward(count: number): StreakReward {
  const base = { coins: 5, xp: 2 }
  const m = MILESTONES[count]
  return {
    coins: base.coins + (m?.coins ?? 0),
    xp: base.xp + (m?.xp ?? 0),
    milestone: m ? count : 0,
  }
}

/** Можно ли забрать сегодня (ещё не забирали). */
export function canClaim(s: StreakState, now = dayjs()): boolean {
  return s.lastClaim !== dayKey(now)
}

/**
 * Чистый расчёт следующего состояния серии при заборе.
 * Возвращает null, если сегодня уже забирали (no-op).
 */
export function nextStreak(
  s: StreakState,
  now = dayjs(),
  freezes = 0,
): { state: StreakState; reward: StreakReward; frozen: string[] } | null {
  const today = dayKey(now)
  if (s.lastClaim === today) return null

  const yesterday = dayKey(now.subtract(1, 'day'))
  let continued = s.lastClaim === yesterday
  // Заморозки серии (адвент): пропущенные дни, если на каждый есть заморозка,
  // серию не рвут — их даты возвращаются в frozen, чтобы потратить заморозки.
  const frozen: string[] = []
  const gap = missedDays(s, now)
  if (!continued && gap > 0 && gap <= freezes) {
    for (let i = gap; i >= 1; i--) frozen.push(dayKey(now.subtract(i, 'day')))
    continued = true
  }
  const count = continued ? s.count + 1 : 1
  const reward = streakReward(count)

  return {
    state: { count, best: Math.max(s.best, count), lastClaim: today },
    reward,
    frozen,
  }
}

/** Сколько дней пропущено с последнего забора (вчера забирали — 0; серии нет — 0). */
export function missedDays(s: StreakState, now = dayjs()): number {
  if (!s.lastClaim || s.count <= 0) return 0
  const last = dayjs(s.lastClaim)
  if (!last.isValid()) return 0
  // round: сутки перехода на зимнее время длиннее 24 часов.
  const diff = Math.round((now.startOf('day').valueOf() - last.startOf('day').valueOf()) / 86_400_000)
  return Math.max(0, diff - 1)
}

/**
 * Актуализирует серию для отображения: если последний клейм был раньше,
 * чем вчера, серия фактически прервана (count визуально = 0 до клейма).
 * Не мутирует стор — только для UI-логики «сгорела/активна».
 */
export function effectiveStreak(s: StreakState, now = dayjs(), freezes = 0): number {
  if (!s.lastClaim) return 0
  const today = dayKey(now)
  const yesterday = dayKey(now.subtract(1, 'day'))
  if (s.lastClaim === today || s.lastClaim === yesterday) return s.count
  // Пропуск, который закроют заморозки, серию не гасит.
  const gap = missedDays(s, now)
  if (gap > 0 && gap <= freezes) return s.count
  return 0
}

/** Следующий рубеж после текущего значения серии. */
export function nextMilestone(count: number): number | null {
  return STREAK_MILESTONES.find((m) => m > count) ?? null
}

/**
 * Семь последних дней, сегодня — последним: true, если день входит в живую
 * серию. Серия — это `count` дней подряд, заканчивая днём `lastClaim`.
 * Используют полоски серии на «Прогрессе» и рамка «Неделя».
 */
export function streakWeek(s: StreakState, now = dayjs(), freezes = 0): boolean[] {
  const count = effectiveStreak(s, now, freezes) > 0 ? s.count : 0
  const out: boolean[] = []
  const last = s.lastClaim ? dayjs(s.lastClaim).startOf('day') : null
  const today = now.startOf('day')
  for (let i = 6; i >= 0; i--) {
    if (!last || count <= 0) {
      out.push(false)
      continue
    }
    const back = last.diff(today.subtract(i, 'day'), 'day')
    out.push(back >= 0 && back < count)
  }
  return out
}
