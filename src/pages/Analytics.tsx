import { useState } from 'react'
import { m } from 'framer-motion'
import { PeriodSwitcher } from '../components/PeriodSwitcher'
import { DonutChart } from '../components/DonutChart'
import { DonutChartWithIcons } from '../components/DonutChartWithIcons'
import { AnalyticsTabs, type AnalyticsTab } from '../components/AnalyticsTabs'
import { MonthCalendar } from '../components/MonthCalendar'
import { TrendChart } from '../components/analytics/TrendChart'
import { Overview } from '../components/analytics/Overview'
import { AccountSwitcher } from '../components/AccountSwitcher'
import {
  useStore,
  selectByCategoryAccount,
  selectDailyExpenseAccount,
  selectAnalyticsCurrency,
} from '../store/transactions'
import { formatMoney } from '../lib/format'
import { useCatName, useT } from '../lib/i18n'
import { CategoryIcon } from '../components/icons/CategoryIcon'
import type { CategoryKind } from '../store/categories'

export function AnalyticsPage() {
  const [tab, setTab] = useState<AnalyticsTab>('overview')
  const isOverview = tab === 'overview'
  const isCalendar = tab === 'calendar'
  const isDynamics = tab === 'dynamics'
  const isCats = tab === 'expense' || tab === 'income'
  // selectByCategory принимает только income/expense; для календаря/динамики не используется.
  const kind: CategoryKind = tab === 'income' ? 'income' : 'expense'
  const categories = useStore((s) => selectByCategoryAccount(s, kind))
  const daily = useStore(selectDailyExpenseAccount)
  const chartStyle = useStore((s) => s.chartStyle)
  const track = useStore((s) => s.track)
  const t = useT()
  const catName = useCatName()

  // Открытие «Динамики» = бывший заход на вкладку «Графики» (квест see_charts).
  const changeAnalyticsTab = (next: AnalyticsTab) => {
    if (next === 'dynamics') track('visit_charts')
    setTab(next)
  }

  return (
    <div className="pb-32">
      <div className="px-6 pt-6 pb-2">
        <div className="text-xs font-semibold uppercase tracking-widest text-ink-subtle">{t('nav.analytics')}</div>
        <div className="mt-0.5 text-2xl font-bold tracking-tight text-ink">{t('analytics.subtitle')}</div>
      </div>

      <AccountSwitcher />
      {/* Период нужен сводкам по категориям и Обзору; у Динамики своя гранулярность, у Календаря — своя навигация. */}
      {(isCats || isOverview) && <PeriodSwitcher />}
      <AnalyticsTabs value={tab} onChange={changeAnalyticsTab} />

      {isOverview ? (
        <div key="overview" className="tab-enter">
          <Overview />
        </div>
      ) : isCalendar ? (
        // CSS-fade (.tab-enter, базовая непрозрачность 1) вместо framer
        // `initial:opacity 0`: иначе при незапустившейся анимации (rAF в свёрнутом
        // webview) календарь оставался невидимым — «не видно сумм за месяц».
        <div key="calendar" className="tab-enter">
          <MonthCalendar />
        </div>
      ) : isDynamics ? (
        <div key="dynamics" className="tab-enter">
          <TrendChart />
        </div>
      ) : (
        <>
          <div key={tab + chartStyle} className="tab-enter">
            {chartStyle === 'icons' ? <DonutChartWithIcons kind={kind} /> : <DonutChart kind={kind} />}
          </div>

          {tab === 'expense' && daily.length > 0 && (
            <div className="mx-6 mt-6">
              <div className="mb-2 px-2 text-xs font-bold uppercase tracking-wider text-ink-subtle">
                {t('analytics.by_days')}
              </div>
              <DailyBars data={daily} />
            </div>
          )}

          {/* Детальный список — только для стиля «compact»; у «icons» своя легенда-чипы в кольце */}
          {chartStyle === 'compact' && (
          <div className="mx-4 mt-6 space-y-2">
            {categories.map((c) => (
          <div key={c.categoryId} className="card flex items-center gap-3 px-4 py-3">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-2xl"
              style={{ background: c.color + '22', color: c.color }}
            >
              <CategoryIcon id={c.icon} size={22} />
            </div>
            <div className="flex-1">
              <div className="font-semibold text-ink">{catName(c.categoryId, c.name)}</div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
                <m.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(c.pct, 100)}%` }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                  className="h-full rounded-full"
                  style={{ background: c.color }}
                />
              </div>
            </div>
            <div className="text-right">
              <div className="tabular font-bold text-ink">{formatMoney(c.amount, c.currency)}</div>
              <div className="text-xs text-ink-subtle">{c.pct.toFixed(0)}%</div>
            </div>
          </div>
            ))}
          </div>
          )}
        </>
      )}
    </div>
  )
}

function DailyBars({ data }: { data: { day: string; amount: number }[] }) {
  const max = Math.max(...data.map((d) => d.amount), 1)
  const currency = useStore(selectAnalyticsCurrency)
  const t = useT()

  return (
    <div className="card p-4">
      {/* items-stretch, а не items-end: высота столбика задана процентом, а процент
          считается от РОДИТЕЛЯ С ВЫСОТОЙ. При items-end колонка сжималась по
          содержимому, проценты разрешались в auto — и все столбики оставались
          ровно min-h-[3px], то есть график был плоским. */}
      <div className="flex h-32 items-stretch justify-between gap-1">
        {data.slice(-14).map((d, i) => (
          // min-w-0 — чтобы 14 колонок ужимались под ширину карточки и не распирали строку на 320px
          <div key={d.day} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <div className="flex w-full flex-1 items-end">
              <m.div
                initial={{ height: 0 }}
                animate={{ height: `${(d.amount / max) * 100}%` }}
                transition={{ duration: 0.5, delay: i * 0.02, ease: 'easeOut' }}
                className="w-full min-h-[3px] rounded-t-md bg-gradient-to-t from-brand-400 to-brand-300"
              />
            </div>
            {/* только число дня (DD) — «DD.MM» не влезает в узкую колонку на 320px */}
            <span className="w-full truncate text-center text-[9px] text-ink-subtle">{d.day.slice(0, 2)}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 text-center text-xs text-ink-muted">
        {t('analytics.max_per_day')} <span className="font-semibold text-ink">{formatMoney(max, currency)}</span>
      </div>
    </div>
  )
}
