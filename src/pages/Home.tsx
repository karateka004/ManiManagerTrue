import { lazy, memo, Suspense, useRef, useState } from 'react'
import { MessageCircle, Search, Target } from 'lucide-react'
import { BalanceCard } from '../components/BalanceCard'
import { PeriodSwitcher } from '../components/PeriodSwitcher'
import { CategoryList } from '../components/CategoryList'
import { BudgetBlock, type PlanTab } from '../components/home/BudgetBlock'
import { DueRecurring } from '../components/DueRecurring'
import { MonthlyRecap } from '../components/MonthlyRecap'
import { AccountSwitcher } from '../components/AccountSwitcher'
import { Avatar } from '../components/Avatar'
import {
  useStore,
  selectNetBalanceByCurrency,
  type Goal,
  type Transaction,
} from '../store/transactions'
import { useT } from '../lib/i18n'
import { formatMoney, dayjs } from '../lib/format'
import { hapticSelect, tg } from '../lib/telegram'
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
      <BudgetBlock onOpen={openPlanning} />
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
    <div className="px-4 pb-2 pt-5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          {/* Надстрочник — приветствие по времени суток с именем, а не слово
              «Дата» над датой: подпись должна что-то добавлять. */}
          <div className="kicker truncate text-ink-subtle">
            {showGoals ? t('home.cap_goal') : greeting(t)}
          </div>
          {showGoals ? <GoalCarousel goals={goals} currency={currency} /> : <DateHeader />}
        </div>
        {/* Ассистент — обычная нейтральная кнопка рядом с поиском. Искорки и
            брендовая заливка — штамп «ИИ-фичи», а бренд-цвет в 2.0 положен только
            главному действию. Иконка чата честнее: это разговор про деньги. */}
        <button
          onClick={() => { hapticSelect(); onOpenAssistant() }}
          aria-label={t('ai.open')}
          className="press flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-raised text-ink-muted shadow-soft dark:shadow-soft-dark"
        >
          <MessageCircle size={18} strokeWidth={2.4} />
        </button>
        <button
          onClick={() => { hapticSelect(); onOpenSearch() }}
          aria-label={t('search.open')}
          className="press flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-raised text-ink-muted shadow-soft dark:shadow-soft-dark"
        >
          <Search size={18} strokeWidth={2.4} />
        </button>
        <Avatar size={40} onClick={onOpenProfile} />
      </div>
    </div>
  )
}

/** «Добрый вечер, Свят» — по часу на устройстве; без имени — просто приветствие. */
function greeting(t: (k: string) => string): string {
  const h = new Date().getHours()
  const key = h < 5 ? 'home.greet_night' : h < 12 ? 'home.greet_morning' : h < 17 ? 'home.greet_day' : h < 23 ? 'home.greet_evening' : 'home.greet_night'
  const name = tg.user?.first_name?.trim()
  return name ? `${t(key)}, ${name}` : t(key)
}

/** Подзаголовок-дата: «Среда, 21 мая» (с большой буквы). */
function DateHeader() {
  const raw = dayjs().format('dddd, D MMMM')
  const title = raw.charAt(0).toUpperCase() + raw.slice(1)
  return <div className="mt-0.5 truncate whitespace-nowrap text-base font-bold text-ink">{title}</div>
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
      {/* Смена цели — CSS-сдвиг в сторону свайпа. Раньше здесь был framer с
          initial: opacity 0 и mode="wait": при остановленном rAF цель могла
          остаться невидимой — а это данные (накоплено / сумма). */}
      <div key={goal.id} className={dir > 0 ? 'tab-in-r' : dir < 0 ? 'tab-in-l' : undefined}>
        <GoalBody goal={goal} currency={currency} netByCur={netByCur} />
      </div>

      {multiple && (
        <div className="mt-1.5 flex gap-1">
          {goals.map((g, i) => (
            <span
              key={g.id}
              className={`h-1 rounded-full transition-all duration-300 ${i === idx ? 'w-4 bg-brand-500' : 'w-1 bg-ink-subtle/30'}`}
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
      {/* goal.icon в данных — эмодзи (раньше всем целям ставился 🎯). Не рисуем
          его, а показываем иконку: так чистыми становятся и уже созданные цели. */}
      <div className="flex min-w-0 items-center gap-1.5 text-base font-bold text-ink">
        <Target size={16} strokeWidth={2.2} className="shrink-0 text-brand-600 dark:text-brand-300" aria-hidden />
        <span className="truncate">{goal.title}</span>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken">
          <div className="grow-x h-full rounded-full bg-brand-500 transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
        <span className="shrink-0 text-[11px] font-semibold tabular text-ink-muted">{Math.round(pct)}%</span>
      </div>
      <div className="mt-0.5 text-[11px] tabular text-ink-subtle">
        {formatMoney(saved, cur)} / {formatMoney(goal.target, cur)}
      </div>
    </div>
  )
}
