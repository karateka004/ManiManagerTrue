/**
 * Задания («квесты») — фиксированный борд из 6:
 *   - 3 обычных (main): подписка на канал, первая операция, 10 операций;
 *   - 3 «спешел» (special, реферальные): пригласить 1 / 3 / 5 друзей.
 *
 * Прогресс из реальных метрик: число операций (transactions), число приглашённых
 * (referrals), подписка на канал (subscribe). За выполнение дают XP и монеты —
 * см. claimQuest() в сторе (начисляется один раз). Цепочки/ротации нет: забранные
 * задания остаются на борде как «получено». Тексты — из i18n (`quest.<id>.title/.desc`).
 */

export type QuestMetric = 'transactions' | 'referrals' | 'subscribe'
export type QuestGroup = 'main' | 'special'

export interface QuestDef {
  id: string
  /** Что измеряем. */
  metric: QuestMetric
  /** Цель (порог выполнения). */
  goal: number
  /** Награда. */
  xp: number
  coins: number
  /** Эмодзи-иконка. */
  icon: string
  /** Группа на борде: обычные / спешел. */
  group: QuestGroup
  /** Внешнее действие (для подписки — ссылка на канал). */
  actionUrl?: string
}

export interface QuestMetrics {
  transactions: number
  referrals: number
  subscribed: boolean
}

export const QUESTS: QuestDef[] = [
  // ── Обычные ──────────────────────────────────────────────
  {
    id: 'subscribe_channel',
    metric: 'subscribe',
    goal: 1,
    xp: 50,
    coins: 20,
    icon: '📣',
    group: 'main',
    actionUrl: 'https://t.me/Svyat_research',
  },
  { id: 'first_tx', metric: 'transactions', goal: 1, xp: 30, coins: 10, icon: '✍️', group: 'main' },
  { id: 'tx_10', metric: 'transactions', goal: 10, xp: 120, coins: 28, icon: '🧾', group: 'main' },
  // ── Спешел (реферальные) ─────────────────────────────────
  { id: 'invite_1', metric: 'referrals', goal: 1, xp: 60, coins: 5, icon: '🤝', group: 'special' },
  { id: 'invite_3', metric: 'referrals', goal: 3, xp: 120, coins: 10, icon: '🚀', group: 'special' },
  { id: 'invite_5', metric: 'referrals', goal: 5, xp: 250, coins: 20, icon: '👑', group: 'special' },
]

export interface QuestProgress {
  def: QuestDef
  /** Текущее значение метрики (ограничено целью для отображения). */
  current: number
  /** Доля выполнения 0..1. */
  ratio: number
  /** Условие выполнено. */
  done: boolean
  /** Награда уже забрана. */
  claimed: boolean
  /** Можно нажать «Забрать» (выполнено и не забрано). */
  claimable: boolean
}

function metricValue(def: QuestDef, m: QuestMetrics): number {
  switch (def.metric) {
    case 'transactions':
      return m.transactions
    case 'referrals':
      return m.referrals
    case 'subscribe':
      return m.subscribed ? 1 : 0
  }
}

/** Прогресс по всем заданиям (все видимы; забранные остаются на борде как «получено»). */
export function allQuestProgress(metrics: QuestMetrics, claimedQuests: string[]): QuestProgress[] {
  return QUESTS.map((def) => {
    const raw = metricValue(def, metrics)
    const current = Math.min(raw, def.goal)
    const done = raw >= def.goal
    const claimed = claimedQuests.includes(def.id)
    return {
      def,
      current,
      ratio: def.goal > 0 ? Math.min(1, raw / def.goal) : 1,
      done,
      claimed,
      claimable: done && !claimed,
    }
  })
}
