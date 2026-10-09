import { useRef, useState } from 'react'
import { PeriodSwitcher } from '../components/PeriodSwitcher'
import { DonutChart } from '../components/DonutChart'
import { DonutChartWithIcons } from '../components/DonutChartWithIcons'
import { AnalyticsTabs, ANALYTICS_TABS, type AnalyticsTab } from '../components/AnalyticsTabs'
import { MonthCalendar } from '../components/MonthCalendar'
import { TrendChart } from '../components/analytics/TrendChart'
import { Overview } from '../components/analytics/Overview'
import { CategorySheet } from '../components/analytics/CategorySheet'
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
import type { Transaction } from '../store/transactions'

export function AnalyticsPage({ onEditTx }: { onEditTx: (t: Transaction) => void }) {
  const [tab, setTab] = useState<AnalyticsTab>('overview')
  const [pickedCategory, setPickedCategory] = useState<string | null>(null)
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

  // Направление смены сегмента: правее — содержимое въезжает справа.
  const dirRef = useRef(0)

  // Открытие «Динамики» = бывший заход на вкладку «Графики» (квест see_charts).
  const changeAnalyticsTab = (next: AnalyticsTab) => {
    if (next === tab) return
    if (next === 'dynamics') track('visit_charts')
    dirRef.current = ANALYTICS_TABS.indexOf(next) > ANALYTICS_TABS.indexOf(tab) ? 1 : -1
    setTab(next)
  }
  const enter = dirRef.current > 0 ? 'tab-in-r' : dirRef.current < 0 ? 'tab-in-l' : 'tab-enter'

  return (
    <div className="pb-32">
      <div className="px-6 pt-6 pb-2">
        <div className="kicker text-ink-subtle">{t('nav.analytics')}</div>
        <div className="mt-0.5 text-2xl font-bold tracking-tight text-ink">{t('analytics.subtitle')}</div>
      </div>

      <AccountSwitcher />
      {/* Период нужен сводкам по категориям и Обзору; у Динамики своя гранулярность, у Календаря — своя навигация. */}
      {(isCats || isOverview) && <PeriodSwitcher />}
      <AnalyticsTabs value={tab} onChange={changeAnalyticsTab} />

      {isOverview ? (
        <div key="overview" className={enter}>
          <Overview onPickCategory={setPickedCategory} />
        </div>
      ) : isCalendar ? (
        // CSS-fade (.tab-enter, базовая непрозрачность 1) вместо framer
        // `initial:opacity 0`: иначе при незапустившейся анимации (rAF в свёрнутом
        // webview) календарь оставался невидимым — «не видно сумм за месяц».
        <div key="calendar" className={enter}>
          <MonthCalendar />
        </div>
      ) : isDynamics ? (
        <div key="dynamics" className={enter}>
          <TrendChart />
        </div>
      ) : (
        <>
          <div key={tab + chartStyle} className={enter}>
            {chartStyle === 'icons' ? <DonutChartWithIcons kind={kind} /> : <DonutChart kind={kind} />}
          </div>

          {tab === 'expense' && daily.length > 0 && (
            <div className="mx-6 mt-6">
              <div className="mb-2 px-2 section-title">
                {t('analytics.by_days')}
              </div>
              <DailyBars data={daily} />
            </div>
          )}

          {/* Детальный список — только для стиля «compact»; у «icons» своя легенда-чипы в кольце */}
          {chartStyle === 'compact' && (
          <div className="stagger mx-4 mt-6 space-y-2">
            {categories.map((c, i) => (
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
                {/* Рост — CSS (scaleX из нуля), ширина — сразу настоящая. Раньше
                    здесь был framer с initial width 0: при остановленном rAF
                    полоса так и оставалась нулевой. */}
                <div
                  className="grow-x-d h-full rounded-full"
                  style={{ width: `${Math.min(c.pct, 100)}%`, background: c.color, '--d': Math.min(i, 6) * 30 } as React.CSSProperties}
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

      <CategorySheet categoryId={pickedCategory} onClose={() => setPickedCategory(null)} onEditTx={onEditTx} />
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
              {/* Столбик: высота — сразу настоящая, рост — CSS-каскадом.
                  Раньше framer начинал с height 0 и при остановленном rAF
                  график оставался плоским. Цвет — расходный: это траты. */}
              <div
                className="grow-y-d w-full min-h-[3px] rounded-t-md bg-expense/70"
                style={{ height: `${(d.amount / max) * 100}%`, '--d': i * 22 } as React.CSSProperties}
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
