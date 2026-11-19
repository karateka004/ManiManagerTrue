import { lazy, Suspense, useRef, useState } from 'react'
import { BarChart3, Plus } from 'lucide-react'
import { AccountSwitcher } from '../components/AccountSwitcher'
import { CategorySheet } from '../components/analytics/CategorySheet'
import { PeriodBar } from '../components/analytics/PeriodBar'
import { HeroWidget } from '../components/analytics/Hero'
import { KpiGrid } from '../components/analytics/Kpis'
import { InsightsWidget } from '../components/analytics/Insights'
import { CategoriesWidget } from '../components/analytics/Categories'
import { CalendarWidget } from '../components/analytics/Calendar'
import { TrendWidget } from '../components/analytics/Trend'
import { AskWidget, BiggestWidget, RecurringWidget, RhythmWidget } from '../components/analytics/Extras'
import { DaySheet } from '../components/analytics/DaySheet'
import { rgbTriplet, Widget } from '../components/analytics/Glass'
import { useAnT } from '../components/analytics/text'
import { useStore, type Transaction } from '../store/transactions'
import { selectOverview } from '../store/analytics'
import { isBackendConfigured } from '../lib/api'
import { hapticTap, tg } from '../lib/telegram'
import type { PlanTab } from '../components/home/BudgetBlock'
import '../components/analytics/analytics.css'

// Планирование — та же ленивая шторка, что на Главной и в Профиле (общий чанк).
const PlanningSheet = lazy(() => import('../components/PlanningSheet').then((m) => ({ default: m.PlanningSheet })))

interface Props {
  onEditTx: (t: Transaction) => void
  onAdd: () => void
  onAddIncome: () => void
  onAsk: (q?: string) => void
}

/**
 * Аналитика 2.11 — стеклянные виджеты одной лентой вместо пяти вкладок.
 * Каждый виджет отвечает на один вопрос: сколько (герой и показатели), что
 * заметно (подсказки с действиями), на что (категории), когда (календарь),
 * как меняется (динамика), из чего складывается (ритм, постоянные, крупные).
 * Детали — шторками: карточка категории, день календаря, план бюджета.
 * Период общий с Главной; его вид и стрелки — в шапке.
 */
export function AnalyticsPage({ onEditTx, onAdd, onAddIncome, onAsk }: Props) {
  const o = useStore(selectOverview)
  const hasAny = useStore((s) => (s.demoMode ? true : s.transactions.length > 0))
  const t = useAnT()
  const [picked, setPicked] = useState<string | null>(null)
  const [day, setDay] = useState<number | null>(null)
  const daySeen = useRef(false)
  if (day !== null) daySeen.current = true
  const [plan, setPlan] = useState<{ open: boolean; tab: PlanTab }>({ open: false, tab: 'budget' })
  const planSeen = useRef(false)
  if (plan.open) planSeen.current = true

  const empty = o.spent === 0 && o.income === 0
  // Вторая краска ауры — главная категория периода: страница окрашена данными.
  const accent = o.categories[0]?.color
  const canAsk = tg.isInTelegram && isBackendConfigured()

  return (
    <div className="an-page pb-32">
      <div className="an-aura" aria-hidden style={accent ? ({ '--an-accent': rgbTriplet(accent) } as React.CSSProperties) : undefined} />
      <PeriodBar />
      <div className="mt-2">
        <AccountSwitcher />
      </div>

      {empty ? (
        <Widget bodyClass="px-6 py-8 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-500/15 text-brand-600 dark:text-brand-300">
            <BarChart3 size={22} strokeWidth={2.4} />
          </span>
          {/* Записи есть, но не в этом периоде — «запиши первую трату» тут неправда. */}
          <div className="mt-3 text-[17px] font-extrabold text-ink">{t(hasAny ? 'empty.period_title' : 'empty.title')}</div>
          <p className="mx-auto mt-1.5 max-w-[270px] text-[13.5px] leading-snug text-ink-subtle">{t(hasAny ? 'empty.period_text' : 'empty.text')}</p>
          {!hasAny && (
            <button
              type="button"
              onClick={() => {
                hapticTap()
                onAdd()
              }}
              className="press-soft mx-auto mt-4 flex items-center gap-1.5 rounded-full bg-brand-500 px-5 py-2.5 text-[14px] font-bold text-white"
            >
              <Plus size={16} strokeWidth={2.8} />
              {t('empty.add')}
            </button>
          )}
        </Widget>
      ) : (
        <>
          <HeroWidget />
          <KpiGrid />
          <InsightsWidget onCategory={setPicked} onPlan={(tab) => setPlan({ open: true, tab })} onAddIncome={onAddIncome} />
          <CategoriesWidget onPick={setPicked} />
          <CalendarWidget onDay={setDay} />
        </>
      )}
      {hasAny && <TrendWidget />}
      {!empty && (
        <>
          <RhythmWidget />
          <RecurringWidget />
          <BiggestWidget onEditTx={onEditTx} />
          {canAsk && <AskWidget onAsk={onAsk} />}
        </>
      )}

      <CategorySheet categoryId={picked} onClose={() => setPicked(null)} onEditTx={onEditTx} />
      {daySeen.current && <DaySheet dayKey={day} onClose={() => setDay(null)} onEditTx={onEditTx} />}
      <Suspense fallback={null}>
        {planSeen.current && <PlanningSheet open={plan.open} initialTab={plan.tab} onClose={() => setPlan((p) => ({ ...p, open: false }))} />}
      </Suspense>
    </div>
  )
}
