/**
 * Задания («квесты») — конвейер, а не фиксированный борд.
 *
 * Есть пул из многих заданий; на экране показываются только БЛИЖАЙШИЕ несколько
 * невыполненных (`BOARD_SIZE`). Забрал награду — задание уходит с борта, а слот
 * уходит в перезарядку на `QUEST_COOLDOWN_MS`: вместо задания там серая плашка с
 * таймером. Через восемь часов слот открывается и на него встаёт следующее из
 * пула. Так борд не превращается в стену «✓ Получено» и есть повод вернуться.
 *
 * Порядок в пуле — это учебная программа: сначала базовое (записать операцию,
 * заглянуть в Аналитику), потом функции, которые сами по себе не находятся —
 * повтор частых трат, поиск, дневной лимит из бюджета. Поэтому пул отсортирован
 * осмысленно, а не по сложности награды.
 *
 * Прогресс считается из реальных метрик, а не из отдельных флагов: число
 * операций, приглашённых, подписка, счётчики действий (`s.events`), серия,
 * охват категорий и т. д. Награда начисляется один раз — см. claimQuest() в сторе.
 * Тексты — из i18n (`quest.<id>.title` / `.desc`).
 *
 * ВАЖНО: суммарный XP всех заданий продублирован в воркере (`XP_ALL_QUESTS` в
 * worker/src/index.ts) — он входит в потолок XP для рейтинга. Меняешь награды или
 * состав пула — поправь и там, иначе честные игроки упрутся в потолок.
 */

export type QuestMetric =
  | 'transactions'
  | 'referrals'
  | 'subscribe'
  /** Счётчик действия из `s.events` — ключ задаётся полем `event`. */
  | 'event'
  | 'streak'
  | 'categories'
  | 'logDays'
  | 'goalsReached'
  | 'budgetKept'

export type QuestGroup = 'main' | 'special'

export interface QuestDef {
  id: string
  /** Что измеряем. */
  metric: QuestMetric
  /** Ключ счётчика в `s.events` — только для metric: 'event'. */
  event?: string
  /** Цель (порог выполнения). */
  goal: number
  /** Награда. */
  xp: number
  coins: number
  /** Эмодзи-иконка. */
  icon: string
  /** Группа на борде: обычные / спешел (реферальные). */
  group: QuestGroup
  /** Внешнее действие (для подписки — ссылка на канал). */
  actionUrl?: string
}

export interface QuestMetrics {
  transactions: number
  referrals: number
  subscribed: boolean
  /** Счётчики действий-вовлечения из стора. */
  events: Record<string, number>
  /** Лучшая серия дней. */
  streak: number
  /** Сколько разных категорий использовано. */
  categories: number
  /** Сколько дней подряд ведётся учёт. */
  logDays: number
  /** Сколько целей достигнуто. */
  goalsReached: number
  /** Уложился ли в месячный бюджет (0/1). */
  budgetKept: number
}

/** Сколько заданий каждой группы показываем одновременно. */
export const BOARD_SIZE = 3

/**
 * Пауза после получения награды, прежде чем на освободившийся слот встанет новое
 * задание. Смысл — растянуть обучение и дать повод вернуться, а не выдать весь
 * пул за один вечер.
 */
export const QUEST_COOLDOWN_MS = 8 * 60 * 60 * 1000

/**
 * Пул заданий. Порядок = очерёдность появления на борде.
 *
 * Задания про повтор трат и поиск стоят после `tx_10` намеренно: чипы «Повторить»
 * появляются только когда есть повторяющиеся траты, а искать в пустой истории
 * нечего. Задание раньше времени выглядело бы сломанным.
 */
export const QUESTS: QuestDef[] = [
  /* ── Обычные ──────────────────────────────────────────────────────── */
  { id: 'first_tx', metric: 'transactions', goal: 1, xp: 30, coins: 10, icon: '✍️', group: 'main' },
  { id: 'see_analytics', metric: 'event', event: 'visit_analytics', goal: 1, xp: 25, coins: 8, icon: '📊', group: 'main' },
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
  { id: 'try_period', metric: 'event', event: 'use_period', goal: 1, xp: 25, coins: 8, icon: '🗓', group: 'main' },
  { id: 'tx_10', metric: 'transactions', goal: 10, xp: 120, coins: 28, icon: '🧾', group: 'main' },
  { id: 'set_budget', metric: 'event', event: 'set_budget', goal: 1, xp: 45, coins: 15, icon: '🎯', group: 'main' },
  { id: 'use_search', metric: 'event', event: 'use_search', goal: 1, xp: 40, coins: 12, icon: '🔍', group: 'main' },
  { id: 'make_category', metric: 'event', event: 'add_category', goal: 1, xp: 35, coins: 10, icon: '🏷', group: 'main' },
  { id: 'use_repeat', metric: 'event', event: 'use_repeat', goal: 1, xp: 40, coins: 12, icon: '↻', group: 'main' },
  { id: 'diversify_5', metric: 'categories', goal: 5, xp: 50, coins: 15, icon: '🎨', group: 'main' },
  { id: 'set_goal', metric: 'event', event: 'add_goal', goal: 1, xp: 45, coins: 15, icon: '🏝', group: 'main' },
  { id: 'open_planning', metric: 'event', event: 'open_planning', goal: 1, xp: 25, coins: 8, icon: '🧭', group: 'main' },
  { id: 'streak_3', metric: 'streak', goal: 3, xp: 60, coins: 20, icon: '🔥', group: 'main' },
  { id: 'see_charts', metric: 'event', event: 'visit_charts', goal: 1, xp: 25, coins: 8, icon: '📈', group: 'main' },
  { id: 'personalize', metric: 'event', event: 'customize', goal: 1, xp: 25, coins: 8, icon: '🎛', group: 'main' },
  { id: 'see_leaderboard', metric: 'event', event: 'open_leaderboard', goal: 1, xp: 25, coins: 8, icon: '🏆', group: 'main' },
  { id: 'log_7', metric: 'logDays', goal: 7, xp: 90, coins: 25, icon: '📅', group: 'main' },
  { id: 'under_budget', metric: 'budgetKept', goal: 1, xp: 80, coins: 25, icon: '🛡', group: 'main' },
  { id: 'goal_reached', metric: 'goalsReached', goal: 1, xp: 120, coins: 35, icon: '🥇', group: 'main' },

  /* ── Спешел (реферальные) ─────────────────────────────────────────── */
  { id: 'invite_1', metric: 'referrals', goal: 1, xp: 60, coins: 5, icon: '🤝', group: 'special' },
  { id: 'invite_3', metric: 'referrals', goal: 3, xp: 120, coins: 10, icon: '🚀', group: 'special' },
  { id: 'invite_5', metric: 'referrals', goal: 5, xp: 250, coins: 20, icon: '👑', group: 'special' },
]

/** Суммарный XP пула — держать в синхроне с XP_ALL_QUESTS в воркере. */
export const QUESTS_TOTAL_XP = QUESTS.reduce((sum, q) => sum + q.xp, 0)

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
    case 'event':
      return def.event ? (m.events[def.event] ?? 0) : 0
    case 'streak':
      return m.streak
    case 'categories':
      return m.categories
    case 'logDays':
      return m.logDays
    case 'goalsReached':
      return m.goalsReached
    case 'budgetKept':
      return m.budgetKept
  }
}

function progressOf(def: QuestDef, metrics: QuestMetrics, claimedQuests: string[]): QuestProgress {
  const raw = metricValue(def, metrics)
  const done = raw >= def.goal
  const claimed = claimedQuests.includes(def.id)
  return {
    def,
    current: Math.min(raw, def.goal),
    ratio: def.goal > 0 ? Math.min(1, raw / def.goal) : 1,
    done,
    claimed,
    claimable: done && !claimed,
  }
}

/** Слот борда: либо задание, либо перезаряжающийся пустой слот с таймером. */
export type QuestSlot =
  | { kind: 'quest'; quest: QuestProgress }
  | { kind: 'locked'; unlockAt: number }

/** Группа задания по id — нужна, чтобы отнести отметку о получении к своей группе. */
const GROUP_BY_ID = new Map(QUESTS.map((q) => [q.id, q.group]))

/**
 * Борд группы: ближайшие невыполненные задания плюс перезаряжающиеся слоты.
 *
 * Готовые к получению поднимаются наверх и показываются ВСЕГДА, даже если их
 * больше размера борда: терять доступ к уже заработанной награде нельзя, и
 * перезарядка их не касается — она гасит только появление НОВЫХ заданий.
 *
 * Перезаряжающихся слотов показываем не больше, чем осталось заданий в запасе:
 * обещать таймером задание, которого нет, нечестно.
 *
 * @param questClaims время получения награды по id (из стора)
 * @param now текущее время — параметром, чтобы тикающий таймер пересчитывал борд
 */
export function questBoard(
  metrics: QuestMetrics,
  claimedQuests: string[],
  questClaims: Record<string, number>,
  group: QuestGroup,
  now: number = Date.now(),
): QuestSlot[] {
  const open = QUESTS.filter((q) => q.group === group && !claimedQuests.includes(q.id)).map((def) =>
    progressOf(def, metrics, claimedQuests),
  )
  const claimable = open.filter((q) => q.claimable)
  const rest = open.filter((q) => !q.claimable)
  const ordered = [...claimable, ...rest]

  // Ещё не остывшие отметки о получении — по одной на занятый слот.
  const cooling = Object.entries(questClaims)
    .filter(([id, at]) => GROUP_BY_ID.get(id) === group && at + QUEST_COOLDOWN_MS > now)
    .map(([, at]) => at + QUEST_COOLDOWN_MS)
    .sort((a, b) => a - b)

  const lockedWanted = Math.min(cooling.length, BOARD_SIZE)
  const activeCount = Math.max(claimable.length, BOARD_SIZE - lockedWanted)
  const active = ordered.slice(0, activeCount)
  const inReserve = ordered.length - active.length
  const locked = cooling.slice(0, Math.min(lockedWanted, inReserve))

  return [
    ...active.map((quest) => ({ kind: 'quest' as const, quest })),
    ...locked.map((unlockAt) => ({ kind: 'locked' as const, unlockAt })),
  ]
}

/** Сколько заданий группы ещё не забрано (для подписи «осталось»). */
export function questsLeft(claimedQuests: string[], group: QuestGroup): number {
  return QUESTS.filter((q) => q.group === group && !claimedQuests.includes(q.id)).length
}
