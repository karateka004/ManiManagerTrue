import { lazy, memo, Suspense, useRef, useState } from 'react'
import { AnimatePresence, m } from 'framer-motion'
import { Search, Sparkles, Target, ChevronRight, SlidersHorizontal, Wallet, TrendingUp } from 'lucide-react'
import { BalanceCard } from '../components/BalanceCard'
import { PeriodSwitcher } from '../components/PeriodSwitcher'
import { CategoryList } from '../components/CategoryList'
import { BudgetAlert } from '../components/BudgetAlert'
import { DueRecurring } from '../components/DueRecurring'
import { MonthlyRecap } from '../components/MonthlyRecap'
import { AccountSwitcher } from '../components/AccountSwitcher'
import { Avatar } from '../components/Avatar'
import {
  useStore,
  selectNetBalanceByCurrency,
  selectCurrentMonthExpense,
  selectDailyAllowance,
  selectAnalyticsCurrency,
  type Goal,
  type Transaction,
} from '../store/transactions'
import { useT } from '../lib/i18n'
import { formatMoney, dayjs } from '../lib/format'
import { hapticSelect } from '../lib/telegram'
import type { Currency } from '../lib/currencies'

// Планирование — та же ленивая шторка, что в Профиле (общий чанк).
const PlanningSheet = lazy(() =>
  import('../components/PlanningSheet').then((m) => ({ default: m.PlanningSheet })),
)
type PlanTab = 'limits' | 'budget' | 'goals' | 'invest'

interface Props {
  onOpenProfile: () => void
  /** Открыть шторку правки операции — сама шторка живёт в App. */
  onEditTx: (t: Transaction) => void
  /** Открыть поиск по всей истории — шторка тоже живёт в App. */
  onOpenSearch: () => void
  /** Открыть ассистента: вопросы про свои деньги. */
  onOpenAssistant: () => void
}

/**
 * Главная. Обёрнута в memo намеренно: состояние шторки добавления живёт в App,
 * и без этого каждое её открытие или закрытие перерисовывало бы весь список
 * категорий. Пропсы приходят стабильными (useCallback в App).
 */
export const HomePage = memo(function HomePage({ onOpenProfile, onEditTx, onOpenSearch, onOpenAssistant }: Props) {
  // Планирование прямо с Главной: получил зарплату → сразу распределил бюджет.
  const track = useStore((s) => s.track)
  const [planningOpen, setPlanningOpen] = useState(false)
  const [planningTab, setPlanningTab] = useState<PlanTab>('limits')
  const seenPlanning = useRef(false)
  if (planningOpen) seenPlanning.current = true
  const openPlanning = (tab: PlanTab = 'limits') => {
    track('open_planning')
    setPlanningTab(tab)
    setPlanningOpen(true)
  }

  return (
    <div className="pb-24">
      <Header onOpenProfile={onOpenProfile} onOpenSearch={onOpenSearch} onOpenAssistant={onOpenAssistant} />
      <AccountSwitcher />
      <PeriodSwitcher />
      <BalanceCard />
      <TodayBudget />
      <PlanningCard onOpen={openPlanning} />
      <BudgetAlert />
      <MonthlyRecap />
      <DueRecurring />
      <CategoryList onEditTx={onEditTx} />

      <Suspense fallback={null}>
        {seenPlanning.current && (
          <PlanningSheet open={planningOpen} initialTab={planningTab} onClose={() => setPlanningOpen(false)} />
        )}
      </Suspense>
    </div>
  )
})

/**
 * Сколько ещё можно потратить сегодня.
 *
 * Месячный бюджет сам по себе абстрактен: «осталось 40 000 до конца месяца»
 * ничего не говорит о сегодняшнем дне. Дневной лимит пересчитывается каждый день
 * от ОСТАТКА (см. selectDailyAllowance), поэтому перерасход сразу ужимает
 * завтрашний лимит, а экономия — расширяет.
 *
 * Показывается только когда бюджет задан — иначе на Главной висел бы пустой блок.
 */
function TodayBudget() {
  const allowance = useStore(selectDailyAllowance)
  const currency = useStore(selectAnalyticsCurrency)
  const t = useT()
  if (!allowance) return null

  const { perDay, leftToday, spentToday, daysLeft } = allowance
  const over = leftToday < 0
  // Копейки в дневном лимите только шумят — округляем до целых единиц валюты.
  const money = (v: number) => formatMoney(Math.round(v), currency)
  const ratio = perDay > 0 ? Math.min(1, spentToday / perDay) : 1

  return (
    <div className="px-6 pb-2">
      <div className="card px-4 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-ink-subtle">
            {t('home.today_kicker')}
          </span>
          <span className="text-[11px] font-medium text-ink-subtle">
            {t('home.today_days', { days: daysLeft })}
          </span>
        </div>

        <div className={`mt-0.5 tabular text-lg font-bold ${over ? 'text-expense-deep' : 'text-ink'}`}>
          {over ? t('home.today_over', { over: money(-leftToday) }) : t('home.today_left', { left: money(leftToday) })}
        </div>

        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
          <div
            className={`h-full rounded-full transition-[width] duration-500 ${over ? 'bg-expense' : 'bg-brand-500'}`}
            style={{ width: `${ratio * 100}%` }}
          />
        </div>

        <div className="mt-1 tabular text-[11px] text-ink-subtle">
          {t('home.today_spent', { spent: money(spentToday), perDay: money(perDay) })}
        </div>
      </div>
    </div>
  )
}

/**
 * Планирование на Главной. Раньше это была одна строка-ссылка, и раздел терялся:
 * увидеть, что там вообще есть, можно было только открыв шторку. Теперь это карта
 * с четырьмя входами и живыми числами — каждый ведёт сразу на свою вкладку.
 *
 * Суммы показываем ТОЛЬКО в валюте выбранного счёта: курсов в приложении нет,
 * складывать евро с гривнами нечем (то же правило, что в аналитике).
 */
function PlanningCard({ onOpen }: { onOpen: (tab: PlanTab) => void }) {
  const t = useT()
  const budget = useStore((s) => s.monthlyBudget)
  const spent = useStore(selectCurrentMonthExpense)
  const budgets = useStore((s) => s.budgets)
  const goals = useStore((s) => s.goals)
  const investments = useStore((s) => s.investments)
  const currency = useStore(selectAnalyticsCurrency)

  const left = budget - spent
  const limitsSet = Object.values(budgets).filter((v) => v > 0).length
  const invested = investments.reduce((sum, i) => (i.currency === currency ? sum + i.amount : sum), 0)

  const hint =
    budget > 0
      ? left >= 0
        ? t('home.plan_left', { left: formatMoney(left, currency), budget: formatMoney(budget, currency) })
        : t('home.plan_over', { over: formatMoney(-left, currency) })
      : t('plan.subtitle')

  const money = (v: number) => formatMoney(Math.round(v), currency)

  return (
    <div className="px-6 pb-2">
      <div className="card p-3">
        <button
          onClick={() => { hapticSelect(); onOpen('limits') }}
          className="flex w-full items-center gap-3 text-left"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-brand-100 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
            <Target size={19} strokeWidth={2.2} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-ink">{t('plan.title')}</span>
            <span className="block truncate text-[11px] text-ink-subtle">{hint}</span>
          </span>
          <ChevronRight size={18} className="shrink-0 text-ink-subtle" />
        </button>

        <div className="mt-2.5 grid grid-cols-2 gap-2">
          <PlanChip
            icon={<SlidersHorizontal size={14} strokeWidth={2.4} />}
            label={t('plan.tab_limits')}
            value={limitsSet > 0 ? t('home.plan_limits_n', { n: limitsSet }) : t('home.plan_setup')}
            onClick={() => onOpen('limits')}
          />
          <PlanChip
            icon={<Wallet size={14} strokeWidth={2.4} />}
            label={t('plan.tab_budget')}
            value={budget > 0 ? money(budget) : t('home.plan_setup')}
            onClick={() => onOpen('budget')}
          />
          <PlanChip
            icon={<Target size={14} strokeWidth={2.4} />}
            label={t('plan.tab_goals')}
            value={goals.length > 0 ? t('home.plan_goals_n', { n: goals.length }) : t('home.plan_setup')}
            onClick={() => onOpen('goals')}
          />
          <PlanChip
            icon={<TrendingUp size={14} strokeWidth={2.4} />}
            label={t('plan.tab_invest')}
            value={invested > 0 ? money(invested) : t('home.plan_setup')}
            onClick={() => onOpen('invest')}
          />
        </div>
      </div>
    </div>
  )
}

function PlanChip({
  icon,
  label,
  value,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  value: string
  onClick: () => void
}) {
  return (
    <button
      onClick={() => { hapticSelect(); onClick() }}
      className="flex min-w-0 items-center gap-2 rounded-2xl bg-surface-sunken/70 px-2.5 py-2 text-left active:scale-[0.98]"
    >
      <span className="shrink-0 text-ink-subtle">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">{label}</span>
        <span className="block truncate tabular text-[12px] font-bold text-ink">{value}</span>
      </span>
    </button>
  )
}

function Header({
  onOpenProfile,
  onOpenSearch,
  onOpenAssistant,
}: {
  onOpenProfile: () => void
  onOpenSearch: () => void
  onOpenAssistant: () => void
}) {
  const mode = useStore((s) => s.homeHeaderMode)
  const goals = useStore((s) => s.goals)
  const currency = useStore((s) => s.currency)
  const t = useT()

  // В режиме «цель» показываем цели (можно свайпать), если они есть; иначе дата.
  const showGoals = mode === 'goal' && goals.length > 0

  return (
    <div className="px-6 pt-6 pb-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-widest text-ink-subtle">
            {showGoals ? t('home.cap_goal') : t('home.cap_date')}
          </div>
          {showGoals ? <GoalCarousel goals={goals} currency={currency} /> : <DateHeader />}
        </div>
        {/* Ассистент стоит первым и в брендовом тоне: это вход в новое, а поиск
            рядом — привычный инструмент, за которым и так приходят осознанно. */}
        <button
          onClick={() => { hapticSelect(); onOpenAssistant() }}
          aria-label={t('ai.open')}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white shadow-soft transition-transform active:scale-95 dark:shadow-soft-dark"
        >
          <Sparkles size={18} strokeWidth={2.4} />
        </button>
        <button
          onClick={() => { hapticSelect(); onOpenSearch() }}
          aria-label={t('search.open')}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-raised text-ink-muted shadow-soft transition-transform active:scale-95 dark:shadow-soft-dark"
        >
          <Search size={18} strokeWidth={2.4} />
        </button>
        <Avatar size={40} onClick={onOpenProfile} />
      </div>
    </div>
  )
}

/** Подзаголовок-дата: «Среда, 21 мая» (с большой буквы). */
function DateHeader() {
  const raw = dayjs().format('dddd, D MMMM')
  const title = raw.charAt(0).toUpperCase() + raw.slice(1)
  return <div className="mt-0.5 text-base font-bold text-ink">{title}</div>
}

/**
 * Карусель целей в шапке: показывает выбранную цель, между несколькими целями
 * можно листать свайпом влево/вправо (плюс точки-индикатор). Выбор сохраняется
 * в `homeHeaderGoalId`, чтобы при следующем заходе показалась та же цель.
 */
function GoalCarousel({ goals, currency }: { goals: Goal[]; currency: Currency }) {
  const goalId = useStore((s) => s.homeHeaderGoalId)
  const setGoalId = useStore((s) => s.setHomeHeaderGoalId)
  const netByCur = useStore(selectNetBalanceByCurrency)

  const selected = Math.max(0, goals.findIndex((g) => g.id === goalId))
  const [index, setIndex] = useState(selected)
  const [dir, setDir] = useState(0)
  const startX = useRef(0)

  const idx = Math.min(index, goals.length - 1)
  const goal = goals[idx]
  const multiple = goals.length > 1

  const go = (next: number) => {
    if (!multiple) return
    const clamped = (next + goals.length) % goals.length
    if (clamped === idx) return
    setDir(next > idx ? 1 : -1)
    setIndex(clamped)
    setGoalId(goals[clamped].id)
    hapticSelect()
  }

  return (
    <div
      className="mt-0.5"
      onTouchStart={(e) => { startX.current = e.touches[0].clientX }}
      onTouchEnd={(e) => {
        const dx = e.changedTouches[0].clientX - startX.current
        if (Math.abs(dx) > 40) go(dx < 0 ? idx + 1 : idx - 1)
      }}
    >
      <AnimatePresence mode="wait" initial={false} custom={dir}>
        <m.div
          key={goal.id}
          custom={dir}
          initial={{ opacity: 0, x: dir * 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: dir * -16 }}
          transition={{ duration: 0.18 }}
        >
          <GoalBody goal={goal} currency={currency} netByCur={netByCur} />
        </m.div>
      </AnimatePresence>

      {multiple && (
        <div className="mt-1.5 flex gap-1">
          {goals.map((g, i) => (
            <span
              key={g.id}
              className={`h-1 rounded-full transition-all ${i === idx ? 'w-4 bg-brand-500' : 'w-1 bg-ink-subtle/30'}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/** Тело цели: название + прогресс-бар «накоплено из суммы». */
function GoalBody({ goal, currency, netByCur }: { goal: Goal; currency: Currency; netByCur: Record<string, number> }) {
  const cur = goal.currency ?? currency
  // Для синхронизированной цели «накоплено» = баланс по валюте цели (не уходит в минус).
  const saved = goal.syncBalance ? Math.max(0, netByCur[cur] ?? 0) : goal.saved
  const pct = goal.target > 0 ? Math.min(100, (saved / goal.target) * 100) : 0
  return (
    <div>
      <div className="truncate text-base font-bold text-ink">
        {goal.icon} {goal.title}
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken">
          <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
        <span className="shrink-0 text-[11px] font-semibold tabular text-ink-muted">{Math.round(pct)}%</span>
      </div>
      <div className="mt-0.5 text-[11px] tabular text-ink-subtle">
        {formatMoney(saved, cur)} / {formatMoney(goal.target, cur)}
      </div>
    </div>
  )
}
