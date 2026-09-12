/**
 * Система уровней («геймификация»).
 *
 * XP пока начисляется за активность (количество операций) + бонусы
 * (рефералы, будущие задания — поле bonusXp в сторе). Когда появятся
 * задания, они будут добавлять bonusXp через addXp().
 */

export interface LevelDef {
  level: number
  title: string
  /** Минимальный XP, с которого начинается уровень. */
  minXp: number
  /** Бейдж-эмодзи (косметика статуса). */
  badge: string
}

export const LEVELS: LevelDef[] = [
  { level: 1, title: 'Новичок', minXp: 0, badge: '🌱' },
  { level: 2, title: 'Счетовод', minXp: 60, badge: '📒' },
  { level: 3, title: 'Бережливый', minXp: 180, badge: '🪙' },
  { level: 4, title: 'Финансист', minXp: 400, badge: '💼' },
  { level: 5, title: 'Капиталист', minXp: 750, badge: '📈' },
  { level: 6, title: 'Магнат', minXp: 1300, badge: '👑' },
  { level: 7, title: 'Легенда', minXp: 2200, badge: '🏆' },
  { level: 8, title: 'Магистр финансов', minXp: 3500, badge: '🎓' },
  { level: 9, title: 'Олигарх', minXp: 5200, badge: '💎' },
  { level: 10, title: 'Император', minXp: 7500, badge: '🏛️' },
]

/** XP за одну операцию. */
export const XP_PER_TRANSACTION = 12

export interface LevelProgress {
  level: number
  title: string
  badge: string
  xp: number
  /** XP, набранный внутри текущего уровня. */
  xpIntoLevel: number
  /** Сколько XP всего нужно пройти на этом уровне до следующего. */
  xpForLevel: number
  /** Прогресс 0..1 внутри уровня. */
  ratio: number
  /** XP до следующего уровня (0, если максимум). */
  toNext: number
  isMax: boolean
}

/** Вычисляет суммарный XP из активности и бонусов. */
export function computeXp(transactionCount: number, bonusXp = 0): number {
  return transactionCount * XP_PER_TRANSACTION + Math.max(0, bonusXp)
}

export function levelFor(xp: number): LevelProgress {
  let idx = 0
  for (let i = 0; i < LEVELS.length; i++) {
    if (xp >= LEVELS[i].minXp) idx = i
  }
  const cur = LEVELS[idx]
  const next = LEVELS[idx + 1]
  const isMax = !next

  if (isMax) {
    return {
      level: cur.level,
      title: cur.title,
      badge: cur.badge,
      xp,
      xpIntoLevel: xp - cur.minXp,
      xpForLevel: xp - cur.minXp || 1,
      ratio: 1,
      toNext: 0,
      isMax: true,
    }
  }

  const xpForLevel = next.minXp - cur.minXp
  const xpIntoLevel = xp - cur.minXp
  return {
    level: cur.level,
    title: cur.title,
    badge: cur.badge,
    xp,
    xpIntoLevel,
    xpForLevel,
    ratio: Math.min(1, xpIntoLevel / xpForLevel),
    toNext: Math.max(0, next.minXp - xp),
    isMax: false,
  }
}
