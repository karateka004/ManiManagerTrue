import { memo, useMemo, useState } from 'react'
import { AnimatePresence, m } from 'framer-motion'
import {
  useStore,
  selectByCategoryAccount,
  selectTransactionsByCategory,
  selectBudgetStatuses,
  selectAnalyticsCurrency,
  type CategoryAggregate,
  type BudgetStatus,
  type Transaction,
} from '../store/transactions'
import { PieChart } from 'lucide-react'
import { formatMoney, formatShortDate } from '../lib/format'
import { useCatName, useT } from '../lib/i18n'
import type { Currency } from '../lib/currencies'
import { hapticTap, hapticSelect } from '../lib/telegram'
import { CategoryIcon } from './icons/CategoryIcon'

export const CategoryList = memo(function CategoryList({ onEditTx }: { onEditTx: (t: Transaction) => void }) {
  const expenses = useStore((s) => selectByCategoryAccount(s, 'expense'))
  const incomes = useStore((s) => selectByCategoryAccount(s, 'income'))
  const budgets = useStore(selectBudgetStatuses)
  // Пересобираем карту только когда изменились сами бюджеты, иначе каждая строка
  // получала бы новый объект budget и memo на ней не срабатывал бы.
  const budgetByCat = useMemo(() => new Map(budgets.map((b) => [b.categoryId, b])), [budgets])
  const t = useT()

  if (expenses.length === 0 && incomes.length === 0) {
    return <EmptyState />
  }

  return (
    <div className="mt-2 px-4">
      {incomes.length > 0 && (
        <SectionHeader title={t('common.income')} cats={incomes} kind="income" />
      )}
      <div className="space-y-2">
        {incomes.map((c) => <CategoryRow key={c.categoryId} cat={c} onEditTx={onEditTx} />)}
      </div>

      {expenses.length > 0 && (
        <SectionHeader title={t('common.expense')} cats={expenses} kind="expense" />
      )}
      <div className="space-y-2">
        {expenses.map((c) => <CategoryRow key={c.categoryId} cat={c} budget={budgetByCat.get(c.categoryId)} onEditTx={onEditTx} />)}
      </div>

      {/* Bottom padding so FAB doesn't cover last row */}
      <div className="h-32" />
    </div>
  )
})

function SectionHeader({ title, cats, kind }: { title: string; cats: CategoryAggregate[]; kind: 'income' | 'expense' }) {
  // Суммы по валютам: в режиме «Все» категории могут быть в разных валютах —
  // не смешиваем их в одно число, а показываем по каждой (722 ₴ · 80 €).
  const byCur = new Map<Currency, number>()
  for (const c of cats) byCur.set(c.currency, (byCur.get(c.currency) ?? 0) + c.amount)
  const parts = [...byCur.entries()]
  const symbol = kind === 'income' ? '+' : '−'

  return (
    <div className="mb-2 mt-4 flex items-center justify-between px-2">
      <span className="text-xs font-bold uppercase tracking-wider text-ink-subtle">{title}</span>
      <span className={`tabular text-xs font-bold ${kind === 'income' ? 'text-income-deep' : 'text-expense-deep'}`}>
        {parts.map(([cur, amount], i) => (
          <span key={cur}>
            {i > 0 && <span className="font-normal text-ink-subtle"> · </span>}
            {symbol} {formatMoney(amount, cur).replace('−', '')}
          </span>
        ))}
      </span>
    </div>
  )
}

const CategoryRow = memo(function CategoryRow({ cat, budget, onEditTx }: { cat: CategoryAggregate; budget?: BudgetStatus; onEditTx: (t: Transaction) => void }) {
  const [open, setOpen] = useState(false)
  const currency = useStore(selectAnalyticsCurrency)
  const tr = useT()
  const catName = useCatName()

  const toggle = () => {
    hapticSelect()
    setOpen((v) => !v)
  }

  const budgetStripe =
    budget?.level === 'over'
      ? 'before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-expense'
      : budget?.level === 'warn'
      ? 'before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-yellow-400'
      : ''

  return (
    <div className={`card relative overflow-hidden ${budgetStripe}`}>
      <button
        onClick={toggle}
        className="flex w-full items-center gap-3 px-4 py-3 active:bg-surface-sunken/40"
      >
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
          style={{ background: cat.color + '22', color: cat.color }}
        >
          <CategoryIcon id={cat.icon} size={22} />
        </div>

        <div className="flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-ink">{catName(cat.categoryId, cat.name)}</span>
            <span
              className="rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white"
              style={{ background: cat.color }}
            >
              {cat.count}
            </span>
          </div>
          <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-surface-sunken">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.min(cat.pct, 100)}%`, background: cat.color }}
            />
          </div>
          {budget && (
            <div className="mt-1 flex items-center gap-1 text-[10px] text-ink-subtle">
              <span
                className={
                  budget.level === 'over'
                    ? 'font-semibold text-expense-deep'
                    : budget.level === 'warn'
                    ? 'font-semibold text-yellow-700 dark:text-yellow-400'
                    : ''
                }
              >
                {Math.round(budget.ratio * 100)}%
              </span>
              <span>{tr('cat.of_limit')}</span>
              <span className="tabular">{formatMoney(budget.limit, currency)}</span>
            </div>
          )}
        </div>

        <div className="text-right">
          <div className={`tabular font-bold ${cat.kind === 'income' ? 'text-income-deep' : 'text-expense-deep'}`}>
            {cat.kind === 'income' ? '+' : '−'} {formatMoney(cat.amount, cat.currency).replace('−', '')}
          </div>
          <div className="text-xs text-ink-subtle">{cat.pct.toFixed(0)}%</div>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <m.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <RowTransactions cat={cat} currency={currency} onEditTx={onEditTx} />
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
})

/**
 * Список операций раскрытой категории. Вынесен отдельным компонентом ради
 * подписки: пока строка свёрнута, он не смонтирован — и селектор, проходящий по
 * всем операциям периода, для неё не считается. Раньше эта работа выполнялась
 * для КАЖДОЙ категории на каждое изменение стора, даже для свёрнутых.
 */
function RowTransactions({
  cat,
  currency,
  onEditTx,
}: {
  cat: CategoryAggregate
  currency: Currency
  onEditTx: (t: Transaction) => void
}) {
  const transactions = useStore((s) => selectTransactionsByCategory(s, cat.categoryId))
  const removeTransaction = useStore((s) => s.removeTransaction)
  const tr = useT()

  return (
    <div className="border-t border-surface-sunken bg-surface-sunken/30 px-4 py-2">
      {transactions.map((t) => (
        <div key={t.id} className="flex items-center justify-between py-2">
          <button
            onClick={() => { hapticSelect(); onEditTx(t) }}
            className="flex flex-1 items-center justify-between gap-3 text-left active:opacity-60"
            aria-label={tr('common.edit')}
          >
            <div className="flex items-center gap-3">
              <span className="h-2 w-2 rounded-full" style={{ background: cat.color }} />
              <div>
                {t.note && <div className="text-sm text-ink">{t.note}</div>}
                <div className="text-xs text-ink-subtle">{formatShortDate(t.date)}</div>
              </div>
            </div>
            <span className={`tabular text-sm font-semibold ${cat.kind === 'income' ? 'text-income-deep' : 'text-expense-deep'}`}>
              {cat.kind === 'income' ? '+' : '−'} {formatMoney(t.amount, t.currency ?? currency).replace('−', '')}
            </span>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              hapticTap('medium')
              removeTransaction(t.id)
            }}
            className="ml-3 text-ink-subtle/60 text-lg active:text-expense"
            aria-label={tr('common.delete')}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}

function EmptyState() {
  const setDemoMode = useStore((s) => s.setDemoMode)
  const t = useT()

  return (
    <div className="mt-4 flex flex-col items-center px-6 py-8 text-center">
      <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-brand-100 text-brand-500">
        <PieChart size={38} strokeWidth={1.5} />
      </div>
      <h3 className="text-xl font-bold text-ink">{t('empty.title')}</h3>
      <p className="mt-2 max-w-xs text-sm text-ink-muted">
        {t('empty.text')}
      </p>
      <button
        onClick={() => { hapticTap(); setDemoMode(true) }}
        className="mt-6 rounded-full bg-brand-500 px-6 py-3 text-sm font-semibold text-white active:scale-95 transition-transform"
      >
        {t('empty.enable_demo')}
      </button>
    </div>
  )
}
