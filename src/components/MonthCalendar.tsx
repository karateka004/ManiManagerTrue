import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useStore, activeTransactions } from '../store/transactions'
import { dayjs, formatMoney } from '../lib/format'
import { useT, weekdaysShort, type Lang } from '../lib/i18n'
import { hapticSelect } from '../lib/telegram'

/** Что показывать под числом дня. */
type CalFilter = 'net' | 'income' | 'expense' | 'both'

const FILTERS: { id: CalFilter; label: string }[] = [
  { id: 'net', label: 'cal.net' },
  { id: 'income', label: 'common.income' },
  { id: 'expense', label: 'common.expense' },
  { id: 'both', label: 'cal.both' },
]

interface DayAgg {
  income: number
  expense: number
}

/**
 * Короткое число для ячейки календаря.
 * До 5 знаков (< 100 000) показываем сумму как есть — без округления и без «к»
 * (4050 → «4050», а не «4,1к», иначе округление вверх искажает дневной итог).
 * От 100 000 — переключаемся на «к» (там ±0.5к уже не существенно): 150 000 → «150к».
 */
function compact(n: number, lang: Lang): string {
  const abs = Math.round(Math.abs(n))
  if (abs < 100000) return abs.toString()
  return Math.round(abs / 1000).toString() + (lang === 'ru' ? 'к' : 'k')
}

export function MonthCalendar() {
  const transactions = useStore(activeTransactions)
  const globalCurrency = useStore((s) => s.currency)
  const account = useStore((s) => s.account)
  const tr = useT()
  const lang = useStore((s) => s.lang)
  const WEEKDAYS = weekdaysShort(lang)
  // По выбранному счёту считаем только его валюту; подписи — в этой валюте.
  const currency = account ?? globalCurrency
  const [month, setMonth] = useState(() => dayjs().startOf('month'))
  const [filter, setFilter] = useState<CalFilter>('net')

  // Агрегация по дням текущего месяца.
  const { byDay, totals } = useMemo(() => {
    const map = new Map<number, DayAgg>()
    const totals: DayAgg = { income: 0, expense: 0 }
    const lo = +month.startOf('month')
    const hi = +month.endOf('month')
    for (const t of transactions) {
      if (account && (t.currency ?? globalCurrency) !== account) continue
      const x = +dayjs(t.date)
      if (x < lo || x > hi) continue
      const d = dayjs(t.date).date()
      const cur = map.get(d) ?? { income: 0, expense: 0 }
      if (t.type === 'income') {
        cur.income += t.amount
        totals.income += t.amount
      } else {
        cur.expense += t.amount
        totals.expense += t.amount
      }
      map.set(d, cur)
    }
    return { byDay: map, totals }
  }, [transactions, month, account, globalCurrency])

  const daysInMonth = month.daysInMonth()
  // Смещение первого дня (неделя с понедельника).
  const offset = (month.startOf('month').day() + 6) % 7
  const today = dayjs()
  const isCurrentMonth = month.isSame(today, 'month')

  // Значение для ячейки по фильтру: число или null (нет данных).
  const cellValue = (agg: DayAgg | undefined): number | null => {
    if (!agg) return null
    if (filter === 'income') return agg.income > 0 ? agg.income : null
    if (filter === 'expense') return agg.expense > 0 ? -agg.expense : null
    const net = agg.income - agg.expense
    return agg.income === 0 && agg.expense === 0 ? null : net
  }

  const cells: (number | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  const monthTotal =
    filter === 'income' ? totals.income : filter === 'expense' ? -totals.expense : totals.income - totals.expense

  return (
    <div className="mx-4 mt-2">
      {/* Навигация по месяцам */}
      <div className="mb-3 flex items-center justify-between px-2">
        <button
          onClick={() => { hapticSelect(); setMonth((m) => m.subtract(1, 'month')) }}
          className="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted active:bg-surface-sunken"
          aria-label={tr('cal.prev_month')}
        >
          <ChevronLeft size={20} />
        </button>
        <span className="text-sm font-bold capitalize text-ink">{month.format('MMMM YYYY')}</span>
        <button
          onClick={() => { hapticSelect(); setMonth((m) => m.add(1, 'month')) }}
          disabled={isCurrentMonth}
          className="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted active:bg-surface-sunken disabled:opacity-30"
          aria-label={tr('cal.next_month')}
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Фильтр */}
      <div className="mb-3 grid grid-cols-4 gap-1 rounded-full bg-surface-sunken p-1">
        {FILTERS.map((f) => {
          const active = filter === f.id
          return (
            <button
              key={f.id}
              onClick={() => { hapticSelect(); setFilter(f.id) }}
              className={`rounded-full py-1.5 text-[11px] font-semibold transition-colors ${
                active ? 'bg-surface-raised text-ink shadow-soft dark:shadow-soft-dark' : 'text-ink-muted'
              }`}
            >
              {tr(f.label)}
            </button>
          )
        })}
      </div>

      {/* Сетка календаря */}
      <div className="card p-3">
        <div className="mb-1 grid grid-cols-7 gap-1">
          {WEEKDAYS.map((w) => (
            <div key={w} className="text-center text-[10px] font-semibold text-ink-subtle">{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (day === null) return <div key={`e${i}`} />
            const agg = byDay.get(day)
            const isToday = isCurrentMonth && today.date() === day
            // Режим «Оба»: показываем и доход, и расход двумя строками (без вычета).
            if (filter === 'both') {
              const hasAny = !!agg && (agg.income > 0 || agg.expense > 0)
              return (
                <div
                  key={day}
                  className={`flex min-h-[44px] flex-col items-center justify-start rounded-xl py-1 ${
                    isToday ? 'bg-brand-500/15 ring-1 ring-brand-500/40' : hasAny ? 'bg-surface-sunken/50' : ''
                  }`}
                >
                  <span className={`text-[11px] font-semibold ${isToday ? 'text-brand-600 dark:text-brand-300' : 'text-ink-muted'}`}>
                    {day}
                  </span>
                  {hasAny && (
                    <span className="mt-0.5 flex flex-col items-center leading-tight">
                      {agg!.income > 0 && (
                        <span className="whitespace-nowrap text-[8px] font-bold text-income-deep">+{compact(agg!.income, lang)}</span>
                      )}
                      {agg!.expense > 0 && (
                        <span className="whitespace-nowrap text-[8px] font-bold text-expense-deep">−{compact(agg!.expense, lang)}</span>
                      )}
                    </span>
                  )}
                </div>
              )
            }
            const value = cellValue(agg)
            const positive = value !== null && value > 0
            const negative = value !== null && value < 0
            return (
              <div
                key={day}
                className={`flex min-h-[44px] flex-col items-center justify-start rounded-xl py-1 ${
                  isToday ? 'bg-brand-500/15 ring-1 ring-brand-500/40' : value !== null ? 'bg-surface-sunken/50' : ''
                }`}
              >
                <span className={`text-[11px] font-semibold ${isToday ? 'text-brand-600 dark:text-brand-300' : 'text-ink-muted'}`}>
                  {day}
                </span>
                {value !== null && (
                  <span
                    className={`mt-0.5 whitespace-nowrap text-[9px] font-bold leading-none ${
                      positive ? 'text-income-deep' : negative ? 'text-expense-deep' : 'text-ink-subtle'
                    }`}
                  >
                    {positive ? '+' : negative ? '−' : ''}{compact(value, lang)}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Итог месяца */}
      <div className="mt-3 flex items-center justify-between rounded-2xl bg-surface-sunken/60 px-4 py-3">
        <span className="text-xs font-semibold text-ink-muted">
          {filter === 'income'
            ? tr('cal.income_month')
            : filter === 'expense'
            ? tr('cal.expense_month')
            : filter === 'both'
            ? tr('cal.both_month')
            : tr('cal.net_month')}
        </span>
        {filter === 'both' ? (
          <span className="flex items-center gap-1.5 text-sm font-bold">
            <span className="tabular text-income-deep">+{formatMoney(totals.income, currency)}</span>
            <span className="text-ink-subtle">·</span>
            <span className="tabular text-expense-deep">−{formatMoney(totals.expense, currency)}</span>
          </span>
        ) : (
          <span
            className={`tabular text-sm font-bold ${
              monthTotal > 0 ? 'text-income-deep' : monthTotal < 0 ? 'text-expense-deep' : 'text-ink'
            }`}
          >
            {formatMoney(monthTotal, currency, { sign: true })}
          </span>
        )}
      </div>
    </div>
  )
}
