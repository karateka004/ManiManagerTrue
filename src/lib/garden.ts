/**
 * Мини-игра «Сад»: дерево, которое растёт от активности в приложении.
 *
 * Идея: сад — не отдельная экономика, а витрина уже существующего прогресса.
 * Рост считается из XP (он и так капает за операции), полив — это ежедневная
 * серия (`lib/streak.ts`), улучшения тратят обычные монеты, редкие элементы
 * открываются за достижения, которые приложение и так считает. Никакой новой
 * валюты и никакого второго ежедневного обязательства.
 *
 * Здесь только чистые функции — ни React, ни стора.
 */

/** Пока игра в закрытом тестировании: доступ по Telegram id. */
export const GARDEN_TESTERS = [439944083]

export function isGardenTester(userId?: number): boolean {
  return typeof userId === 'number' && GARDEN_TESTERS.includes(userId)
}

/** Состояние сада в сторе. */
export interface GardenState {
  /** ISO-дата посадки семечка; null — ещё не посажено. */
  plantedAt: string | null
  /** XP на момент посадки: рост считаем от прироста, а не от всей истории. */
  seedXp: number
  /** Разовый стартовый рывок за уже накопленный уровень. */
  boost: number
  /** Купленные улучшения. */
  upgrades: string[]
  /** Открытые редкие элементы. */
  unlocked: string[]
  /** Последняя стадия, которую пользователь уже видел (для «дерево выросло!»). */
  seenStage: number
}

export const EMPTY_GARDEN: GardenState = {
  plantedAt: null,
  seedXp: 0,
  boost: 0,
  upgrades: [],
  unlocked: [],
  seenStage: 0,
}

/**
 * Пороги роста. Первые стадии проходятся за дни, поздние — за месяцы:
 * активный пользователь (~30 операций в месяц ≈ 360 XP) добирается до финала
 * примерно за 8 месяцев. Быстрый старт даёт ощущение отдачи сразу.
 */
export const STAGE_THRESHOLDS = [0, 40, 120, 280, 600, 1100, 1900, 3000, 4500]
export const MAX_STAGE = STAGE_THRESHOLDS.length - 1

/** Стартовый рывок при посадке: не больше 3-й стадии, чтобы осталось куда расти. */
export function plantBoost(xp: number): number {
  return Math.min(Math.round(xp * 0.25), STAGE_THRESHOLDS[3])
}

export interface UpgradeDef {
  id: string
  price: number
  /** Прибавка к множителю роста (0.1 = +10%). */
  growth?: number
  /** Прибавка к монетам за полив (0.05 = +5%). */
  coins?: number
  /** Серия переживает один пропущенный день. */
  shield?: boolean
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'leaves', price: 50, growth: 0.1 },
  { id: 'water', price: 100, growth: 0.2 },
  { id: 'roots', price: 150, shield: true },
  { id: 'stones', price: 250, coins: 0.05 },
]

export const getUpgrade = (id: string) => UPGRADES.find((u) => u.id === id)

/** Множитель роста от купленных улучшений. */
export function growthMultiplier(upgrades: string[]): number {
  return UPGRADES.reduce((k, u) => (upgrades.includes(u.id) ? k + (u.growth ?? 0) : k), 1)
}

/** Надбавка к монетам за полив. */
export function coinBonus(upgrades: string[]): number {
  return UPGRADES.reduce((k, u) => (upgrades.includes(u.id) ? k + (u.coins ?? 0) : k), 0)
}

/** Куплен ли «щит серии» (крепкие корни). */
export const hasStreakShield = (upgrades: string[]) => upgrades.includes('roots')

/** Накопленный рост дерева. */
export function growthOf(g: GardenState, xp: number): number {
  if (!g.plantedAt) return 0
  const gained = Math.max(0, xp - g.seedXp)
  return Math.round(gained * growthMultiplier(g.upgrades) + g.boost)
}

export interface StageProgress {
  stage: number
  growth: number
  /** Прогресс внутри стадии, 0..1. */
  ratio: number
  /** Сколько роста осталось до следующей стадии (0 на максимуме). */
  toNext: number
  isMax: boolean
}

export function stageOf(growth: number): StageProgress {
  let stage = 0
  for (let i = 0; i < STAGE_THRESHOLDS.length; i++) {
    if (growth >= STAGE_THRESHOLDS[i]) stage = i
  }
  const isMax = stage >= MAX_STAGE
  if (isMax) return { stage, growth, ratio: 1, toNext: 0, isMax: true }

  const from = STAGE_THRESHOLDS[stage]
  const to = STAGE_THRESHOLDS[stage + 1]
  return {
    stage,
    growth,
    ratio: Math.min(1, Math.max(0, (growth - from) / (to - from))),
    toNext: to - growth,
    isMax: false,
  }
}

/** Метрики для редких элементов — всё это приложение уже считает. */
export interface GardenMetrics {
  streakBest: number
  transactions: number
  goalsReached: number
  budgetMonthKept: boolean
  level: number
  referrals: number
  stage: number
}

export interface UnlockDef {
  id: string
  /** Спрайт декора в сцене. */
  sprite: string
  test: (m: GardenMetrics) => boolean
}

export const UNLOCKS: UnlockDef[] = [
  { id: 'mushrooms', sprite: 'decor-mushroom-mid', test: (m) => m.streakBest >= 7 },
  { id: 'stones', sprite: 'decor-stones', test: (m) => m.transactions >= 50 },
  { id: 'crystal', sprite: 'decor-crystal', test: (m) => m.goalsReached >= 1 },
  { id: 'mushroom_big', sprite: 'decor-mushroom-big', test: (m) => m.streakBest >= 30 },
  { id: 'sign', sprite: 'decor-sign', test: (m) => m.level >= 7 },
  { id: 'chest', sprite: 'decor-chest', test: (m) => m.budgetMonthKept },
  { id: 'mushroom_small', sprite: 'decor-mushroom-small', test: (m) => m.referrals >= 3 },
]

/** Какие элементы уже заслужены, но ещё не открыты. */
export function pendingUnlocks(g: GardenState, m: GardenMetrics): string[] {
  return UNLOCKS.filter((u) => !g.unlocked.includes(u.id) && u.test(m)).map((u) => u.id)
}

export const getUnlock = (id: string) => UNLOCKS.find((u) => u.id === id)
