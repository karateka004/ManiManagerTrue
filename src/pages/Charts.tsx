import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useStore, selectTrend, type TrendGranularity, type TrendBucket } from '../store/transactions'
import { formatMoney } from '../lib/format'

type Series = 'both' | 'expense' | 'income'

const GRANS: { id: TrendGranularity; label: string }[] = [
  { id: 'day', label: 'Дни' },
  { id: 'week', label: 'Недели' },
  { id: 'month', label: 'Месяцы' },
  { id: 'year', label: 'Годы' },
]

const SERIES: { id: Series; label: string }[] = [
  { id: 'both', label: 'Вместе' },
  { id: 'expense', label: 'Расходы' },
  { id: 'income', label: 'Доходы' },
]

export function ChartsPage() {
  const [gran, setGran] = useState<TrendGranularity>('month')
  const [series, setSeries] = useState<Series>('both')
  const buckets = useStore((s) => selectTrend(s, gran))
  const currency = useStore((s) => s.currency)

  const stats = useMemo(() => {
    const income = buckets.reduce((a, b) => a + b.income, 0)
    const expense = buckets.reduce((a, b) => a + b.expense, 0)
    const active = buckets.filter((b) => b.income > 0 || b.expense > 0).length || 1
    return { income, expense, balance: income - expense, avgExpense: expense / active }
  }, [buckets])

  return (
    <div className="pb-28">
      <div className="px-6 pt-6 pb-2">
        <div className="text-xs font-semibold uppercase tracking-widest text-ink-subtle">Графики</div>
        <div className="mt-0.5 text-2xl font-bold tracking-tight text-ink">Динамика</div>
      </div>

      {/* Granularity */}
      <div className="mx-4 mt-2 flex gap-1 rounded-full bg-surface-sunken p-1">
        {GRANS.map((g) => {
          const active = gran === g.id
          return (
            <button
              key={g.id}
              onClick={() => setGran(g.id)}
              className={`relative flex-1 rounded-full py-1.5 text-xs font-semibold transition-colors ${
                active ? 'text-ink' : 'text-ink-subtle'
              }`}
            >
              {active && (
                <motion.span
                  layoutId="charts-gran-pill"
                  className="absolute inset-0 rounded-full bg-surface-raised shadow-soft dark:shadow-soft-dark"
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                />
              )}
              <span className="relative z-10">{g.label}</span>
            </button>
          )
        })}
      </div>

      {/* Summary cards */}
      <div className="mx-4 mt-4 grid grid-cols-3 gap-2">
        <StatCard label="Доходы" value={formatMoney(stats.income, currency, { compact: true })} tone="income" />
        <StatCard label="Расходы" value={formatMoney(stats.expense, currency, { compact: true })} tone="expense" />
        <StatCard
          label="Баланс"
          value={formatMoney(stats.balance, currency, { compact: true })}
          tone={stats.balance >= 0 ? 'income' : 'expense'}
        />
      </div>

      {/* Series toggle */}
      <div className="mx-4 mt-4 flex gap-1 rounded-full bg-surface-sunken p-1">
        {SERIES.map((s) => {
          const active = series === s.id
          return (
            <button
              key={s.id}
              onClick={() => setSeries(s.id)}
              className={`relative flex-1 rounded-full py-1.5 text-xs font-semibold transition-colors ${
                active ? 'text-ink' : 'text-ink-subtle'
              }`}
            >
              {active && (
                <motion.span
                  layoutId="charts-series-pill"
                  className="absolute inset-0 rounded-full bg-surface-raised shadow-soft dark:shadow-soft-dark"
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                />
              )}
              <span className="relative z-10">{s.label}</span>
            </button>
          )
        })}
      </div>

      {/* Chart */}
      <div className="mx-4 mt-4">
        <TrendBars buckets={buckets} series={series} />
      </div>

      <div className="mx-6 mt-4 text-center text-[11px] text-ink-subtle">
        Средний расход за период:{' '}
        <span className="tabular font-semibold text-ink">{formatMoney(stats.avgExpense, currency)}</span>
      </div>
    </div>
  )
}

function StatCard({ label, value, tone }: { label: string; value: string; tone: 'income' | 'expense' }) {
  return (
    <div className="card flex flex-col gap-0.5 p-3">
      <span className="text-[10px] font-bold uppercase tracking-wider text-ink-subtle">{label}</span>
      <span className={`tabular text-sm font-bold ${tone === 'income' ? 'text-income-deep' : 'text-expense-deep'}`}>
        {value}
      </span>
    </div>
  )
}

function TrendBars({ buckets, series }: { buckets: TrendBucket[]; series: Series }) {
  const currency = useStore((s) => s.currency)
  const [active, setActive] = useState<number | null>(null)

  const max = Math.max(
    1,
    ...buckets.map((b) =>
      series === 'income' ? b.income : series === 'expense' ? b.expense : Math.max(b.income, b.expense),
    ),
  )

  const showIncome = series === 'both' || series === 'income'
  const showExpense = series === 'both' || series === 'expense'

  const empty = buckets.every((b) => b.income === 0 && b.expense === 0)

  if (empty) {
    return (
      <div className="card flex h-48 items-center justify-center">
        <span className="text-sm text-ink-subtle">Нет данных за период</span>
      </div>
    )
  }

  return (
    <div className="card p-4">
      <div className="flex h-44 items-end justify-between gap-1">
        {buckets.map((b, i) => {
          const isActive = active === i
          return (
            <button
              key={b.label + i}
              onClick={() => setActive((v) => (v === i ? null : i))}
              className="group flex h-full flex-1 flex-col items-center justify-end gap-1"
            >
              {isActive && (
                <div className="mb-1 whitespace-nowrap rounded-lg bg-ink px-2 py-1 text-[9px] font-semibold text-surface-raised">
                  {showExpense && <div className="tabular">−{formatMoney(b.expense, currency, { compact: true })}</div>}
                  {showIncome && <div className="tabular">+{formatMoney(b.income, currency, { compact: true })}</div>}
                </div>
              )}
              <div className="flex w-full items-end justify-center gap-[2px]" style={{ height: '100%' }}>
                {showIncome && (
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${(b.income / max) * 100}%` }}
                    transition={{ duration: 0.5, delay: i * 0.015, ease: 'easeOut' }}
                    className={`w-full max-w-[14px] min-h-[2px] rounded-t-md bg-gradient-to-t from-income to-income-deep ${
                      isActive ? '' : 'opacity-90'
                    }`}
                  />
                )}
                {showExpense && (
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${(b.expense / max) * 100}%` }}
                    transition={{ duration: 0.5, delay: i * 0.015, ease: 'easeOut' }}
                    className={`w-full max-w-[14px] min-h-[2px] rounded-t-md bg-gradient-to-t from-expense to-expense-deep ${
                      isActive ? '' : 'opacity-90'
                    }`}
                  />
                )}
              </div>
              <span className={`text-[8px] ${isActive ? 'font-bold text-ink' : 'text-ink-subtle'}`}>
                {b.label}
              </span>
            </button>
          )
        })}
      </div>

      {/* Legend */}
      <div className="mt-3 flex items-center justify-center gap-4 text-[10px] text-ink-muted">
        {showIncome && (
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-income" /> Доходы
          </span>
        )}
        {showExpense && (
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-expense" /> Расходы
          </span>
        )}
      </div>
    </div>
  )
}
