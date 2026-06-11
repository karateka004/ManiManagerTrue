import { useState } from 'react'
import { m } from 'framer-motion'
import { PeriodSwitcher } from '../components/PeriodSwitcher'
import { DonutChart } from '../components/DonutChart'
import { DonutChartWithIcons } from '../components/DonutChartWithIcons'
import { AnalyticsTabs, type AnalyticsTab } from '../components/AnalyticsTabs'
import { MonthCalendar } from '../components/MonthCalendar'
import { AccountSwitcher } from '../components/AccountSwitcher'
import {
  useStore,
  selectByCategoryAccount,
  selectDailyExpenseAccount,
  selectAnalyticsCurrency,
} from '../store/transactions'
import { formatMoney } from '../lib/format'
import { useT } from '../lib/i18n'
import { CategoryIcon } from '../components/icons/CategoryIcon'
import type { CategoryKind } from '../store/categories'

export function AnalyticsPage() {
  const [tab, setTab] = useState<AnalyticsTab>('expense')
  const isCalendar = tab === 'calendar'
  // selectByCategory принимает только income/expense — для календаря не используется.
  const kind: CategoryKind = isCalendar ? 'expense' : tab
  const categories = useStore((s) => selectByCategoryAccount(s, kind))
  const daily = useStore(selectDailyExpenseAccount)
  const chartStyle = useStore((s) => s.chartStyle)
  const t = useT()

  return (
    <div className="pb-32">
      <div className="px-6 pt-6 pb-2">
        <div className="text-xs font-semibold uppercase tracking-widest text-ink-subtle">{t('nav.analytics')}</div>
        <div className="mt-0.5 text-2xl font-bold tracking-tight text-ink">{t('analytics.subtitle')}</div>
      </div>

      <AccountSwitcher />
      {!isCalendar && <PeriodSwitcher />}
      <AnalyticsTabs value={tab} onChange={setTab} />

      {isCalendar ? (
        // CSS-fade (.tab-enter, базовая непрозрачность 1) вместо framer
        // `initial:opacity 0`: иначе при незапустившейся анимации (rAF в свёрнутом
        // webview) календарь оставался невидимым — «не видно сумм за месяц».
        <div key="calendar" className="tab-enter">
          <MonthCalendar />
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

          {/* Detailed list */}
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
              <div className="font-semibold text-ink">{c.name}</div>
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
      <div className="flex items-end justify-between gap-1 h-32">
        {data.slice(-14).map((d, i) => (
          <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
            <m.div
              initial={{ height: 0 }}
              animate={{ height: `${(d.amount / max) * 100}%` }}
              transition={{ duration: 0.5, delay: i * 0.02, ease: 'easeOut' }}
              className="w-full min-h-[3px] rounded-t-md bg-gradient-to-t from-brand-400 to-brand-300"
            />
            <span className="text-[9px] text-ink-subtle">{d.day.slice(0, 5)}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 text-center text-xs text-ink-muted">
        {t('analytics.max_per_day')} <span className="font-semibold text-ink">{formatMoney(max, currency)}</span>
      </div>
    </div>
  )
}
