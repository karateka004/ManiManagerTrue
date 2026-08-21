import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import dayjs, { type Dayjs } from 'dayjs'
import type { CategoryKind, Category } from './categories'
import { DEFAULT_CATEGORIES, getCategory } from './categories'
import type { Currency } from '../lib/currencies'
import { type StreakState, nextStreak } from '../lib/streak'
import { DEFAULT_EQUIPPED, DEFAULT_OWNED, getReward, rewardPrice, discountedPrice } from '../lib/rewards'
import { computeXp, levelFor } from '../lib/levels'
import { demoTransactions } from '../lib/demo'
import type { Lang } from '../lib/i18n'
import { tg } from '../lib/telegram'
import { DAY_MS, localDayKey, parseDay, prevDayKey } from '../lib/day'
import { buildOverview, buildRecurring, type Overview, type Recurring } from '../lib/overview'
import { buildMonthlySummary, previousMonthBounds, type MonthlySummary } from '../lib/monthly'

/** Язык по умолчанию: из Telegram (ru → русский, иначе английский). */
function initialLang(): Lang {
  const code = tg.user?.language_code ?? ''
  return code.startsWith('ru') ? 'ru' : code ? 'en' : 'ru'
}

/** Накопительная цель (для вкладки «Цели» в планировании). */
/**
 * Актив в разделе «Инвестиции и сбережения»: вклад, брокерский счёт, крипта,
 * подушка на чёрный день. Учитывается отдельно от операций — на доходы/расходы
 * и бюджеты не влияет, это витрина накопленного капитала.
 */
export interface Investment {
  id: string
  title: string
  /** Вложенная сумма. */
  amount: number
  /** Ожидаемая годовая доходность, % (0 — для подушки/сейфа). */
  rate: number
  /** Тип актива — только для иконки и группировки. */
  kind: InvestmentKind
  currency: Currency
  createdAt: number
}

export type InvestmentKind = 'deposit' | 'stocks' | 'crypto' | 'cash' | 'other'

export interface Goal {
  id: string
  title: string
  /** Сколько нужно накопить. */
  target: number
  /** Сколько уже отложено (ручной режим; для syncBalance не используется). */
  saved: number
  /** Эмодзи-иконка. */
  icon: string
  createdAt: number
  /**
   * Синхронизация с общим балансом: если true, «накоплено» = текущий общий
   * баланс (доходы − расходы за всё время), а не ручные взносы. Полезно для
   * цели «накопить N»: добавил расход — в цели тоже убавилось.
   */
  syncBalance?: boolean
  /**
   * Валюта цели. Если не задана (старые цели) — глобальная s.currency.
   * Для синхронизированной цели баланс считается по операциям этой валюты.
   */
  currency?: Currency
}

export interface Transaction {
  id: string
  type: CategoryKind
  amount: number
  /** Валюта операции. Если не задана — используется глобальная s.currency. */
  currency?: Currency
  categoryId: string
  note?: string
  tags?: string[]
  /** ISO date string */
  date: string
}

export type ChartStyle = 'compact' | 'icons'
export type ThemeMode = 'auto' | 'light' | 'dark'

/** Что показывать в подзаголовке шапки «Главной». */
export type HomeHeaderMode = 'date' | 'goal'

export type PeriodMode = 'day' | 'week' | 'month' | 'year' | 'all' | 'range'

export interface Period {
  mode: PeriodMode
  /** Опорная дата (ISO yyyy-mm-dd) для day/week/month/year */
  anchor: string
  /** Для mode === 'range' */
  rangeStart?: string
  rangeEnd?: string
}

interface State {
  transactions: Transaction[]
  /** Активный период просмотра */
  period: Period
  currency: Currency
  /** Donut chart presentation */
  chartStyle: ChartStyle
  /** Monthly limits per expense category id. 0/undefined = no limit */
  budgets: Record<string, number>
  /** Theme preference: 'auto' follows Telegram colorScheme */
  themeMode: ThemeMode
  /** Пользовательские категории */
  customCategories: Category[]
  /** Бонусный XP (рефералы, задания) поверх активности. */
  bonusXp: number
  /** Игровая валюта «монеты» — награда за задания (под косметический магазин). */
  coins: number
  /** Сколько рефералов уже «оплачено» фикс-наградой (для доначисления за новых). */
  rewardedReferrals: number
  /** ID заданий, награда за которые уже забрана (Claim). */
  claimedQuests: string[]
  /** Ежедневная серия (стрик) — ретеншн-движок. */
  streak: StreakState
  /** Надетые косметические награды (роудпасс): акцент, титул, рамка аватара. */
  equipped: { accent: string; title: string; frame: string }
  /** Купленные (доступные к надеванию) награды. */
  owned: string[]
  /**
   * Демо-режим: финансовые экраны показывают сгенерированный набор за ~2 года
   * вместо реальных транзакций. Реальные данные при этом не трогаются.
   */
  demoMode: boolean
  /** Язык интерфейса (ru/en). */
  lang: Lang
  /** Время (epoch ms) получения награды за задание — для цепочки квестов. */
  questClaims: Record<string, number>
  /** Общий месячный бюджет (0 = не задан). */
  monthlyBudget: number
  /** Накопительные цели. */
  goals: Goal[]
  /** Инвестиции и сбережения (витрина капитала, на бюджеты не влияет). */
  investments: Investment[]
  /**
   * Валюты быстрого выбора в форме операции (до 3).
   * Пустой массив = подобрать автоматически по данным (`selectQuickCurrencies`).
   */
  quickCurrencies: Currency[]
  /** Содержимое шапки «Главной»: дата или прогресс к цели. */
  homeHeaderMode: HomeHeaderMode
  /** Выбранная цель для шапки (если homeHeaderMode === 'goal'). */
  homeHeaderGoalId: string | null
  /**
   * Счётчики действий пользователя в приложении (движок заданий-вовлечения):
   * сколько раз заходил в разделы / пользовался функциями. Ключи — строковые
   * имена событий (visit_analytics, add_category, set_budget …).
   */
  events: Record<string, number>
  /** Валюта последней записанной операции — открывается в форме по умолчанию. */
  lastTxCurrency: Currency
  /**
   * Выбранный «счёт» для Аналитики = валюта. null → «Все счета» (суммы по
   * валютам складываются как есть, прежнее поведение). Если задан — Аналитика
   * (диаграмма, категории, по дням, календарь) показывает только операции этой
   * валюты, а суммы корректны (без смешивания валют).
   */
  account: Currency | null
  /**
   * Ежедневные напоминания от бота («Есть ли транзакции сегодня?»). По умолчанию
   * включены; источник правды для рассылки — KV воркера (флаг шлётся при
   * переключении). Поле едет в облачном блобе, чтобы тумблер синкался между устройствами.
   */
  remindersEnabled: boolean
}

interface Actions {
  addTransaction: (t: Omit<Transaction, 'id'>) => void
  updateTransaction: (id: string, patch: Partial<Omit<Transaction, 'id'>>) => void
  /**
   * Записать операцию из формы одним изменением стора. `editingId` = null —
   * создание новой, иначе правка существующей. См. реализацию: раньше форма
   * дёргала три действия подряд, и одно сохранение стоило три полных прохода
   * подписчиков и три записи на диск.
   */
  commitTransaction: (t: Omit<Transaction, 'id'>, editingId: string | null) => void
  removeTransaction: (id: string) => void
  setPeriodMode: (mode: PeriodMode) => void
  shiftPeriod: (delta: number) => void
  setRange: (start: string, end: string) => void
  /**
   * Навести период просмотра на конкретную дату (для добавления операций
   * «задним числом» — чтобы новая операция сразу попадала в видимый период).
   */
  focusPeriodOn: (dateISO: string) => void
  setCurrency: (c: State['currency']) => void
  setChartStyle: (s: ChartStyle) => void
  setBudget: (categoryId: string, amount: number) => void
  setThemeMode: (m: ThemeMode) => void
  addCategory: (c: Omit<Category, 'id' | 'custom'>) => void
  updateCategory: (id: string, patch: Partial<Omit<Category, 'id' | 'custom'>>) => void
  removeCategory: (id: string) => void
  clearAll: () => void
  /** Включить/выключить демо-режим (не затрагивает реальные транзакции). */
  setDemoMode: (on: boolean) => void
  /** Включить/выключить ежедневные напоминания от бота. */
  setRemindersEnabled: (on: boolean) => void
  /** Сменить язык интерфейса. */
  setLang: (lang: Lang) => void
  /** Задать общий месячный бюджет (0 = снять). */
  setMonthlyBudget: (amount: number) => void
  /** Создать накопительную цель. */
  addGoal: (g: { title: string; target: number; icon?: string; syncBalance?: boolean; currency?: Currency }) => void
  /** Обновить цель. */
  updateGoal: (id: string, patch: Partial<Pick<Goal, 'title' | 'target' | 'saved' | 'icon' | 'syncBalance' | 'currency'>>) => void
  /** Удалить цель. */
  removeGoal: (id: string) => void
  /** Добавить актив в «Инвестиции и сбережения». */
  addInvestment: (i: { title: string; amount: number; rate?: number; kind?: InvestmentKind; currency?: Currency }) => void
  /** Изменить актив. */
  updateInvestment: (id: string, patch: Partial<Pick<Investment, 'title' | 'amount' | 'rate' | 'kind' | 'currency'>>) => void
  /** Удалить актив. */
  removeInvestment: (id: string) => void
  /** Внести взнос в цель (delta может быть отрицательным). */
  contributeGoal: (id: string, delta: number) => void
  /** Задать содержимое шапки «Главной». */
  setHomeHeaderMode: (mode: HomeHeaderMode) => void
  /** Выбрать цель для шапки «Главной». */
  setHomeHeaderGoalId: (id: string | null) => void
  /**
   * Отметить действие-вовлечение (зашёл в раздел, воспользовался функцией).
   * Инкрементит счётчик `events[event]` — на этом строятся задания за
   * использование приложения. Идемпотентность не нужна: для целей важен факт ≥1.
   */
  /** Запомнить валюту последней записанной операции. */
  setLastTxCurrency: (c: Currency) => void
  /** Выбрать «счёт» (валюту) для Аналитики; null = все валюты вместе. */
  setAccount: (c: Currency | null) => void
  track: (event: string) => void
  /** Начислить бонусный XP (рефералы/задания). */
  addXp: (amount: number) => void
  /** Начислить монеты. */
  addCoins: (amount: number) => void
  /**
   * Забрать награду за задание (идемпотентно): помечает задание выполненным
   * и начисляет XP + монеты. Повторный вызов с тем же id ничего не делает.
   */
  claimQuest: (id: string, xp: number, coins: number) => void
  /**
   * Забрать ежедневную награду серии (идемпотентно за день).
   * Возвращает начисленную награду или null, если сегодня уже забирали.
   */
  claimDailyStreak: () => { coins: number; xp: number; milestone: number } | null
  /**
   * Задать валюту быстрого выбора в слот 0..2. Первый вызов фиксирует текущий
   * автоподбор, дальше правится только выбранный слот.
   */
  setQuickCurrency: (slot: number, code: Currency) => void
  /** Надеть косметическую награду (акцент/титул/рамка). */
  equipReward: (kind: 'accent' | 'title' | 'frame', id: string) => void
  /**
   * Купить награду за монеты. `priceOverride` — скидочная цена витрины дня
   * (зажимается в диапазон [скидка, полная цена] для защиты от подмены из UI).
   * Возвращает true при успехе, false если уже куплена/не найдена/не хватает монет.
   */
  buyReward: (id: string, priceOverride?: number) => boolean
  /**
   * Выдать награду бесплатно (титул за уровень / персональный подарок).
   * Идемпотентно; для source='level' проверяет достижение уровня.
   * Возвращает true, если награда добавлена в owned.
   */
  grantReward: (id: string) => boolean
  /**
   * Сверить число рефералов с уже оплаченными и доначислить фикс-награду
   * (REF_REWARD) за новых. Идемпотентно: повторный вызов с тем же count — no-op.
   */
  reconcileReferralRewards: (count: number) => void
}

const cuid = () => Math.random().toString(36).slice(2) + Date.now().toString(36)

/** Запасные валюты, если у человека ещё нет операций в разных валютах. */
const FALLBACK_QUICK: Currency[] = ['USD', 'EUR', 'UAH']

/**
 * Автоподбор быстрых валют: сначала та, что выбрана в настройках, затем те,
 * что реально встречаются в операциях, затем запасные. Так у человека с одной
 * рублёвой валютой в форме сразу рубль, а не чужие USD/EUR/UAH.
 */
function quickCurrenciesOf(s: State): Currency[] {
  const list: Currency[] = [s.currency]
  for (const t of s.transactions) {
    if (t.currency && !list.includes(t.currency)) list.push(t.currency)
    if (list.length >= 3) break
  }
  for (const c of FALLBACK_QUICK) {
    if (list.length >= 3) break
    if (!list.includes(c)) list.push(c)
  }
  return list.slice(0, 3)
}

/** Фикс-награда за каждого присоединившегося реферала. */
export const REF_REWARD = { xp: 25, coins: 10 } as const

/** Инкремент счётчика события вовлечения (для заданий «за использование»). */
const bumpEvent = (events: Record<string, number>, key: string): Record<string, number> => ({
  ...events,
  [key]: (events[key] ?? 0) + 1,
})

const todayISO = () => dayjs().format('YYYY-MM-DD')

const UNIT: Record<Exclude<PeriodMode, 'all' | 'range'>, dayjs.ManipulateType> = {
  day: 'day',
  week: 'week',
  month: 'month',
  year: 'year',
}

/* ---------- Нормализация данных при загрузке ---------- */

/**
 * localStorage целиком доступен пользователю: снимок можно испортить руками или
 * получить битым после сбоя записи. Раньше он попадал в приложение как есть — и
 * мог уронить экран, а через облачный синк уехать на другие устройства.
 *
 * Главный принцип здесь — НЕ ТЕРЯТЬ данные. Числа чиним (зажимаем в разумные
 * границы), контейнеры не того типа заменяем пустыми, а выбрасываем только те
 * операции, с которыми экран всё равно не отрисуется: без id, без категории,
 * с нечисловой суммой. Всё остальное проходит как есть.
 *
 * Локальную накрутку монет это не предотвращает (данные принадлежат человеку) —
 * от неё защищает потолок XP на воркере, см. handleProfile.
 */
const MAX_MONEY = 1e15

function clampNumber(x: unknown, min: number, max: number, fallback: number): number {
  const n = Number(x)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function isUsableTransaction(t: unknown): boolean {
  if (!t || typeof t !== 'object') return false
  const x = t as Record<string, unknown>
  return (
    typeof x.id === 'string' &&
    (x.type === 'income' || x.type === 'expense') &&
    typeof x.categoryId === 'string' &&
    typeof x.date === 'string' &&
    Number.isFinite(Number(x.amount))
  )
}

/** Куда девать операции удалённой категории — «Прочее» своего вида. */
const FALLBACK_CATEGORY = { income: 'other_in', expense: 'other' } as const

function sanitizePersisted(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {}
  const s = { ...(raw as Record<string, unknown>) }

  if (Array.isArray(s.transactions)) {
    // Категории, которые вообще существуют: встроенные плюс пользовательские.
    // Удаление пользовательской категории раньше оставляло операции сиротами:
    // из кольца они пропадали (там перебор идёт ПО категориям), а сумма в
    // центре их всё равно включала — проценты не сходились в сто.
    const known = new Set(DEFAULT_CATEGORIES.map((c) => c.id))
    if (Array.isArray(s.customCategories)) {
      for (const c of s.customCategories as { id?: unknown }[]) if (typeof c?.id === 'string') known.add(c.id)
    }
    s.transactions = (s.transactions as unknown[])
      .filter(isUsableTransaction)
      .map((t) => {
        const x = t as Record<string, unknown>
        const amount = clampNumber(x.amount, 0, MAX_MONEY, 0)
        const categoryId = known.has(x.categoryId as string)
          ? x.categoryId
          : x.type === 'income'
            ? FALLBACK_CATEGORY.income
            : FALLBACK_CATEGORY.expense
        return amount === x.amount && categoryId === x.categoryId ? x : { ...x, amount, categoryId }
      })
  } else if (s.transactions !== undefined) {
    s.transactions = []
  }

  // Контейнеры: если тип не тот, приложение упадёт на первом же .map/.filter.
  for (const key of ['customCategories', 'goals', 'investments', 'owned', 'quickCurrencies', 'claimedQuests']) {
    if (s[key] !== undefined && !Array.isArray(s[key])) s[key] = []
  }
  for (const key of ['budgets', 'events', 'questClaims']) {
    const v = s[key]
    if (v !== undefined && (typeof v !== 'object' || v === null || Array.isArray(v))) s[key] = {}
  }

  // Поля-объекты, порча которых не роняет приложение, но даёт пустой экран или
  // бросок при обращении к полю. Удаляем ключ — merge подставит значение по
  // умолчанию из текущего состояния.
  const PERIOD_MODES = ['day', 'week', 'month', 'year', 'all', 'range']
  const period = s.period as Record<string, unknown> | null | undefined
  if (
    period !== undefined &&
    (!period ||
      typeof period !== 'object' ||
      Array.isArray(period) ||
      typeof period.mode !== 'string' ||
      !PERIOD_MODES.includes(period.mode) ||
      typeof period.anchor !== 'string')
  ) {
    delete s.period
  }
  for (const key of ['equipped', 'streak']) {
    const v = s[key]
    if (v !== undefined && (typeof v !== 'object' || v === null || Array.isArray(v))) delete s[key]
  }

  // Счётчики прогресса: отрицательные и нечисловые ломают арифметику уровней.
  if (s.coins !== undefined) s.coins = clampNumber(s.coins, 0, 1e9, 0)
  if (s.bonusXp !== undefined) s.bonusXp = clampNumber(s.bonusXp, 0, 1e9, 0)
  if (s.rewardedReferrals !== undefined) s.rewardedReferrals = clampNumber(s.rewardedReferrals, 0, 1e9, 0)
  if (s.monthlyBudget !== undefined) s.monthlyBudget = clampNumber(s.monthlyBudget, 0, MAX_MONEY, 0)

  return s
}

/* ---------- Отложенная запись persist ---------- */

/**
 * Хранилище для persist с отложенной записью.
 *
 * zustand по умолчанию сериализует весь стор в localStorage на КАЖДОЕ изменение,
 * синхронно и в главном потоке. При сотнях операций блоб весит сотни килобайт, и
 * несколько изменений подряд превращаются в несколько полных сериализаций.
 *
 * Здесь запись откладывается на PERSIST_DELAY, а изменения внутри окна просто
 * заменяют то, что будет записано. Это троттлинг, а НЕ debounce: окно не
 * продлевается новыми изменениями, поэтому задержка записи ограничена сверху и
 * поток непрерывных правок не может отложить запись бесконечно.
 *
 * Риск потерять последние правки при закрытии закрыт принудительным сбросом на
 * visibilitychange/pagehide (ниже) и вызовом flushPersist() из облачного синка.
 */
const PERSIST_DELAY = 400

let persistTimer: ReturnType<typeof setTimeout> | null = null
let persistPending: { name: string; value: string } | null = null

function writePersist(): void {
  persistTimer = null
  const pending = persistPending
  persistPending = null
  if (!pending) return
  try {
    localStorage.setItem(pending.name, pending.value)
  } catch {
    /* приватный режим или кончилось место — данные остаются в памяти */
  }
}

/**
 * Немедленно записать отложенное. Вызывать перед чтением блоба напрямую из
 * localStorage (облачный синк) и перед выгрузкой страницы.
 */
export function flushPersist(): void {
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  writePersist()
}

const throttledStorage = {
  getItem: (name: string): string | null => {
    // Ещё не записанное значение свежее того, что лежит на диске.
    if (persistPending && persistPending.name === name) return persistPending.value
    try {
      return localStorage.getItem(name)
    } catch {
      return null
    }
  },
  setItem: (name: string, value: string): void => {
    persistPending = { name, value }
    if (!persistTimer) persistTimer = setTimeout(writePersist, PERSIST_DELAY)
  },
  removeItem: (name: string): void => {
    if (persistPending && persistPending.name === name) persistPending = null
    try {
      localStorage.removeItem(name)
    } catch {
      /* нечего удалять */
    }
  },
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushPersist()
  })
  window.addEventListener('pagehide', flushPersist)
}

export const useStore = create<State & Actions>()(
  persist(
    (set, get) => ({
      transactions: [],
      period: { mode: 'month', anchor: todayISO() },
      currency: 'USD',
      chartStyle: 'icons',
      budgets: {},
      themeMode: 'auto',
      customCategories: [],
      bonusXp: 0,
      coins: 0,
      rewardedReferrals: 0,
      claimedQuests: [],
      streak: { count: 0, best: 0, lastClaim: null },
      equipped: { ...DEFAULT_EQUIPPED },
      owned: [...DEFAULT_OWNED],
      demoMode: false,
      remindersEnabled: true,
      lang: initialLang(),
      questClaims: {},
      monthlyBudget: 0,
      goals: [],
      investments: [],
      quickCurrencies: [],
      homeHeaderMode: 'date',
      homeHeaderGoalId: null,
      events: {},
      lastTxCurrency: 'USD',
      account: null,

      addTransaction: (t) =>
        set((s) => ({ transactions: [{ ...t, id: cuid() }, ...s.transactions] })),
      updateTransaction: (id, patch) =>
        set((s) => ({
          transactions: s.transactions.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        })),
      removeTransaction: (id) =>
        set((s) => ({ transactions: s.transactions.filter((t) => t.id !== id) })),

      commitTransaction: (t, editingId) =>
        set((s) => {
          const patch: Partial<State> = {}
          if (editingId) {
            patch.transactions = s.transactions.map((x) => (x.id === editingId ? { ...x, ...t } : x))
          } else {
            patch.transactions = [{ ...t, id: cuid() }, ...s.transactions]
            if (t.currency) patch.lastTxCurrency = t.currency
          }
          // Операция «задним числом» может выпасть за текущий период просмотра —
          // тогда сдвигаем период на её дату, иначе запись пропала бы из виду.
          const x = parseDay(t.date)
          const { start, end } = periodBounds(s.period)
          if (x < +start || x >= +end) {
            const next = focusedPeriod(s.period, t.date)
            if (next) patch.period = next
          }
          return patch
        }),

      setPeriodMode: (mode) =>
        set((s) => {
          const events = bumpEvent(s.events, 'use_period')
          if (mode === 'range') {
            const start = dayjs().startOf('month').format('YYYY-MM-DD')
            const end = dayjs().format('YYYY-MM-DD')
            return { period: { mode, anchor: todayISO(), rangeStart: start, rangeEnd: end }, events }
          }
          return { period: { mode, anchor: todayISO() }, events }
        }),
      shiftPeriod: (delta) =>
        set((s) => {
          const p = s.period
          if (p.mode === 'all' || p.mode === 'range') return {}
          const next = dayjs(p.anchor).add(delta, UNIT[p.mode]).format('YYYY-MM-DD')
          return { period: { ...p, anchor: next } }
        }),
      setRange: (start, end) =>
        set(() => ({ period: { mode: 'range', anchor: todayISO(), rangeStart: start, rangeEnd: end } })),
      focusPeriodOn: (dateISO) =>
        set((s) => {
          const next = focusedPeriod(s.period, dateISO)
          return next ? { period: next } : {}
        }),

      setCurrency: (c) => set({ currency: c }),
      setChartStyle: (s) => set({ chartStyle: s }),
      setBudget: (categoryId, amount) =>
        set((s) => {
          const next = { ...s.budgets }
          if (!amount || amount <= 0) delete next[categoryId]
          else next[categoryId] = amount
          return { budgets: next, events: bumpEvent(s.events, 'set_budget') }
        }),
      setThemeMode: (m) => set((s) => ({ themeMode: m, events: bumpEvent(s.events, 'customize') })),

      addCategory: (c) =>
        set((s) => ({
          customCategories: [...s.customCategories, { ...c, id: 'c_' + cuid(), custom: true }],
          events: bumpEvent(s.events, 'add_category'),
        })),
      updateCategory: (id, patch) =>
        set((s) => ({
          customCategories: s.customCategories.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        })),
      removeCategory: (id) =>
        set((s) => {
          const nextBudgets = { ...s.budgets }
          delete nextBudgets[id]
          // Операции удалённой категории переносим в «Прочее». Иначе они
          // остаются сиротами: в кольце их не видно (перебор идёт по
          // существующим категориям), а в общей сумме они есть.
          const orphaned = s.transactions.some((t) => t.categoryId === id)
          return {
            customCategories: s.customCategories.filter((c) => c.id !== id),
            budgets: nextBudgets,
            ...(orphaned
              ? {
                  transactions: s.transactions.map((t) =>
                    t.categoryId === id
                      ? { ...t, categoryId: t.type === 'income' ? FALLBACK_CATEGORY.income : FALLBACK_CATEGORY.expense }
                      : t,
                  ),
                }
              : {}),
          }
        }),

      clearAll: () => set({ transactions: [] }),

      setDemoMode: (on) => set({ demoMode: on }),
      setRemindersEnabled: (on) => set({ remindersEnabled: on }),
      setLang: (lang) => set({ lang }),

      setMonthlyBudget: (amount) =>
        set((s) => ({
          monthlyBudget: Number.isFinite(amount) && amount > 0 ? amount : 0,
          events: bumpEvent(s.events, 'set_budget'),
        })),
      addGoal: ({ title, target, icon, syncBalance, currency }) =>
        set((s) => ({
          goals: [
            ...s.goals,
            {
              id: 'g_' + cuid(),
              title: title.trim() || 'Цель',
              target: Number.isFinite(target) && target > 0 ? target : 0,
              saved: 0,
              icon: icon || '🎯',
              createdAt: Date.now(),
              syncBalance: !!syncBalance,
              currency: currency ?? s.currency,
            },
          ],
          events: bumpEvent(s.events, 'add_goal'),
        })),
      updateGoal: (id, patch) =>
        set((s) => ({
          goals: s.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)),
        })),
      removeGoal: (id) =>
        set((s) => ({
          goals: s.goals.filter((g) => g.id !== id),
          // Если удалили цель, выбранную для шапки — сбрасываем выбор.
          homeHeaderGoalId: s.homeHeaderGoalId === id ? null : s.homeHeaderGoalId,
        })),

      addInvestment: ({ title, amount, rate, kind, currency }) =>
        set((s) => ({
          investments: [
            ...s.investments,
            {
              id: 'inv_' + cuid(),
              title: title.trim() || 'Актив',
              amount: Number.isFinite(amount) && amount > 0 ? amount : 0,
              rate: Number.isFinite(rate ?? 0) && (rate ?? 0) >= 0 ? (rate ?? 0) : 0,
              kind: kind ?? 'deposit',
              currency: currency ?? s.currency,
              createdAt: Date.now(),
            },
          ],
          events: bumpEvent(s.events, 'add_investment'),
        })),

      updateInvestment: (id, patch) =>
        set((s) => ({
          investments: s.investments.map((i) => (i.id === id ? { ...i, ...patch } : i)),
        })),

      removeInvestment: (id) =>
        set((s) => ({ investments: s.investments.filter((i) => i.id !== id) })),
      contributeGoal: (id, delta) =>
        set((s) => ({
          goals: s.goals.map((g) =>
            g.id === id ? { ...g, saved: Math.max(0, Math.round((g.saved + delta) * 100) / 100) } : g,
          ),
        })),
      setQuickCurrency: (slot, code) =>
        set((s) => {
          // Пока список пуст, он вычисляется автоматически — фиксируем то, что
          // человек уже видит, и правим один слот, а не сбрасываем всё.
          const base = s.quickCurrencies.length > 0 ? [...s.quickCurrencies] : quickCurrenciesOf(s)
          if (slot < 0 || slot > 2) return {}
          base[slot] = code
          // Дубликаты не нужны: если валюта уже стоит в другом слоте — меняем их местами.
          const twin = base.findIndex((c, i) => c === code && i !== slot)
          if (twin >= 0) base[twin] = s.quickCurrencies[slot] ?? quickCurrenciesOf(s)[slot]
          return { quickCurrencies: base.slice(0, 3) }
        }),

      setHomeHeaderMode: (mode) => set({ homeHeaderMode: mode }),
      setHomeHeaderGoalId: (id) => set({ homeHeaderGoalId: id }),

      setLastTxCurrency: (c) => set({ lastTxCurrency: c }),
      setAccount: (c) => set({ account: c }),
      track: (event) => set((s) => ({ events: bumpEvent(s.events, event) })),
      addXp: (amount) => set((s) => ({ bonusXp: Math.max(0, s.bonusXp + amount) })),
      addCoins: (amount) => set((s) => ({ coins: Math.max(0, s.coins + amount) })),
      claimQuest: (id, xp, coins) =>
        set((s) =>
          s.claimedQuests.includes(id)
            ? {}
            : {
                claimedQuests: [...s.claimedQuests, id],
                questClaims: { ...s.questClaims, [id]: Date.now() },
                bonusXp: Math.max(0, s.bonusXp + xp),
                coins: Math.max(0, s.coins + coins),
              },
        ),

      claimDailyStreak: () => {
        const s = get()
        const result = nextStreak(s.streak)
        if (!result) return null // сегодня уже забирали
        set({
          streak: result.state,
          coins: Math.max(0, s.coins + result.reward.coins),
          bonusXp: Math.max(0, s.bonusXp + result.reward.xp),
        })
        return result.reward
      },

      equipReward: (kind, id) =>
        set((s) => ({ equipped: { ...s.equipped, [kind]: id }, events: bumpEvent(s.events, 'customize') })),

      buyReward: (id, priceOverride) => {
        const s = get()
        if (s.owned.includes(id)) return false
        const r = getReward(id)
        // Уровневые и подарочные награды за монеты не продаются.
        if (!r || r.source) return false
        const base = rewardPrice(r)
        // Скидку из UI зажимаем в [скидка дня, полная цена] — защита от подмены.
        const price =
          priceOverride != null
            ? Math.max(Math.min(priceOverride, base), discountedPrice(r))
            : base
        if (s.coins < price) return false
        set({ owned: [...s.owned, id], coins: Math.max(0, s.coins - price) })
        return true
      },

      grantReward: (id) => {
        const s = get()
        if (s.owned.includes(id)) return false
        const r = getReward(id)
        if (!r || !r.source) return false
        // Титул за уровень — только если выполнены оба условия: уровень и рекорд
        // ежедневной серии (streak.best) — та же «Серия дня», что на хабе наград.
        if (r.source === 'level') {
          const lvl = levelFor(computeXp(s.transactions.length, s.bonusXp)).level
          if (lvl < r.unlockLevel) return false
          if (r.unlockDays && s.streak.best < r.unlockDays) return false
        }
        set({ owned: [...s.owned, id] })
        return true
      },

      reconcileReferralRewards: (count) =>
        set((s) => {
          const total = Math.max(0, Math.floor(count))
          const n = total - s.rewardedReferrals
          if (n <= 0) return {}
          return {
            rewardedReferrals: total,
            bonusXp: Math.max(0, s.bonusXp + n * REF_REWARD.xp),
            coins: Math.max(0, s.coins + n * REF_REWARD.coins),
          }
        }),
    }),
    {
      name: 'finance-mini-app:v1',
      version: 16,
      storage: createJSONStorage(() => throttledStorage),
      // Нормализуем снимок ПОСЛЕ миграций и перед тем, как он станет состоянием.
      merge: (persisted, current) => ({ ...current, ...sanitizePersisted(persisted) }),
      migrate: (persisted: any, version) => {
        // v1 хранил selectedMonth — переносим на period
        if (persisted && version < 2) {
          if (!persisted.period) {
            persisted.period = { mode: 'month', anchor: todayISO() }
          }
          if (!persisted.customCategories) persisted.customCategories = []
          delete persisted.selectedMonth
        }
        // v3: рубль больше не валюта по умолчанию — переносим старый дефолт на доллар
        if (persisted && version < 3) {
          if (persisted.currency === 'RUB') persisted.currency = 'USD'
        }
        // v5: серия дней + надетые награды (роудпасс)
        if (persisted && version < 5) {
          if (!persisted.streak) persisted.streak = { count: 0, best: 0, lastClaim: null }
          if (!persisted.equipped) persisted.equipped = { ...DEFAULT_EQUIPPED }
        }
        // v6: магазин наград — список купленных. Уже надетое считаем купленным.
        if (persisted && version < 6) {
          if (!Array.isArray(persisted.owned)) persisted.owned = [...DEFAULT_OWNED]
          if (persisted.equipped) {
            for (const id of Object.values(persisted.equipped)) {
              if (typeof id === 'string' && !persisted.owned.includes(id)) persisted.owned.push(id)
            }
          }
        }
        // v7: демо-режим теперь отдельный флаг (не затирает реальные данные)
        if (persisted && version < 7) {
          if (typeof persisted.demoMode !== 'boolean') persisted.demoMode = false
        }
        // v8: язык, цепочка квестов (тайминги), общий бюджет, накопительные цели
        if (persisted && version < 8) {
          if (persisted.lang !== 'ru' && persisted.lang !== 'en') persisted.lang = initialLang()
          if (typeof persisted.questClaims !== 'object' || persisted.questClaims === null) {
            // уже забранные задания считаем выполненными давно (0) — цепочка откроется сразу
            persisted.questClaims = Array.isArray(persisted.claimedQuests)
              ? Object.fromEntries(persisted.claimedQuests.map((id: string) => [id, 0]))
              : {}
          }
          if (typeof persisted.monthlyBudget !== 'number') persisted.monthlyBudget = 0
          if (!Array.isArray(persisted.goals)) persisted.goals = []
        }
        // v9: настраиваемая шапка «Главной» (дата / прогресс к цели)
        if (persisted && version < 9) {
          if (persisted.homeHeaderMode !== 'date' && persisted.homeHeaderMode !== 'goal') {
            persisted.homeHeaderMode = 'date'
          }
          if (typeof persisted.homeHeaderGoalId !== 'string') persisted.homeHeaderGoalId = null
        }
        // v10: счётчики событий вовлечения (задания «за использование приложения»)
        if (persisted && version < 10) {
          if (typeof persisted.events !== 'object' || persisted.events === null) {
            persisted.events = {}
          }
        }
        // v11: per-transaction валюта — запоминаем последнюю использованную
        if (persisted && version < 11) {
          persisted.lastTxCurrency = persisted.currency ?? 'USD'
        }
        // v12: счётчик оплаченных рефералов (фикс-награда за каждого друга)
        if (persisted && version < 12) {
          if (typeof persisted.rewardedReferrals !== 'number') persisted.rewardedReferrals = 0
        }
        // v13: ежедневные напоминания от бота — по умолчанию включены
        if (persisted && version < 13) {
          if (typeof persisted.remindersEnabled !== 'boolean') persisted.remindersEnabled = true
        }
        // v14: раздел «Инвестиции и сбережения»
        if (persisted && version < 14) {
          if (!Array.isArray(persisted.investments)) persisted.investments = []
        }
        // v16: быстрый выбор валют в форме операции (пусто = автоподбор по данным)
        if (persisted && version < 16) {
          if (!Array.isArray(persisted.quickCurrencies)) persisted.quickCurrencies = []
        }
        return persisted
      },
    },
  ),
)

/* ---------- Период ---------- */

/**
 * Период, сдвинутый так, чтобы указанная дата в него попала.
 * `null` — сдвигать не нужно (режим «За всё время» и так показывает всё).
 */
function focusedPeriod(p: Period, dateISO: string): Period | null {
  if (p.mode === 'all') return null
  const anchor = dayjs(dateISO).format('YYYY-MM-DD')
  // Для диапазона переключаемся на месяц нужной даты — иначе операция «потеряется».
  if (p.mode === 'range') return { mode: 'month', anchor }
  return { ...p, anchor }
}

export function periodBounds(p: Period): { start: Dayjs; end: Dayjs } {
  if (p.mode === 'all') {
    return { start: dayjs('1970-01-01'), end: dayjs('2100-01-01') }
  }
  if (p.mode === 'range') {
    const a = dayjs(p.rangeStart ?? todayISO()).startOf('day')
    const b = dayjs(p.rangeEnd ?? todayISO()).startOf('day').add(1, 'day')
    return a.isAfter(b) ? { start: b.subtract(1, 'day'), end: a.add(1, 'day') } : { start: a, end: b }
  }
  const unit = UNIT[p.mode]
  const start = dayjs(p.anchor).startOf(unit)
  return { start, end: start.add(1, unit) }
}

export function periodLabel(p: Period): string {
  if (p.mode === 'all') return 'За всё время'
  const { start, end } = periodBounds(p)
  switch (p.mode) {
    case 'day':
      return start.format('D MMMM')
    case 'week':
      return `${start.format('D MMM')} – ${end.subtract(1, 'day').format('D MMM')}`
    case 'month':
      return start.format('MMMM YYYY')
    case 'year':
      return start.format('YYYY')
    case 'range':
      return `${start.format('D MMM')} – ${end.subtract(1, 'day').format('D MMM YYYY')}`
  }
}

/* ---------- Селекторы ---------- */

/*
 * Как устроена мемоизация и зачем именно так.
 *
 * Раньше результат кэшировался в WeakMap по ссылке на объект состояния. Но
 * zustand создаёт НОВЫЙ объект состояния на каждое изменение, поэтому кэш
 * промахивался всегда: любое изменение (хоть смена темы) заставляло селекторы
 * строить новые массивы, `useStore` видел новую ссылку и будил все подписанные
 * компоненты. Отсюда полная перерисовка дерева на каждую записанную операцию.
 *
 * Теперь два уровня защиты:
 *
 *  1. `deps` (не обязателен) — если перечисленные зависимости не изменились,
 *     тело селектора вообще не выполняется. Экономит вычисления.
 *  2. СОХРАНЕНИЕ ССЫЛКИ — после пересчёта результат сравнивается с предыдущим,
 *     и при совпадении по содержимому отдаётся СТАРАЯ ссылка. Компонент не
 *     перерисовывается.
 *
 * Второй уровень важнее и надёжнее первого: он не зависит от того, правильно ли
 * перечислены зависимости. Даже если `deps` где-то указаны неполно или вовсе
 * отсутствуют, селектор всё равно честно пересчитается — устаревшие данные
 * показать невозможно. `deps` — только оптимизация поверх.
 */

/** Совпадают ли списки зависимостей (поэлементно, по ссылке). */
function sameDeps(a: readonly unknown[] | undefined, b: readonly unknown[]): boolean {
  if (!a || a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false
  return true
}

/** Равенство объектов по собственным полям (один уровень). */
function sameFields(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  const ka = Object.keys(a as object)
  const kb = Object.keys(b as object)
  if (ka.length !== kb.length) return false
  const ra = a as Record<string, unknown>
  const rb = b as Record<string, unknown>
  for (const k of ka) if (!Object.is(ra[k], rb[k])) return false
  return true
}

/**
 * Одинаков ли результат селектора по содержимому.
 *
 * Глубина — два уровня, и этого ровно хватает: массивы транзакций состоят из тех
 * же самых объектов (сравнение по ссылке отрабатывает сразу), а агрегаты
 * категорий каждый раз собираются заново, но из тех же значений — их сравниваем
 * по полям. Глубже не идём, чтобы стоимость сравнения оставалась линейной.
 */
function sameResult(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) if (!sameFields(a[i], b[i])) return false
    return true
  }
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  // Словарь вида { RUB: { income, expense, balance } } — значения тоже сравниваем
  // по полям, иначе вложенные объекты всегда «разные» и ссылка не переиспользуется.
  const ka = Object.keys(a as object)
  const kb = Object.keys(b as object)
  if (ka.length !== kb.length) return false
  const ra = a as Record<string, unknown>
  const rb = b as Record<string, unknown>
  for (const k of ka) if (!sameFields(ra[k], rb[k])) return false
  return true
}

function memo1<R>(fn: (s: State) => R, deps?: (s: State) => readonly unknown[]): (s: State) => R {
  let lastState: State | undefined
  let lastDeps: readonly unknown[] | undefined
  let last: R
  let filled = false

  return (s) => {
    if (filled) {
      if (lastState === s) return last
      if (deps) {
        const d = deps(s)
        if (sameDeps(lastDeps, d)) {
          lastState = s
          return last
        }
        lastDeps = d
      }
    } else if (deps) {
      lastDeps = deps(s)
    }
    const next = fn(s)
    lastState = s
    if (filled && sameResult(last, next)) return last
    last = next
    filled = true
    return last
  }
}

/**
 * То же для селекторов с параметром. Кэш — обычный Map по параметру: значения
 * параметров у нас перечислимы и их немного (вид операции, id категории,
 * гранулярность), так что расти ему некуда.
 */
function memo2<P, R>(
  fn: (s: State, p: P) => R,
  deps?: (s: State, p: P) => readonly unknown[],
): (s: State, p: P) => R {
  interface Entry {
    state?: State
    deps?: readonly unknown[]
    value: R
    filled: boolean
  }
  const cache = new Map<P, Entry>()

  return (s, p) => {
    let e = cache.get(p)
    if (!e) {
      e = { value: undefined as R, filled: false }
      cache.set(p, e)
    }
    if (e.filled) {
      if (e.state === s) return e.value
      if (deps) {
        const d = deps(s, p)
        if (sameDeps(e.deps, d)) {
          e.state = s
          return e.value
        }
        e.deps = d
      }
    } else if (deps) {
      e.deps = deps(s, p)
    }
    const next = fn(s, p)
    e.state = s
    if (e.filled && sameResult(e.value, next)) return e.value
    e.value = next
    e.filled = true
    return e.value
  }
}

/**
 * Источник транзакций для финансовых экранов: демо-набор, если включён
 * демо-режим, иначе реальные данные пользователя. Профиль/уровни/задания
 * читают `s.transactions` напрямую и демо не затрагивает их.
 */
export const activeTransactions: (s: State) => Transaction[] = memo1(
  (s) => (s.demoMode ? demoTransactions() : s.transactions),
  (s) => [s.demoMode, s.transactions],
)

/** Все категории: встроенные + пользовательские. */
export const selectAllCategories: (s: State) => Category[] = memo1(
  (s) => [...DEFAULT_CATEGORIES, ...s.customCategories],
  (s) => [s.customCategories],
)

export const selectCategoriesByKind: (s: State, kind: CategoryKind) => Category[] = memo2(
  (s, kind) => selectAllCategories(s).filter((c) => c.kind === kind),
  (s) => [selectAllCategories(s)],
)

export const selectPeriodTransactions: (s: State) => Transaction[] = memo1(
  (s) => {
    const { start, end } = periodBounds(s.period)
    const lo = +start
    const hi = +end
    // parseDay, а не dayjs(): цикл идёт по всем операциям, а dayjs создаёт
    // объект-обёртку на каждый вызов. И не Date.parse — он разбирает дату без
    // времени как полночь UTC, см. [[lib/day]].
    return activeTransactions(s).filter((t) => {
      const x = parseDay(t.date)
      return x >= lo && x < hi
    })
  },
  (s) => [activeTransactions(s), s.period],
)

export function selectBalance(s: State): number {
  const month = selectPeriodTransactions(s)
  return month.reduce((acc, t) => acc + (t.type === 'income' ? t.amount : -t.amount), 0)
}

/** Валюта операции с фолбэком на глобальную (для старых записей без currency). */
const txCurrency = (t: Transaction, s: State): Currency => t.currency ?? s.currency

/**
 * Список доступных «счетов» = валюты, встречающиеся в данных (для переключателя
 * счёта в Аналитике). Если валюта одна — переключатель не показываем.
 */
export const selectAccounts: (s: State) => Currency[] = memo1((s) => {
  const seen = new Set<Currency>()
  for (const t of activeTransactions(s)) seen.add(txCurrency(t, s))
  return [...seen]
})

/**
 * Транзакции текущего периода с учётом выбранного «счёта»: если account задан —
 * только операции этой валюты, иначе все (прежнее поведение). База для всех
 * аналитических агрегатов (диаграмма / категории / по дням).
 */
export const selectAccountTransactions: (s: State) => Transaction[] = memo1(
  (s) => {
    const txs = selectPeriodTransactions(s)
    if (!s.account) return txs
    return txs.filter((t) => txCurrency(t, s) === s.account)
  },
  // s.currency — потому что txCurrency подставляет её операциям без своей валюты.
  (s) => [selectPeriodTransactions(s), s.account, s.currency],
)

/** Валюта для подписей в Аналитике: выбранный счёт или глобальная. */
export function selectAnalyticsCurrency(s: State): Currency {
  return s.account ?? s.currency
}

function sumIncomeExpense(txs: Transaction[]): { income: number; expense: number } {
  return txs.reduce(
    (acc, t) => {
      if (t.type === 'income') acc.income += t.amount
      else acc.expense += t.amount
      return acc
    },
    { income: 0, expense: 0 },
  )
}

export const selectTotals: (s: State) => { income: number; expense: number } = memo1((s) =>
  sumIncomeExpense(selectPeriodTransactions(s)),
)

/** Итоги периода по выбранному счёту (для диаграммы Аналитики). */
export const selectAccountTotals: (s: State) => { income: number; expense: number } = memo1((s) =>
  sumIncomeExpense(selectAccountTransactions(s)),
)

/** Общий баланс за всё время (доходы − расходы) — для целей с синхронизацией. */
export const selectNetBalance: (s: State) => number = memo1((s) =>
  activeTransactions(s).reduce((acc, t) => acc + (t.type === 'income' ? t.amount : -t.amount), 0),
)

/**
 * Баланс за всё время по каждой валюте (доходы − расходы). Для целей с
 * синхронизацией и заданной валютой — чтобы €-цель считалась по €-операциям,
 * а не по смешанной сумме всех валют.
 */
export const selectNetBalanceByCurrency: (s: State) => Record<string, number> = memo1((s) => {
  const result: Record<string, number> = {}
  for (const t of activeTransactions(s)) {
    const cur = t.currency ?? s.currency
    result[cur] = (result[cur] ?? 0) + (t.type === 'income' ? t.amount : -t.amount)
  }
  return result
})

/**
 * Итоги текущего периода, сгруппированные по валюте операции.
 * Старые транзакции без явной currency попадают в глобальную s.currency.
 * Используется для отображения мультивалютного баланса в BalanceCard.
 */
export const selectTotalsByCurrency: (
  s: State,
) => Record<string, { income: number; expense: number; balance: number }> = memo1((s) => {
  const txs = selectPeriodTransactions(s)
  const result: Record<string, { income: number; expense: number; balance: number }> = {}
  for (const t of txs) {
    const cur = t.currency ?? s.currency
    if (!result[cur]) result[cur] = { income: 0, expense: 0, balance: 0 }
    if (t.type === 'income') {
      result[cur].income += t.amount
      result[cur].balance += t.amount
    } else {
      result[cur].expense += t.amount
      result[cur].balance -= t.amount
    }
  }
  return result
})

/**
 * Сколько «накоплено» по цели: для синхронизированной с балансом — текущий
 * общий баланс (не уходит в минус), иначе сумма ручных взносов.
 */
export function goalSavedAmount(s: State, g: Goal): number {
  if (!g.syncBalance) return g.saved
  const cur = g.currency ?? s.currency
  return Math.max(0, selectNetBalanceByCurrency(s)[cur] ?? 0)
}

export interface CategoryAggregate {
  categoryId: string
  name: string
  color: string
  icon: string
  amount: number
  count: number
  pct: number
  kind: CategoryKind
  /**
   * Валюта категории: если все операции в одной валюте — она; если смешаны
   * (бывает только в режиме «Все») — fallback (валюта аналитики/счёта). Нужна,
   * чтобы сумма показывалась в правильном символе (например 80 € вместо 80 ₴).
   */
  currency: Currency
}

function aggregateByCategory(
  all: Category[],
  txs: Transaction[],
  kind: CategoryKind,
  fallback: Currency,
): CategoryAggregate[] {
  const month = txs.filter((t) => t.type === kind)
  const map = new Map<string, { amount: number; count: number; currency: Currency | 'mixed' | null }>()

  for (const t of month) {
    const entry = map.get(t.categoryId) ?? { amount: 0, count: 0, currency: null as Currency | 'mixed' | null }
    const cur = t.currency ?? fallback
    entry.amount += t.amount
    entry.count += 1
    entry.currency = entry.currency === null ? cur : entry.currency === cur ? cur : 'mixed'
    map.set(t.categoryId, entry)
  }

  const total = month.reduce((sum, t) => sum + t.amount, 0) || 1

  return all
    .filter((c) => c.kind === kind && map.has(c.id))
    .map((c) => {
      const v = map.get(c.id)!
      return {
        categoryId: c.id,
        name: c.name,
        color: c.color,
        icon: c.icon,
        amount: v.amount,
        count: v.count,
        pct: (v.amount / total) * 100,
        kind: c.kind,
        currency: v.currency && v.currency !== 'mixed' ? v.currency : fallback,
      }
    })
    .sort((a, b) => b.amount - a.amount)
}

export const selectByCategory: (s: State, kind: CategoryKind) => CategoryAggregate[] = memo2((s, kind) =>
  aggregateByCategory(selectAllCategories(s), selectPeriodTransactions(s), kind, s.currency),
)

/** Категории по выбранному счёту (для Аналитики). */
export const selectByCategoryAccount: (s: State, kind: CategoryKind) => CategoryAggregate[] = memo2(
  (s, kind) => aggregateByCategory(selectAllCategories(s), selectAccountTransactions(s), kind, selectAnalyticsCurrency(s)),
)

/** Операции категории за период с учётом выбранного счёта (для раскрытия строки). */
export const selectTransactionsByCategory: (s: State, categoryId: string) => Transaction[] = memo2(
  (s, categoryId) =>
    selectAccountTransactions(s)
      .filter((t) => t.categoryId === categoryId)
      .sort((a, b) => (a.date < b.date ? 1 : -1)),
)

export interface BudgetStatus {
  categoryId: string
  name: string
  color: string
  icon: string
  limit: number
  spent: number
  ratio: number
  level: 'ok' | 'warn' | 'over'
}

/**
 * Бюджеты — месячная концепция, поэтому статусы считаем только когда выбран
 * режим «Месяц». В остальных режимах возвращаем [] (полос/плашек нет).
 */
export const selectBudgetStatuses: (s: State) => BudgetStatus[] = memo1((s) => {
  if (s.period.mode !== 'month') return []
  const all = selectAllCategories(s)
  // С учётом выбранного счёта: расход считаем в той же валюте, что и аналитика.
  const month = selectAccountTransactions(s).filter((t) => t.type === 'expense')
  const spentByCat = new Map<string, number>()
  for (const t of month) {
    spentByCat.set(t.categoryId, (spentByCat.get(t.categoryId) ?? 0) + t.amount)
  }
  return Object.entries(s.budgets)
    .filter(([, limit]) => limit > 0)
    .map(([categoryId, limit]) => {
      const cat = getCategory(categoryId, all)
      const spent = spentByCat.get(categoryId) ?? 0
      const ratio = spent / limit
      const level: BudgetStatus['level'] = ratio >= 1 ? 'over' : ratio >= 0.8 ? 'warn' : 'ok'
      return { categoryId, name: cat.name, color: cat.color, icon: cat.icon, limit, spent, ratio, level }
    })
    .sort((a, b) => b.ratio - a.ratio)
})

export const selectExceededBudgets: (s: State) => BudgetStatus[] = memo1((s) =>
  selectBudgetStatuses(s).filter((b) => b.level !== 'ok'),
)

/**
 * Расход за ТЕКУЩИЙ календарный месяц (для общего месячного бюджета на вкладке
 * «Планирование»). Не зависит от выбранного периода просмотра.
 */
export const selectCurrentMonthExpense: (s: State) => number = memo1((s) => {
  const start = +dayjs().startOf('month')
  const end = +dayjs().startOf('month').add(1, 'month')
  return activeTransactions(s)
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => {
      const x = parseDay(t.date)
      return x >= start && x < end ? sum + t.amount : sum
    }, 0)
})

/**
 * Расход текущего календарного месяца в разрезе категорий — основа вкладки
 * «Лимиты». Не зависит от выбранного периода просмотра (лимиты всегда месячные).
 */
/* ---------- Быстрый повтор частых операций ---------- */

export interface FrequentEntry {
  categoryId: string
  amount: number
  currency: Currency
  /** Сколько раз такая пара встретилась в окне — по нему и сортируем. */
  count: number
}

/** Окно поиска привычек и порог, ниже которого пара — просто случайная запись. */
const FREQUENT_WINDOW_DAYS = 90
const FREQUENT_MIN_COUNT = 2
const FREQUENT_MAX = 4

/**
 * Частые операции: пары «категория + сумма», которые человек записывает
 * регулярно (кофе, метро, обед). Нужны для повтора в один тап — самый частый
 * сценарий в трекере расходов.
 *
 * Совпадение суммы требуется точное: привычные траты обычно круглые, а нестрогое
 * сравнение давало бы мусорные подсказки. Пары, встретившиеся один раз, не
 * показываем — это не привычка.
 *
 * Берём `s.transactions`, а не `activeTransactions`: подсказки должны отражать
 * реальные привычки человека. В демо-режиме их просто не будет, и это честнее,
 * чем предлагать повторить выдуманную операцию.
 *
 * Окно считается от `Date.now()` на момент пересчёта; результат кэшируется до
 * следующего изменения операций. За сессию граница окна не сдвигается заметно.
 */
export const selectFrequent: (s: State, kind: CategoryKind) => FrequentEntry[] = memo2(
  (s, kind) => {
    const since = Date.now() - FREQUENT_WINDOW_DAYS * 864e5
    const map = new Map<string, FrequentEntry & { last: number }>()
    for (const t of s.transactions) {
      if (t.type !== kind) continue
      const at = parseDay(t.date)
      if (!Number.isFinite(at) || at < since) continue
      const cur = t.currency ?? s.currency
      const key = `${t.categoryId}|${t.amount}|${cur}`
      const hit = map.get(key)
      if (hit) {
        hit.count += 1
        if (at > hit.last) hit.last = at
      } else {
        map.set(key, { categoryId: t.categoryId, amount: t.amount, currency: cur, count: 1, last: at })
      }
    }
    return [...map.values()]
      .filter((e) => e.count >= FREQUENT_MIN_COUNT)
      .sort((a, b) => b.count - a.count || b.last - a.last)
      .slice(0, FREQUENT_MAX)
      .map(({ categoryId, amount, currency, count }) => ({ categoryId, amount, currency, count }))
  },
  (s) => [s.transactions, s.currency],
)

/* ---------- Остаток на сегодня ---------- */

export interface DailyAllowance {
  /** Сколько можно тратить в день, чтобы уложиться в остаток месяца. */
  perDay: number
  /** Сколько ещё можно потратить сегодня (может быть отрицательным). */
  leftToday: number
  spentToday: number
  daysLeft: number
}

/**
 * Дневной лимит из месячного бюджета. Пересчитывается каждый день от ОСТАТКА
 * бюджета, а не делит бюджет поровну изначально: перерасход сегодня ужимает
 * завтрашний лимит, экономия — расширяет. Это и делает подсказку живой.
 *
 * `null`, когда месячный бюджет не задан — тогда показывать нечего.
 */
export const selectDailyAllowance: (s: State) => DailyAllowance | null = memo1(
  (s) => {
    if (!(s.monthlyBudget > 0)) return null
    const now = dayjs()
    const monthStart = +now.startOf('month')
    const monthEnd = +now.startOf('month').add(1, 'month')
    const dayStart = +now.startOf('day')

    let spentMonth = 0
    let spentToday = 0
    for (const t of activeTransactions(s)) {
      if (t.type !== 'expense') continue
      const at = parseDay(t.date)
      if (at < monthStart || at >= monthEnd) continue
      spentMonth += t.amount
      if (at >= dayStart) spentToday += t.amount
    }

    // Сегодняшний день тоже считается оставшимся — иначе в последний день месяца
    // получилось бы деление на ноль.
    const daysLeft = Math.max(1, now.daysInMonth() - now.date() + 1)
    const perDay = Math.max(0, (s.monthlyBudget - spentMonth + spentToday) / daysLeft)
    return { perDay, leftToday: perDay - spentToday, spentToday, daysLeft }
  },
  (s) => [activeTransactions(s), s.monthlyBudget],
)

export const selectCurrentMonthExpenseByCategory: (s: State) => Record<string, number> = memo1((s) => {
  const start = +dayjs().startOf('month')
  const end = +dayjs().startOf('month').add(1, 'month')
  const out: Record<string, number> = {}
  for (const t of activeTransactions(s)) {
    if (t.type !== 'expense') continue
    const x = parseDay(t.date)
    if (x < start || x >= end) continue
    out[t.categoryId] = (out[t.categoryId] ?? 0) + t.amount
  }
  return out
})

/** За сколько последних ПОЛНЫХ месяцев считаем средний расход категории. */
const AVG_MONTHS = 3

/**
 * Средний месячный расход по категориям за последние `AVG_MONTHS` полных месяцев.
 * Текущий месяц исключён — он ещё не закончился и занижал бы среднее.
 * Нужен для подсказки «поставить лимит из среднего»: главный барьер при
 * настройке лимитов — не знать, какую цифру вписать.
 */
export const selectAvgMonthlyExpenseByCategory: (s: State) => Record<string, number> = memo1((s) => {
  const start = +dayjs().startOf('month').subtract(AVG_MONTHS, 'month')
  const end = +dayjs().startOf('month')
  const sums: Record<string, number> = {}
  for (const t of activeTransactions(s)) {
    if (t.type !== 'expense') continue
    const x = parseDay(t.date)
    if (x < start || x >= end) continue
    sums[t.categoryId] = (sums[t.categoryId] ?? 0) + t.amount
  }
  const out: Record<string, number> = {}
  for (const [id, sum] of Object.entries(sums)) out[id] = Math.round(sum / AVG_MONTHS)
  return out
})

/* ---------- Метрики для финансовых заданий ---------- */
/*
 * Считаются по РЕАЛЬНЫМ операциям (`s.transactions`), а не `activeTransactions`:
 * задания/профиль демо-режимом не затрагиваются (правило проекта). Возвращают
 * примитивы, поэтому ререндер-варнингов нет; memo1 — ради стабильности перерасчёта.
 */

/** Сколько различных категорий использовано (для задания «5 разных категорий»). */
export const selectCategoriesUsed: (s: State) => number = memo1(
  (s) => new Set(s.transactions.map((t) => t.categoryId)).size,
  (s) => [s.transactions],
)


/**
 * Текущая серия дней подряд с хотя бы одной операцией. Считаем назад от сегодня;
 * если за сегодня записей ещё нет — стартуем со вчера (день не «закрыт»).
 * Для задания «веди учёт N дней подряд».
 */
export const selectLogDayStreak: (s: State) => number = memo1(
  (s) => {
    const days = new Set<number>()
    for (const t of s.transactions) {
      const at = parseDay(t.date)
      if (Number.isFinite(at)) days.add(at)
    }
    if (days.size === 0) return 0

    // Серия считается от сегодня; если сегодня записи нет — от вчера, иначе
    // вечерний заход до первой траты обнулял бы честную серию.
    let cursor = localDayKey(Date.now())
    if (!days.has(cursor)) cursor = prevDayKey(cursor)
    let streak = 0
    while (days.has(cursor)) {
      streak += 1
      cursor = prevDayKey(cursor)
    }
    return streak
  },
  (s) => [s.transactions],
)

/** Сколько накопительных целей полностью достигнуто (для задания «достигни цели»). */
/** Валюты быстрого выбора в форме: заданные вручную либо подобранные по данным. */
export const selectQuickCurrencies: (s: State) => Currency[] = memo1((s) =>
  s.quickCurrencies.length > 0 ? s.quickCurrencies.slice(0, 3) : quickCurrenciesOf(s),
)

export const selectGoalsReached: (s: State) => number = memo1(
  (s) => s.goals.filter((g) => g.target > 0 && goalSavedAmount(s, g) >= g.target).length,
  // Цели с syncBalance читают баланс по валютам — он и стоит в зависимостях.
  (s) => [s.goals, selectNetBalanceByCurrency(s), s.currency],
)

/**
 * 1, если задан общий месячный бюджет и расход текущего календарного месяца
 * (по реальным операциям) больше нуля и укладывается в бюджет; иначе 0.
 * Для задания «удержи месяц в пределах бюджета».
 */
export const selectBudgetMonthKept: (s: State) => number = memo1(
  (s) => {
    if (s.monthlyBudget <= 0) return 0
    const start = +dayjs().startOf('month')
    const end = +dayjs().startOf('month').add(1, 'month')
    let spent = 0
    for (const t of s.transactions) {
      if (t.type !== 'expense') continue
      const x = parseDay(t.date)
      if (x >= start && x < end) spent += t.amount
    }
    return spent > 0 && spent <= s.monthlyBudget ? 1 : 0
  },
  (s) => [s.transactions, s.monthlyBudget],
)

/**
 * Расходы по дням периода, по возрастанию даты.
 *
 * Ключ — метка дня (число), а НЕ подпись «ДД.ММ»: раньше сортировка шла по
 * строке, и на периоде, пересекающем границу месяца, порядок ломался —
 * «01.08» вставало перед «29.07». А `DailyBars` берёт последние 14 записей
 * по порядку массива, то есть показывал не те дни.
 */
function dailyExpense(txs: Transaction[]): { day: string; amount: number }[] {
  const map = new Map<number, number>()
  for (const t of txs) {
    if (t.type !== 'expense') continue
    const key = parseDay(t.date)
    if (!Number.isFinite(key)) continue
    map.set(key, (map.get(key) ?? 0) + t.amount)
  }
  const pad = (n: number) => String(n).padStart(2, '0')
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([key, amount]) => {
      const d = new Date(key)
      return { day: `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`, amount }
    })
}

export const selectDailyExpense: (s: State) => { day: string; amount: number }[] = memo1((s) =>
  dailyExpense(selectPeriodTransactions(s)),
)

/** Расходы по дням для выбранного счёта (Аналитика). */
export const selectDailyExpenseAccount: (s: State) => { day: string; amount: number }[] = memo1((s) =>
  dailyExpense(selectAccountTransactions(s)),
)

/* ---------- Тренды (экран Графики) ---------- */

export type TrendGranularity = 'day' | 'week' | 'month' | 'year'

export interface TrendBucket {
  label: string
  income: number
  expense: number
}

const TREND_COUNT: Record<TrendGranularity, number> = { day: 14, week: 12, month: 12, year: 5 }
/** Меньше корзин на графике не оставляем, даже если данных совсем немного. */
const TREND_MIN_BUCKETS = 4

function trendLabel(d: Dayjs, g: TrendGranularity): string {
  switch (g) {
    case 'day':
      return d.format('D.MM')
    case 'week':
      return d.startOf('week').format('D.MM')
    case 'month':
      return d.format('MMM')
    case 'year':
      return d.format('YYYY')
  }
}

/** Параметр — гранулярность (строка), чтобы memo2 кэшировал по ключу. */
export const selectTrend: (s: State, g: TrendGranularity) => TrendBucket[] = memo2((s, g) => {
  const n = TREND_COUNT[g]
  const unit: dayjs.ManipulateType = g
  const now = dayjs()
  const buckets = Array.from({ length: n }, (_, i) => {
    const d = now.subtract(n - 1 - i, unit)
    const start = d.startOf(unit)
    return { start: +start, end: +start.add(1, unit), label: trendLabel(d, g), income: 0, expense: 0 }
  })
  for (const t of activeTransactions(s)) {
    // Счёт = валюта: в режиме выбранного счёта берём только его валюту,
    // иначе (s.account === null, «Все») суммы смешивались бы — но тогда и
    // форматируем по глобальной валюте (selectAnalyticsCurrency), как раньше.
    if (s.account && txCurrency(t, s) !== s.account) continue
    const x = parseDay(t.date)
    const b = buckets.find((bk) => x >= bk.start && x < bk.end)
    if (!b) continue
    if (t.type === 'income') b.income += t.amount
    else b.expense += t.amount
  }
  // Пустое прошлое не рисуем: у нового пользователя из двенадцати месяцев
  // одиннадцать были бы нулевыми, и график выглядел бы поломанным. Оставляем
  // минимум четыре корзины, чтобы не схлопнуть его в один столбик.
  const firstActive = buckets.findIndex((b) => b.income > 0 || b.expense > 0)
  const visible = firstActive > 0 ? buckets.slice(Math.min(firstActive, buckets.length - TREND_MIN_BUCKETS)) : buckets

  return visible.map(({ label, income, expense }) => ({ label, income, expense }))
})

/* ---------- Обзор (первый сегмент Аналитики) ---------- */

/** Сколько прошлых периодов берём для «обычной нормы» категории. */
const OVERVIEW_LOOKBACK = 3
/** Глубина истории для поиска регулярных платежей. */
const OVERVIEW_HISTORY_DAYS = 400

/**
 * Границы предыдущих периодов такой же длины, свежайший первым.
 * Для «за всё время» предыдущего периода не существует — сравнивать не с чем.
 */
function previousWindows(p: Period, n: number): { start: number; end: number }[] {
  if (p.mode === 'all') return []
  const out: { start: number; end: number }[] = []

  if (p.mode === 'range') {
    // Произвольный диапазон сдвигаем на собственную длину.
    const { start, end } = periodBounds(p)
    const len = +end - +start
    for (let i = 1; i <= n; i++) out.push({ start: +start - len * i, end: +end - len * i })
    return out
  }

  const unit = UNIT[p.mode]
  for (let i = 1; i <= n; i++) {
    const anchor = dayjs(p.anchor).subtract(i, unit).format('YYYY-MM-DD')
    const { start, end } = periodBounds({ ...p, anchor })
    out.push({ start: +start, end: +end })
  }
  return out
}

/**
 * Всё, что нужно вкладке «Обзор», одним объектом.
 *
 * Один селектор, а не десяток: экран показывает срез целиком, а каждая
 * отдельная подписка — это ещё один шанс разбудить дерево. Считает он больше
 * остальных, поэтому deps перечислены честно: без изменения данных, периода,
 * счёта или лимита тело не выполняется вовсе.
 */
export const selectOverview: (s: State) => Overview = memo1(
  (s) => {
    const { start, end } = periodBounds(s.period)
    const account = s.account
    const inAccount = (t: Transaction) => !account || txCurrency(t, s) === account
    const all = activeTransactions(s)

    const windows = previousWindows(s.period, OVERVIEW_LOOKBACK)
    const previous: Transaction[][] = windows.map(() => [])

    // Один проход по истории на все окна сразу: операций может быть тысячи.
    for (const t of all) {
      if (!inAccount(t)) continue
      const x = parseDay(t.date)
      if (!Number.isFinite(x)) continue
      for (let i = 0; i < windows.length; i++) {
        if (x >= windows[i].start && x < windows[i].end) {
          previous[i].push(t)
          break
        }
      }
    }

    return buildOverview({
      current: selectAccountTransactions(s),
      previous,
      categories: selectAllCategories(s),
      currency: selectAnalyticsCurrency(s),
      startKey: localDayKey(+start),
      endKey: localDayKey(+end),
      now: Date.now(),
      budget: s.monthlyBudget,
      // Лимит месячный — на неделе или годе полоса врала бы.
      budgetApplies: s.period.mode === 'month',
    })
  },
  (s) => [activeTransactions(s), s.period, s.account, s.currency, s.monthlyBudget, s.customCategories],
)

/**
 * Постоянные траты — то, что списывается каждый месяц одинаковой суммой.
 *
 * Отдельно от selectOverview и БЕЗ привязки к выбранному периоду: это срез
 * текущих обязательств. Иначе, листая июль в Аналитике, пользователь терял бы
 * подсказку «пора записать» на Главной.
 */
export const selectRecurring: (s: State) => Recurring[] = memo1(
  (s) => {
    const since = Date.now() - OVERVIEW_HISTORY_DAYS * DAY_MS
    const account = s.account
    const history: Transaction[] = []
    for (const t of activeTransactions(s)) {
      if (account && txCurrency(t, s) !== account) continue
      const x = parseDay(t.date)
      if (Number.isFinite(x) && x >= since) history.push(t)
    }
    const byId = new Map(selectAllCategories(s).map((c) => [c.id, c]))
    return buildRecurring(history, Date.now(), byId, selectAnalyticsCurrency(s))
  },
  (s) => [activeTransactions(s), s.account, s.currency, s.customCategories],
)

/**
 * Итоги прошедшего месяца — для карточки на Главной.
 *
 * Считаются по всем операциям, без учёта выбранного счёта и периода: это
 * ретроспектива, а не срез, и она не должна меняться от того, что человек
 * листает Аналитику.
 */
export const selectMonthlySummary: (s: State) => MonthlySummary | null = memo1(
  (s) => {
    const { start, end, prevStart } = previousMonthBounds(Date.now())
    const month: Transaction[] = []
    const prev: Transaction[] = []
    for (const t of activeTransactions(s)) {
      const x = parseDay(t.date)
      if (!Number.isFinite(x)) continue
      if (x >= start && x < end) month.push(t)
      else if (x >= prevStart && x < start) prev.push(t)
    }
    return buildMonthlySummary({
      month,
      prev,
      categories: selectAllCategories(s),
      monthStart: start,
      monthEnd: end,
    })
  },
  (s) => [activeTransactions(s), s.customCategories],
)

/* ---------- Помесячный след категории ---------- */

/** Сколько месяцев показываем в карточке категории. */
const CATEGORY_MONTHS = 6

export interface CategoryMonth {
  /** Короткая подпись месяца («авг.»). */
  label: string
  amount: number
  /** Начало месяца — ключом для React и для сортировки. */
  start: number
}

/**
 * Расходы категории по месяцам — «а как было раньше».
 *
 * Не зависит от выбранного периода: смысл именно в том, чтобы увидеть след
 * категории за полгода, каким бы месяцем ни листали Аналитику. Счёт при этом
 * учитывается — иначе в мультивалютном профиле сложились бы разные валюты.
 */
export const selectCategoryMonths: (s: State, categoryId: string) => CategoryMonth[] = memo2(
  (s, categoryId) => {
    const now = dayjs().startOf('month')
    const buckets = Array.from({ length: CATEGORY_MONTHS }, (_, i) => {
      const d = now.subtract(CATEGORY_MONTHS - 1 - i, 'month')
      return { start: +d, end: +d.add(1, 'month'), label: d.format('MMM'), amount: 0 }
    })
    for (const t of activeTransactions(s)) {
      if (t.type !== 'expense' || t.categoryId !== categoryId) continue
      if (s.account && txCurrency(t, s) !== s.account) continue
      const x = parseDay(t.date)
      if (!Number.isFinite(x)) continue
      for (const b of buckets) {
        if (x >= b.start && x < b.end) {
          b.amount += t.amount
          break
        }
      }
    }
    return buckets.map(({ label, amount, start }) => ({ label, amount, start }))
  },
  (s, categoryId) => [activeTransactions(s), s.account, s.currency, categoryId],
)

export { getCategory }
