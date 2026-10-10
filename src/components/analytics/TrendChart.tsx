import { useMemo, useState } from 'react'
import { SegTrack } from '../ui/SegTrack'
import { Odometer } from '../ui/Odometer'
import { hapticSelect } from '../../lib/telegram'
import { useStore, selectTrend, selectAnalyticsCurrency, type TrendGranularity, type TrendBucket } from '../../store/transactions'
import { formatMoney } from '../../lib/format'
import { useT } from '../../lib/i18n'

type Series = 'both' | 'expense' | 'income'

const GRANS: { id: TrendGranularity; label: string }[] = [
  { id: 'day', label: 'charts.gran_day' },
  { id: 'week', label: 'charts.gran_week' },
  { id: 'month', label: 'charts.gran_month' },
  { id: 'year', label: 'charts.gran_year' },
]

const SERIES: { id: Series; label: string }[] = [
  { id: 'both', label: 'charts.series_both' },
  { id: 'expense', label: 'common.expense' },
  { id: 'income', label: 'common.income' },
]

/** «Динамика» — графики трендов (бывшая вкладка «Графики»), сегмент Аналитики. */
export function TrendChart() {
  const [gran, setGran] = useState<TrendGranularity>('month')
  const [series, setSeries] = useState<Series>('both')
  const buckets = useStore((s) => selectTrend(s, gran))
  const currency = useStore(selectAnalyticsCurrency)
  const t = useT()

  const stats = useMemo(() => {
    const income = buckets.reduce((a, b) => a + b.income, 0)
    const expense = buckets.reduce((a, b) => a + b.expense, 0)
    const active = buckets.filter((b) => b.income > 0 || b.expense > 0).length || 1
    return { income, expense, balance: income - expense, avgExpense: expense / active }
  }, [buckets])

  return (
    <div>
      {/* Гранулярность — сегмент с плашкой (раньше framer layoutId) */}
      <SegTrack active={gran} className="mx-4 mt-2 gap-1">
        {GRANS.map((g) => {
          const active = gran === g.id
          return (
            <button
              key={g.id}
              onClick={() => { hapticSelect(); setGran(g.id) }}
              aria-pressed={active}
              className={`seg-item py-1.5 text-xs ${active ? 'seg-on' : 'text-ink-subtle'}`}
            >
              {t(g.label)}
            </button>
          )
        })}
      </SegTrack>

      {/* Summary cards */}
      <div className="mx-4 mt-4 grid grid-cols-3 gap-2">
        <StatCard label={t('common.income')} value={formatMoney(stats.income, currency, { compact: true })} tone="income" />
        <StatCard label={t('common.expense')} value={formatMoney(stats.expense, currency, { compact: true })} tone="expense" />
        <StatCard
          label={t('common.balance')}
          value={formatMoney(stats.balance, currency, { compact: true, sign: stats.balance < 0 })}
          tone={stats.balance >= 0 ? 'income' : 'expense'}
        />
      </div>

      {/* Ряды — тоже сегмент с плашкой */}
      <SegTrack active={series} className="mx-4 mt-4 gap-1">
        {SERIES.map((s) => {
          const active = series === s.id
          return (
            <button
              key={s.id}
              onClick={() => { hapticSelect(); setSeries(s.id) }}
              aria-pressed={active}
              className={`seg-item py-1.5 text-xs ${active ? 'seg-on' : 'text-ink-subtle'}`}
            >
              {t(s.label)}
            </button>
          )
        })}
      </SegTrack>

      {/* Chart: смена гранулярности — заново растущие столбики (key) */}
      <div key={gran} className="mx-4 mt-4">
        <TrendBars buckets={buckets} series={series} />
      </div>

      <div className="mx-6 mt-4 text-center text-[11px] text-ink-subtle">
        {t('charts.avg_expense')}{' '}
        <span className="tabular font-semibold text-ink">
          <Odometer text={formatMoney(stats.avgExpense, currency)} />
        </span>
      </div>
    </div>
  )
}

function StatCard({ label, value, tone }: { label: string; value: string; tone: 'income' | 'expense' }) {
  return (
    <div className="card flex flex-col gap-0.5 p-3">
      <span className="caption-sm text-ink-subtle">{label}</span>
      <span className={`tabular text-sm font-bold ${tone === 'income' ? 'text-income-deep dark:text-income-light' : 'text-expense-deep dark:text-expense-soft'}`}>
        {value}
      </span>
    </div>
  )
}

function TrendBars({ buckets, series }: { buckets: TrendBucket[]; series: Series }) {
  const currency = useStore(selectAnalyticsCurrency)
  const [active, setActive] = useState<number | null>(null)
  const t = useT()

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
        <span className="text-sm text-ink-subtle">{t('charts.no_data')}</span>
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
                <div className="pop mb-1 whitespace-nowrap rounded-lg bg-ink px-2 py-1 text-[9px] font-semibold text-surface-raised">
                  {showExpense && <div className="tabular">−{formatMoney(b.expense, currency, { compact: true })}</div>}
                  {showIncome && <div className="tabular">+{formatMoney(b.income, currency, { compact: true })}</div>}
                </div>
              )}
              <div className="flex w-full items-end justify-center gap-[2px]" style={{ height: '100%' }}>
                {/* Высота — сразу настоящая (style), рост — CSS-каскадом.
                    framer с initial height 0 при остановленном rAF оставлял
                    график плоским. Смена высоты (ряды, данные) — transition. */}
                {showIncome && (
                  <div
                    className={`grow-y-d w-full max-w-[22px] min-h-[2px] rounded-t-md bg-gradient-to-t from-income to-income-deep transition-[height,opacity] duration-500 ${
                      isActive ? '' : 'opacity-90'
                    }`}
                    style={{ height: `${(b.income / max) * 100}%`, '--d': Math.min(i, 14) * 14 } as React.CSSProperties}
                  />
                )}
                {showExpense && (
                  <div
                    className={`grow-y-d w-full max-w-[22px] min-h-[2px] rounded-t-md bg-gradient-to-t from-expense to-expense-deep transition-[height,opacity] duration-500 ${
                      isActive ? '' : 'opacity-90'
                    }`}
                    style={{ height: `${(b.expense / max) * 100}%`, '--d': Math.min(i, 14) * 14 } as React.CSSProperties}
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
            <span className="h-2 w-2 rounded-full bg-income" /> {t('common.income')}
          </span>
        )}
        {showExpense && (
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-expense" /> {t('common.expense')}
          </span>
        )}
      </div>
    </div>
  )
}
