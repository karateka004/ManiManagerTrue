import { lazy, memo, Suspense, useRef, useState } from 'react'
import { AnimatePresence, m } from 'framer-motion'
import { Search, Target } from 'lucide-react'
import { BalanceCard } from '../components/BalanceCard'
import { PeriodSwitcher } from '../components/PeriodSwitcher'
import { CategoryList } from '../components/CategoryList'
import { BudgetAlert } from '../components/BudgetAlert'
import { DueRecurring } from '../components/DueRecurring'
import { MonthlyRecap } from '../components/MonthlyRecap'
import { AccountSwitcher } from '../components/AccountSwitcher'
import { Avatar } from '../components/Avatar'
import { MenuRow } from '../components/ui/MenuRow'
import {
  useStore,
  selectNetBalanceByCurrency,
  selectCurrentMonthExpense,
  selectDailyAllowance,
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

interface Props {
  onOpenProfile: () => void
  /** Открыть шторку правки операции — сама шторка живёт в App. */
  onEditTx: (t: Transaction) => void
  /** Открыть поиск по всей истории — шторка тоже живёт в App. */
  onOpenSearch: () => void
}

/**
 * Главная. Обёрнута в memo намеренно: состояние шторки добавления живёт в App,
 * и без этого каждое её открытие или закрытие перерисовывало бы весь список
 * категорий. Пропсы приходят стабильными (useCallback в App).
 */
export const HomePage = memo(function HomePage({ onOpenProfile, onEditTx, onOpenSearch }: Props) {
  // Планирование прямо с Главной: получил зарплату → сразу распределил бюджет.
  const track = useStore((s) => s.track)
  const [planningOpen, setPlanningOpen] = useState(false)
  const seenPlanning = useRef(false)
  if (planningOpen) seenPlanning.current = true
  const openPlanning = () => {
    track('open_planning')
    setPlanningOpen(true)
  }

  return (
    <div className="pb-24">
      <Header onOpenProfile={onOpenProfile} onOpenSearch={onOpenSearch} />
      <AccountSwitcher />
      <PeriodSwitcher />
      <BalanceCard />
      <TodayBudget />
      <PlanningRow onOpen={openPlanning} />
      <BudgetAlert />
      <MonthlyRecap />
      <DueRecurring />
      <CategoryList onEditTx={onEditTx} />

      <Suspense fallback={null}>
        {seenPlanning.current && <PlanningSheet open={planningOpen} onClose={() => setPlanningOpen(false)} />}
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
  const currency = useStore((s) => s.currency)
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
 * Компактный вход в Планирование под карточкой баланса. Подсказка живая:
 * если задан месячный бюджет — показываем остаток (или превышение), иначе
 * зовём настроить бюджет/лимиты/цели.
 */
function PlanningRow({ onOpen }: { onOpen: () => void }) {
  const t = useT()
  const budget = useStore((s) => s.monthlyBudget)
  const spent = useStore(selectCurrentMonthExpense)
  const currency = useStore((s) => s.currency)

  const left = budget - spent
  const hint =
    budget > 0
      ? left >= 0
        ? t('home.plan_left', { left: formatMoney(left, currency), budget: formatMoney(budget, currency) })
        : t('home.plan_over', { over: formatMoney(-left, currency) })
      : t('plan.subtitle')

  return (
    <div className="px-6 pb-2">
      <MenuRow
        icon={<Target size={20} strokeWidth={2} />}
        title={t('plan.title')}
        hint={hint}
        accent="emerald"
        onClick={onOpen}
      />
    </div>
  )
}

function Header({ onOpenProfile, onOpenSearch }: { onOpenProfile: () => void; onOpenSearch: () => void }) {
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
