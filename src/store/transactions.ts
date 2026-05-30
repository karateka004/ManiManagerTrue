import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import dayjs, { type Dayjs } from 'dayjs'
import type { CategoryKind, Category } from './categories'
import { DEFAULT_CATEGORIES, getCategory } from './categories'
import type { Currency } from '../lib/currencies'

export interface Transaction {
  id: string
  type: CategoryKind
  amount: number
  categoryId: string
  note?: string
  tags?: string[]
  /** ISO date string */
  date: string
}

export type ChartStyle = 'compact' | 'icons'
export type ThemeMode = 'auto' | 'light' | 'dark'

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
}

interface Actions {
  addTransaction: (t: Omit<Transaction, 'id'>) => void
  removeTransaction: (id: string) => void
  setPeriodMode: (mode: PeriodMode) => void
  shiftPeriod: (delta: number) => void
  setRange: (start: string, end: string) => void
  setCurrency: (c: State['currency']) => void
  setChartStyle: (s: ChartStyle) => void
  setBudget: (categoryId: string, amount: number) => void
  setThemeMode: (m: ThemeMode) => void
  addCategory: (c: Omit<Category, 'id' | 'custom'>) => void
  updateCategory: (id: string, patch: Partial<Omit<Category, 'id' | 'custom'>>) => void
  removeCategory: (id: string) => void
  clearAll: () => void
  seedDemo: () => void
}

const cuid = () => Math.random().toString(36).slice(2) + Date.now().toString(36)

const todayISO = () => dayjs().format('YYYY-MM-DD')

const UNIT: Record<Exclude<PeriodMode, 'all' | 'range'>, dayjs.ManipulateType> = {
  day: 'day',
  week: 'week',
  month: 'month',
  year: 'year',
}

export const useStore = create<State & Actions>()(
  persist(
    (set, get) => ({
      transactions: [],
      period: { mode: 'month', anchor: todayISO() },
      currency: 'RUB',
      chartStyle: 'icons',
      budgets: {},
      themeMode: 'auto',
      customCategories: [],

      addTransaction: (t) =>
        set((s) => ({ transactions: [{ ...t, id: cuid() }, ...s.transactions] })),
      removeTransaction: (id) =>
        set((s) => ({ transactions: s.transactions.filter((t) => t.id !== id) })),

      setPeriodMode: (mode) =>
        set(() => {
          if (mode === 'range') {
            const start = dayjs().startOf('month').format('YYYY-MM-DD')
            const end = dayjs().format('YYYY-MM-DD')
            return { period: { mode, anchor: todayISO(), rangeStart: start, rangeEnd: end } }
          }
          return { period: { mode, anchor: todayISO() } }
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

      setCurrency: (c) => set({ currency: c }),
      setChartStyle: (s) => set({ chartStyle: s }),
      setBudget: (categoryId, amount) =>
        set((s) => {
          const next = { ...s.budgets }
          if (!amount || amount <= 0) delete next[categoryId]
          else next[categoryId] = amount
          return { budgets: next }
        }),
      setThemeMode: (m) => set({ themeMode: m }),

      addCategory: (c) =>
        set((s) => ({
          customCategories: [...s.customCategories, { ...c, id: 'c_' + cuid(), custom: true }],
        })),
      updateCategory: (id, patch) =>
        set((s) => ({
          customCategories: s.customCategories.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        })),
      removeCategory: (id) =>
        set((s) => {
          const nextBudgets = { ...s.budgets }
          delete nextBudgets[id]
          return {
            customCategories: s.customCategories.filter((c) => c.id !== id),
            budgets: nextBudgets,
          }
        }),

      clearAll: () => set({ transactions: [] }),

      seedDemo: () => {
        const now = dayjs()
        const demo: Transaction[] = [
          { id: cuid(), type: 'income',  amount: 85000, categoryId: 'salary',    date: now.date(5).toISOString(), note: 'Зарплата за месяц' },
          { id: cuid(), type: 'expense', amount: 4250,  categoryId: 'food',      date: now.subtract(1, 'day').toISOString() },
          { id: cuid(), type: 'expense', amount: 850,   categoryId: 'cafe',      date: now.subtract(1, 'day').toISOString(), note: 'Кофе и завтрак' },
          { id: cuid(), type: 'expense', amount: 1200,  categoryId: 'transport', date: now.subtract(2, 'day').toISOString() },
          { id: cuid(), type: 'expense', amount: 18500, categoryId: 'home',      date: now.date(3).toISOString(), note: 'Коммуналка' },
          { id: cuid(), type: 'expense', amount: 3200,  categoryId: 'clothes',   date: now.subtract(3, 'day').toISOString() },
          { id: cuid(), type: 'expense', amount: 2400,  categoryId: 'fun',       date: now.subtract(4, 'day').toISOString(), note: 'Кино' },
          { id: cuid(), type: 'expense', amount: 6800,  categoryId: 'food',      date: now.subtract(5, 'day').toISOString() },
          { id: cuid(), type: 'income',  amount: 12000, categoryId: 'freelance', date: now.subtract(6, 'day').toISOString(), note: 'Подработка' },
          { id: cuid(), type: 'expense', amount: 990,   categoryId: 'phone',     date: now.subtract(7, 'day').toISOString() },
          { id: cuid(), type: 'expense', amount: 5400,  categoryId: 'health',    date: now.subtract(8, 'day').toISOString() },
          // прошлый месяц — чтобы графики динамики были живыми
          { id: cuid(), type: 'income',  amount: 80000, categoryId: 'salary',    date: now.subtract(1, 'month').date(5).toISOString() },
          { id: cuid(), type: 'expense', amount: 22000, categoryId: 'home',      date: now.subtract(1, 'month').date(4).toISOString() },
          { id: cuid(), type: 'expense', amount: 9000,  categoryId: 'food',      date: now.subtract(1, 'month').date(10).toISOString() },
        ]
        set({ transactions: demo })
      },
    }),
    {
      name: 'finance-mini-app:v1',
      version: 2,
      storage: createJSONStorage(() => localStorage),
      migrate: (persisted: any, version) => {
        // v1 хранил selectedMonth — переносим на period
        if (persisted && version < 2) {
          if (!persisted.period) {
            persisted.period = { mode: 'month', anchor: todayISO() }
          }
          if (!persisted.customCategories) persisted.customCategories = []
          delete persisted.selectedMonth
        }
        return persisted
      },
    },
  ),
)

/* ---------- Период ---------- */

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

/* ---------- Селекторы (мемоизация по ссылке state через WeakMap) ---------- */

function memo1<R>(fn: (s: State) => R): (s: State) => R {
  const cache = new WeakMap<State, R>()
  return (s) => {
    const hit = cache.get(s)
    if (hit !== undefined) return hit
    const result = fn(s)
    cache.set(s, result)
    return result
  }
}

function memo2<P, R>(fn: (s: State, p: P) => R): (s: State, p: P) => R {
  const cache = new WeakMap<State, Map<P, R>>()
  return (s, p) => {
    let inner = cache.get(s)
    if (inner) {
      const hit = inner.get(p)
      if (hit !== undefined) return hit
    } else {
      inner = new Map()
      cache.set(s, inner)
    }
    const result = fn(s, p)
    inner.set(p, result)
    return result
  }
}

/** Все категории: встроенные + пользовательские. */
export const selectAllCategories: (s: State) => Category[] = memo1((s) => [
  ...DEFAULT_CATEGORIES,
  ...s.customCategories,
])

export const selectCategoriesByKind: (s: State, kind: CategoryKind) => Category[] = memo2((s, kind) =>
  selectAllCategories(s).filter((c) => c.kind === kind),
)

export const selectPeriodTransactions: (s: State) => Transaction[] = memo1((s) => {
  const { start, end } = periodBounds(s.period)
  const lo = +start
  const hi = +end
  return s.transactions.filter((t) => {
    const x = +dayjs(t.date)
    return x >= lo && x < hi
  })
})

export function selectBalance(s: State): number {
  const month = selectPeriodTransactions(s)
  return month.reduce((acc, t) => acc + (t.type === 'income' ? t.amount : -t.amount), 0)
}

export const selectTotals: (s: State) => { income: number; expense: number } = memo1((s) => {
  const month = selectPeriodTransactions(s)
  return month.reduce(
    (acc, t) => {
      if (t.type === 'income') acc.income += t.amount
      else acc.expense += t.amount
      return acc
    },
    { income: 0, expense: 0 },
  )
})

export interface CategoryAggregate {
  categoryId: string
  name: string
  color: string
  icon: string
  amount: number
  count: number
  pct: number
  kind: CategoryKind
}

export const selectByCategory: (s: State, kind: CategoryKind) => CategoryAggregate[] = memo2((s, kind) => {
  const all = selectAllCategories(s)
  const month = selectPeriodTransactions(s).filter((t) => t.type === kind)
  const map = new Map<string, { amount: number; count: number }>()

  for (const t of month) {
    const cur = map.get(t.categoryId) ?? { amount: 0, count: 0 }
    cur.amount += t.amount
    cur.count += 1
    map.set(t.categoryId, cur)
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
      }
    })
    .sort((a, b) => b.amount - a.amount)
})

export const selectTransactionsByCategory: (s: State, categoryId: string) => Transaction[] = memo2(
  (s, categoryId) =>
    selectPeriodTransactions(s)
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
  const month = selectPeriodTransactions(s).filter((t) => t.type === 'expense')
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

export const selectDailyExpense: (s: State) => { day: string; amount: number }[] = memo1((s) => {
  const month = selectPeriodTransactions(s).filter((t) => t.type === 'expense')
  const map = new Map<string, number>()
  for (const t of month) {
    const day = dayjs(t.date).format('DD.MM')
    map.set(day, (map.get(day) ?? 0) + t.amount)
  }
  return [...map.entries()]
    .map(([day, amount]) => ({ day, amount }))
    .sort((a, b) => (a.day < b.day ? -1 : 1))
})

/* ---------- Тренды (экран Графики) ---------- */

export type TrendGranularity = 'day' | 'week' | 'month' | 'year'

export interface TrendBucket {
  label: string
  income: number
  expense: number
}

const TREND_COUNT: Record<TrendGranularity, number> = { day: 14, week: 12, month: 12, year: 5 }

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
  for (const t of s.transactions) {
    const x = +dayjs(t.date)
    const b = buckets.find((bk) => x >= bk.start && x < bk.end)
    if (!b) continue
    if (t.type === 'income') b.income += t.amount
    else b.expense += t.amount
  }
  return buckets.map(({ label, income, expense }) => ({ label, income, expense }))
})

export { getCategory }
