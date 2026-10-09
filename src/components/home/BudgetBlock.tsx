import { useEffect, useRef } from 'react'
import { ChevronRight } from 'lucide-react'
import {
  useStore,
  selectAnalyticsCurrency,
  selectCurrentMonthExpense,
  selectDailyAllowance,
  selectExceededBudgets,
} from '../../store/transactions'
import { AnimatedMoney } from '../ui/Odometer'
import { formatMoney } from '../../lib/format'
import { useCatName, useT } from '../../lib/i18n'
import { hapticNotify, hapticSelect } from '../../lib/telegram'

export type PlanTab = 'limits' | 'budget' | 'goals' | 'invest'

/**
 * Бюджет на Главной — один блок вместо трёх.
 *
 * Раньше подряд стояли «На сегодня», карта планирования 2×2 (у нового человека
 * — четыре «Задать» подряд) и плашка «Бюджет превышен». Три карточки об одном
 * и том же, и ни одна не отвечала на главный вопрос сразу. Теперь сверху
 * крупно — сколько можно потратить сегодня, под ним полоса месяца, ниже
 * категории, вышедшие за лимит, и тихие ссылки в планирование.
 *
 * Без бюджета блок — одна строка «Задать бюджет месяца»: пустые плитки с
 * «Задать» говорили только о том, чего у человека нет.
 *
 * Суммы — только в валюте выбранного счёта: курсов в приложении нет, складывать
 * евро с гривнами нечем.
 */
export function BudgetBlock({ onOpen }: { onOpen: (tab: PlanTab) => void }) {
  const t = useT()
  const allowance = useStore(selectDailyAllowance)
  const exceeded = useStore(selectExceededBudgets)
  const currency = useStore(selectAnalyticsCurrency)
  const budget = useStore((s) => s.monthlyBudget)
  const spentMonth = useStore(selectCurrentMonthExpense)

  useBudgetWarning(exceeded.length)

  const open = (tab: PlanTab) => {
    hapticSelect()
    onOpen(tab)
  }

  if (!allowance) {
    return (
      <div className="px-4 pb-3">
        <div className="card grouped overflow-hidden">
          <button type="button" onClick={() => open('budget')} className="row">
            <span className="row-main">
              <span className="min-w-0 flex-1 text-[15px] font-semibold text-ink">{t('home.budget_set')}</span>
              <ChevronRight size={18} strokeWidth={2.2} className="-mr-1 shrink-0 text-ink-subtle" />
            </span>
          </button>
          <OverLimits />
          <PlanLinks onOpen={open} hideIfEmpty />
        </div>
      </div>
    )
  }

  const { perDay, leftToday, spentToday, daysLeft, monthLeft } = allowance
  const money = (v: number) => formatMoney(Math.round(v), currency)
  // Бюджет месяца кончился ещё до сегодняшнего дня: дневной лимит нулевой, и
  // «можно ещё 0 из 0» читалось бы как поломка. Говорим, что случилось.
  const exhausted = Math.round(perDay) <= 0
  const overToday = !exhausted && leftToday < 0
  const monthRatio = budget > 0 ? Math.min(1, spentMonth / budget) : 0
  const monthOver = budget > 0 && spentMonth > budget

  return (
    <div className="px-4 pb-3">
      <div className="card overflow-hidden">
        <div className="px-4 pb-4 pt-3.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="caption text-ink-subtle">
              {exhausted ? t('home.today_kicker') : overToday ? t('home.today_over_label') : t('home.today_left_label')}
            </span>
            <span className="caption-sm text-ink-subtle">{t('home.today_days', { days: daysLeft })}</span>
          </div>

          {exhausted ? (
            <div className="mt-1 text-[22px] font-bold leading-tight text-expense-deep dark:text-expense-soft">
              {t('home.today_exhausted')}
            </div>
          ) : (
            <AnimatedMoney
              value={Math.round(overToday ? -leftToday : leftToday)}
              currency={currency}
              className={`mt-0.5 block text-[34px] font-bold leading-none tracking-tight transition-colors duration-300 ${
                overToday ? 'text-expense-deep dark:text-expense-soft' : 'text-ink'
              }`}
            />
          )}

          <div className="caption mt-1.5 tabular-nums text-ink-subtle">
            {!exhausted
              ? t('home.today_spent', { spent: money(spentToday), perDay: money(perDay) })
              : monthLeft < 0
                ? t('home.today_month_over', { over: money(-monthLeft) })
                : t('home.today_spent_only', { spent: money(spentToday) })}
          </div>

          {/* Полоса месяца: дневной лимит без неё — число без контекста. */}
          <div className="mt-3.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
            <div
              className={`grow-x h-full rounded-full transition-[width,background-color] duration-500 ${monthOver ? 'bg-expense' : 'bg-income'}`}
              style={{ width: `${monthRatio * 100}%` }}
            />
          </div>
          <div className="caption-sm mt-1.5 tabular-nums text-ink-subtle">
            {t('home.month_line', { spent: money(spentMonth), budget: money(budget) })}
          </div>
        </div>

        <div className="grouped border-t border-hairline">
          <OverLimits />
          <PlanLinks onOpen={open} />
        </div>
      </div>
    </div>
  )
}

/** Категории, вышедшие за лимит (или подошедшие к нему), — строкой, а не тревожной плашкой. */
function OverLimits() {
  const exceeded = useStore(selectExceededBudgets)
  const currency = useStore(selectAnalyticsCurrency)
  const t = useT()
  const catName = useCatName()
  if (exceeded.length === 0) return null

  const over = exceeded.some((b) => b.level === 'over')
  const list = [...exceeded].sort((a, b) => b.ratio - a.ratio)

  return (
    <div className="row">
      <div className="row-main flex-col items-stretch gap-0.5">
        <span className={`caption ${over ? 'text-expense-deep dark:text-expense-soft' : 'text-ink-muted'}`}>
          {over ? t('budget.exceeded') : t('budget.near')}
        </span>
        <span className="text-[13px] leading-relaxed text-ink">
          {list.slice(0, 3).map((b, i) => (
            <span key={b.categoryId}>
              {i > 0 && <span className="text-ink-subtle"> · </span>}
              <span className="font-semibold">{catName(b.categoryId, b.name)}</span>{' '}
              <span className="tabular-nums text-ink-muted">
                {formatMoney(b.spent, currency)} / {formatMoney(b.limit, currency)}
              </span>
            </span>
          ))}
          {list.length > 3 && <span className="text-ink-subtle"> · {t('budget.and_more', { n: list.length - 3 })}</span>}
        </span>
      </div>
    </div>
  )
}

/**
 * Тихие ссылки в планирование: «Лимиты 2 · Цели 1 · Активы». Каждая ведёт
 * сразу на свою вкладку шторки. Без чисел у пустых разделов — пустое «Задать»
 * под каждым словом и было тем шумом, от которого ушли.
 */
function PlanLinks({ onOpen, hideIfEmpty }: { onOpen: (tab: PlanTab) => void; hideIfEmpty?: boolean }) {
  const t = useT()
  const limits = useStore((s) => Object.values(s.budgets).filter((v) => v > 0).length)
  const goals = useStore((s) => s.goals.length)
  const currency = useStore(selectAnalyticsCurrency)
  const invested = useStore((s) =>
    s.investments.reduce((sum, i) => (i.currency === currency ? sum + i.amount : sum), 0),
  )
  if (hideIfEmpty && limits === 0 && goals === 0 && invested === 0) return null

  const links: { tab: PlanTab; label: string; value?: string }[] = [
    { tab: 'limits', label: t('plan.tab_limits'), value: limits > 0 ? String(limits) : undefined },
    { tab: 'goals', label: t('plan.tab_goals'), value: goals > 0 ? String(goals) : undefined },
    {
      tab: 'invest',
      label: t('plan.tab_invest'),
      value: invested > 0 ? formatMoney(Math.round(invested), currency, { compact: true }) : undefined,
    },
  ]

  return (
    <div className="row">
      <div className="row-main gap-0 py-2.5">
        {links.map((l, i) => (
          <span key={l.tab} className="flex items-center">
            {i > 0 && <span className="px-2 text-ink-subtle">·</span>}
            <button
              type="button"
              onClick={() => onOpen(l.tab)}
              className="press caption rounded-md py-1 text-ink-muted transition-colors active:text-ink"
            >
              {l.label}
              {l.value && <span className="ml-1 font-semibold tabular-nums text-ink">{l.value}</span>}
            </button>
          </span>
        ))}
      </div>
    </div>
  )
}

/** Лёгкий тактильный сигнал, когда впервые за сессию что-то вышло за лимит. */
function useBudgetWarning(count: number) {
  const periodKey = useStore((s) => `${s.period.mode}:${s.period.anchor}`)
  const warned = useRef<string | null>(null)
  useEffect(() => {
    if (count === 0) return
    const key = `${periodKey}:${count}`
    if (warned.current === key) return
    warned.current = key
    hapticNotify('warning')
  }, [periodKey, count])
}
