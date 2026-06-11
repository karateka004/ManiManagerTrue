/**
 * Задания («квесты») — вехи, за которые дают XP и монеты.
 *
 * Прогресс считается из реальных метрик:
 *   - transactions: количество операций (локально);
 *   - referrals: сколько друзей пригласил (приходит с воркера, getReferralStats);
 *   - streak: длина текущей ежедневной серии;
 *   - event: счётчик действия-вовлечения (зашёл в раздел, воспользовался
 *     функцией) — `events[def.event]` в сторе. На этом строятся основные задания
 *     «за использование приложения».
 *
 * Капельный движок (ротация):
 *   - Задание из цепочки (`unlockAfter`) скрыто, пока не забрана награда за
 *     предыдущее, и ещё HIDE_AFTER_CLAIM_MS (3 ч) после этого.
 *   - Забранное задание остаётся видимым с таймером ещё HIDE_AFTER_CLAIM_MS,
 *     потом ИСЧЕЗАЕТ — ровно в этот момент открывается следующее. Так список не
 *     копит «Получено», а постоянно подсовывает новое действие в приложении.
 *
 * Когда прогресс достигает цели — задание можно «забрать» (Claim):
 * см. claimQuest() в сторе. Награда (XP + монеты) начисляется один раз.
 */

export type QuestMetric =
  | 'transactions'
  | 'referrals'
  | 'streak'
  | 'event'
  // Финансовые метрики (считаются из реальных данных в сторе, см. Profile.tsx).
  | 'categories'
  | 'logDays'
  | 'goalsReached'
  | 'budgetMonth'

export interface QuestDef {
  id: string
  title: string
  desc: string
  /** Что измеряем. */
  metric: QuestMetric
  /** Ключ события вовлечения (когда metric === 'event'). */
  event?: string
  /** Цель (порог выполнения). */
  goal: number
  /** Награда. */
  xp: number
  coins: number
  /** Эмодзи-иконка задания. */
  icon: string
  /** Появляется только после получения награды за это задание (+ задержка). */
  unlockAfter?: string
}

/**
 * Единый интервал ротации: и задержка появления следующего задания после
 * получения предыдущего, и время, через которое забранное задание исчезает.
 */
export const UNLOCK_DELAY_MS = 3 * 60 * 60 * 1000 // 3 часа
export const HIDE_AFTER_CLAIM_MS = UNLOCK_DELAY_MS

export interface QuestMetrics {
  transactions: number
  referrals: number
  streak: number
  events: Record<string, number>
  // Финансовые метрики — опциональны: вызыватели, которые их не передают,
  // не ломаются (см. `?? 0` в metricValue), задание просто покажет 0.
  categories?: number
  logDays?: number
  goalsReached?: number
  budgetMonth?: number
}

export const QUESTS: QuestDef[] = [
  // Опорное задание: первая запись (оно же — первое действие в приложении).
  {
    id: 'first_tx',
    title: 'Первая операция',
    desc: 'Добавь первый доход или расход',
    metric: 'transactions',
    goal: 1,
    xp: 30,
    coins: 10,
    icon: '✍️',
  },
  // Цепочка вовлечения «за использование приложения»: каждое следующее задание
  // открывается через 3 ч после получения предыдущего (и подменяет его в списке).
  {
    id: 'see_analytics',
    title: 'Загляни в Аналитику',
    desc: 'Открой вкладку «Аналитика» внизу',
    metric: 'event',
    event: 'visit_analytics',
    goal: 1,
    xp: 40,
    coins: 12,
    icon: '📊',
    unlockAfter: 'first_tx',
  },
  {
    id: 'see_charts',
    title: 'Посмотри Графики',
    desc: 'Зайди во вкладку «Графики» — оцени динамику',
    metric: 'event',
    event: 'visit_charts',
    goal: 1,
    xp: 40,
    coins: 12,
    icon: '📈',
    unlockAfter: 'see_analytics',
  },
  {
    id: 'try_period',
    title: 'Переключи период',
    desc: 'Смени период — день / неделя / месяц',
    metric: 'event',
    event: 'use_period',
    goal: 1,
    xp: 50,
    coins: 14,
    icon: '🗓️',
    unlockAfter: 'see_charts',
  },
  {
    id: 'make_category',
    title: 'Своя категория',
    desc: 'Создай категорию под свои траты',
    metric: 'event',
    event: 'add_category',
    goal: 1,
    xp: 60,
    coins: 16,
    icon: '🏷️',
    unlockAfter: 'try_period',
  },
  {
    id: 'personalize',
    title: 'Настрой под себя',
    desc: 'Поменяй тему или акцентную палитру',
    metric: 'event',
    event: 'customize',
    goal: 1,
    xp: 60,
    coins: 16,
    icon: '🎨',
    unlockAfter: 'make_category',
  },
  {
    id: 'open_planning',
    title: 'Открой Планирование',
    desc: 'Загляни в «Планирование» в профиле',
    metric: 'event',
    event: 'open_planning',
    goal: 1,
    xp: 70,
    coins: 18,
    icon: '🎯',
    unlockAfter: 'personalize',
  },
  {
    id: 'set_budget',
    title: 'Задай бюджет',
    desc: 'Поставь общий бюджет или лимит категории',
    metric: 'event',
    event: 'set_budget',
    goal: 1,
    xp: 90,
    coins: 22,
    icon: '💼',
    unlockAfter: 'open_planning',
  },
  {
    id: 'set_goal',
    title: 'Поставь цель',
    desc: 'Создай накопительную цель',
    metric: 'event',
    event: 'add_goal',
    goal: 1,
    xp: 90,
    coins: 22,
    icon: '🏆',
    unlockAfter: 'set_budget',
  },
  {
    id: 'see_leaderboard',
    title: 'Сравни с другими',
    desc: 'Открой «Таблицу лидеров» в профиле',
    metric: 'event',
    event: 'open_leaderboard',
    goal: 1,
    xp: 80,
    coins: 20,
    icon: '🥇',
    unlockAfter: 'set_goal',
  },
  {
    id: 'tx_10',
    title: 'Входим в ритм',
    desc: 'Доведи число операций до 10',
    metric: 'transactions',
    goal: 10,
    xp: 120,
    coins: 28,
    icon: '🧾',
    unlockAfter: 'see_leaderboard',
  },
  {
    id: 'streak_3',
    title: 'Три дня подряд',
    desc: 'Забери ежедневную серию три дня кряду',
    metric: 'streak',
    goal: 3,
    xp: 150,
    coins: 35,
    icon: '🔥',
    unlockAfter: 'tx_10',
  },
  // Финансовые задания — «выпускной» хвост цепочки: за реальное поведение, а не
  // за навигацию. Появляются по одному после онбординга, по возрастанию сложности.
  {
    id: 'diversify_5',
    title: 'Пять категорий',
    desc: 'Используй 5 разных категорий',
    metric: 'categories',
    goal: 5,
    xp: 80,
    coins: 20,
    icon: '🗂️',
    unlockAfter: 'streak_3',
  },
  {
    id: 'log_7',
    title: 'Неделя учёта',
    desc: 'Записывай операции 7 дней подряд',
    metric: 'logDays',
    goal: 7,
    xp: 160,
    coins: 40,
    icon: '🗓️',
    unlockAfter: 'diversify_5',
  },
  {
    id: 'goal_reached',
    title: 'Цель достигнута',
    desc: 'Накопи первую цель полностью',
    metric: 'goalsReached',
    goal: 1,
    xp: 120,
    coins: 30,
    icon: '🎯',
    unlockAfter: 'log_7',
  },
  {
    id: 'under_budget',
    title: 'В рамках бюджета',
    desc: 'Удержи месяц в пределах бюджета',
    metric: 'budgetMonth',
    goal: 1,
    xp: 200,
    coins: 50,
    icon: '💼',
    unlockAfter: 'goal_reached',
  },
  // Реферальные задания — независимая ветка (без цепочки).
  {
    id: 'invite_3',
    title: 'Пригласи 3 друзей',
    desc: 'Позови троих по своей ссылке',
    metric: 'referrals',
    goal: 3,
    xp: 120,
    coins: 10,
    icon: '🤝',
  },
  {
    id: 'invite_5',
    title: 'Пригласи 5 друзей',
    desc: 'Позови пятерых по своей ссылке',
    metric: 'referrals',
    goal: 5,
    xp: 250,
    coins: 20,
    icon: '🚀',
  },
]

/** У каких заданий есть преемник в цепочке (для подписи таймера). */
const HAS_SUCCESSOR = new Set(QUESTS.map((q) => q.unlockAfter).filter(Boolean) as string[])

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
  /** Можно нажать Claim (выполнено и не забрано). */
  claimable: boolean
  /** Когда забранное задание исчезнет (epoch ms), если claimed. */
  expiresAt: number | null
  /** У задания есть преемник, который откроется при исчезновении. */
  hasSuccessor: boolean
}

function metricValue(def: QuestDef, m: QuestMetrics): number {
  switch (def.metric) {
    case 'transactions':
      return m.transactions
    case 'referrals':
      return m.referrals
    case 'streak':
      return m.streak
    case 'event':
      return def.event ? m.events[def.event] ?? 0 : 0
    case 'categories':
      return m.categories ?? 0
    case 'logDays':
      return m.logDays ?? 0
    case 'goalsReached':
      return m.goalsReached ?? 0
    case 'budgetMonth':
      return m.budgetMonth ?? 0
  }
}

/**
 * Прогресс по всем ВИДИМЫМ заданиям. Логика ротации:
 *   - забранное задание показывается с таймером ещё HIDE_AFTER_CLAIM_MS, затем
 *     скрывается;
 *   - задание из цепочки скрыто, пока не забрана награда за предыдущее И не
 *     прошло UNLOCK_DELAY_MS — т.е. ровно когда предыдущее исчезает.
 */
export function allQuestProgress(
  metrics: QuestMetrics,
  claimedQuests: string[],
  questClaims: Record<string, number> = {},
  now: number = Date.now(),
): QuestProgress[] {
  const out: QuestProgress[] = []
  for (const def of QUESTS) {
    const claimed = claimedQuests.includes(def.id)
    const claimedAt = questClaims[def.id]

    // Забранное задание исчезает через HIDE_AFTER_CLAIM_MS после получения.
    if (claimed && claimedAt != null && now >= claimedAt + HIDE_AFTER_CLAIM_MS) continue

    // Цепочка: следующее появляется, только когда предыдущее уже исчезло.
    if (def.unlockAfter) {
      if (!claimedQuests.includes(def.unlockAfter)) continue
      const prereqAt = questClaims[def.unlockAfter] ?? 0
      if (now < prereqAt + UNLOCK_DELAY_MS) continue
    }

    const raw = metricValue(def, metrics)
    const current = Math.min(raw, def.goal)
    const done = raw >= def.goal
    out.push({
      def,
      current,
      ratio: def.goal > 0 ? Math.min(1, raw / def.goal) : 1,
      done,
      claimed,
      claimable: done && !claimed,
      expiresAt: claimed && claimedAt != null ? claimedAt + HIDE_AFTER_CLAIM_MS : null,
      hasSuccessor: HAS_SUCCESSOR.has(def.id),
    })
  }
  return out
}

/** Сколько наград доступно к получению (для бейджа-счётчика). */
export function claimableCount(
  metrics: QuestMetrics,
  claimedQuests: string[],
  questClaims: Record<string, number> = {},
  now: number = Date.now(),
): number {
  return allQuestProgress(metrics, claimedQuests, questClaims, now).filter((q) => q.claimable).length
}
