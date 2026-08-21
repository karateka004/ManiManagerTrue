import type { Transaction } from '../store/transactions'
import type { Category } from '../store/categories'
import { DAY_MS, daysBetween, parseDay } from './day'

/**
 * Итоги прошедшего месяца.
 *
 * Считается по тем же правилам, что и «Обзор», но за уже закрытый месяц —
 * это ретроспектива, а не срез. Модуль чистый: границы и операции даёт стор.
 */

/** Меньше — подводить нечего, карточка будет выглядеть пустой. */
export const RECAP_MIN_TX = 5

export interface MonthlySummary {
  /** Первый день подводимого месяца (локальная полночь) — для подписи. */
  monthStart: number
  spent: number
  income: number
  /** Расходы за месяц до него; null — сравнивать не с чем. */
  prevSpent: number | null
  deltaPct: number | null
  count: number
  /** Дни месяца, в которые не было ни одного расхода. */
  freeDays: number
  topCategory: { id: string; name: string; color: string; icon: string; amount: number } | null
  biggest: Transaction | null
}

export interface MonthlyInput {
  /** Операции подводимого месяца. */
  month: Transaction[]
  /** Операции предыдущего месяца — только для сравнения. */
  prev: Transaction[]
  categories: Category[]
  monthStart: number
  monthEnd: number
}

const sumExpense = (txs: Transaction[]) =>
  txs.reduce((acc, t) => (t.type === 'expense' ? acc + t.amount : acc), 0)

export function buildMonthlySummary(input: MonthlyInput): MonthlySummary | null {
  const { month, prev, categories, monthStart, monthEnd } = input
  if (month.length < RECAP_MIN_TX) return null

  const spent = sumExpense(month)
  const income = month.reduce((acc, t) => (t.type === 'income' ? acc + t.amount : acc), 0)
  const prevSpent = prev.length ? sumExpense(prev) : null

  // Дни без единого расхода — та редкая метрика, которой приятно похвастаться.
  const days = Math.max(1, daysBetween(monthStart, monthEnd))
  const spentDays = new Set<number>()
  let count = 0
  for (const t of month) {
    if (t.type !== 'expense') continue
    count += 1
    const i = daysBetween(monthStart, parseDay(t.date))
    if (i >= 0 && i < days) spentDays.add(i)
  }

  const byCategory = new Map<string, number>()
  for (const t of month) {
    if (t.type !== 'expense') continue
    byCategory.set(t.categoryId, (byCategory.get(t.categoryId) ?? 0) + t.amount)
  }

  let topId = ''
  let topAmount = 0
  for (const [id, amount] of byCategory) {
    if (amount > topAmount) {
      topAmount = amount
      topId = id
    }
  }
  const cat = categories.find((c) => c.id === topId)

  let biggest: Transaction | null = null
  for (const t of month) {
    if (t.type !== 'expense') continue
    if (!biggest || t.amount > biggest.amount) biggest = t
  }

  return {
    monthStart,
    spent,
    income,
    prevSpent,
    deltaPct: prevSpent && prevSpent > 0 ? ((spent - prevSpent) / prevSpent) * 100 : null,
    count,
    freeDays: days - spentDays.size,
    topCategory: cat ? { id: cat.id, name: cat.name, color: cat.color, icon: cat.icon, amount: topAmount } : null,
    biggest,
  }
}

/** Ключ месяца «ГГГГ-ММ» — им помечаем, за какой месяц итоги уже показаны. */
export function monthKey(at: number): string {
  const d = new Date(at)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Границы месяца, предшествующего дате. */
export function previousMonthBounds(now: number): { start: number; end: number; prevStart: number } {
  const d = new Date(now)
  const end = new Date(d.getFullYear(), d.getMonth(), 1)
  const start = new Date(d.getFullYear(), d.getMonth() - 1, 1)
  const prevStart = new Date(d.getFullYear(), d.getMonth() - 2, 1)
  return { start: +start, end: +end, prevStart: +prevStart }
}

/** Сколько дней прошло с начала текущего месяца — итоги показываем недолго. */
export function daysIntoMonth(now: number): number {
  const d = new Date(now)
  return Math.round((+d - +new Date(d.getFullYear(), d.getMonth(), 1)) / DAY_MS)
}
