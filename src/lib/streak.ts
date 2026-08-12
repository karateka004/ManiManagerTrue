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
 *
 * `shield` — улучшение сада «крепкие корни»: серия переживает ОДИН пропущенный
 * день (последний полив позавчера), чтобы разовая занятость не обнуляла месяц.
 */
export function nextStreak(
  s: StreakState,
  now = dayjs(),
  shield = false,
): { state: StreakState; reward: StreakReward } | null {
  const today = dayKey(now)
  if (s.lastClaim === today) return null

  const yesterday = dayKey(now.subtract(1, 'day'))
  const beforeYesterday = dayKey(now.subtract(2, 'day'))
  const continued = s.lastClaim === yesterday || (shield && s.lastClaim === beforeYesterday)
  const count = continued ? s.count + 1 : 1
  const reward = streakReward(count)

  return {
    state: { count, best: Math.max(s.best, count), lastClaim: today },
    reward,
  }
}

/**
 * Актуализирует серию для отображения: если последний клейм был раньше,
 * чем вчера, серия фактически прервана (count визуально = 0 до клейма).
 * Не мутирует стор — только для UI-логики «сгорела/активна».
 */
export function effectiveStreak(s: StreakState, now = dayjs(), shield = false): number {
  if (!s.lastClaim) return 0
  const today = dayKey(now)
  const yesterday = dayKey(now.subtract(1, 'day'))
  if (s.lastClaim === today || s.lastClaim === yesterday) return s.count
  // «Крепкие корни» держат серию ещё сутки.
  if (shield && s.lastClaim === dayKey(now.subtract(2, 'day'))) return s.count
  return 0
}

/** Следующий рубеж после текущего значения серии. */
export function nextMilestone(count: number): number | null {
  return STREAK_MILESTONES.find((m) => m > count) ?? null
}
