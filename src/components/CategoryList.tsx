import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  useStore,
  selectByCategory,
  selectTransactionsByCategory,
  selectBudgetStatuses,
  type CategoryAggregate,
  type BudgetStatus,
} from '../store/transactions'
import { formatMoney, formatShortDate } from '../lib/format'
import { hapticTap, hapticSelect } from '../lib/telegram'
import { CategoryIcon } from './icons/CategoryIcon'

export function CategoryList() {
  const expenses = useStore((s) => selectByCategory(s, 'expense'))
  const incomes = useStore((s) => selectByCategory(s, 'income'))
  const budgets = useStore(selectBudgetStatuses)
  const budgetByCat = new Map(budgets.map((b) => [b.categoryId, b]))

  if (expenses.length === 0 && incomes.length === 0) {
    return <EmptyState />
  }

  return (
    <div className="mt-2 px-4">
      {incomes.length > 0 && (
        <SectionHeader title="Доходы" total={incomes.reduce((s, c) => s + c.amount, 0)} kind="income" />
      )}
      <div className="space-y-2">
        {incomes.map((c) => <CategoryRow key={c.categoryId} cat={c} />)}
      </div>

      {expenses.length > 0 && (
        <SectionHeader title="Расходы" total={expenses.reduce((s, c) => s + c.amount, 0)} kind="expense" />
      )}
      <div className="space-y-2">
        {expenses.map((c) => <CategoryRow key={c.categoryId} cat={c} budget={budgetByCat.get(c.categoryId)} />)}
      </div>

      {/* Bottom padding so FAB doesn't cover last row */}
      <div className="h-32" />
    </div>
  )
}

function SectionHeader({ title, total, kind }: { title: string; total: number; kind: 'income' | 'expense' }) {
  const currency = useStore((s) => s.currency)
  return (
    <div className="mb-2 mt-4 flex items-center justify-between px-2">
      <span className="text-xs font-bold uppercase tracking-wider text-ink-subtle">{title}</span>
      <span className={`tabular text-xs font-bold ${kind === 'income' ? 'text-income-deep' : 'text-expense-deep'}`}>
        {kind === 'income' ? '+' : '−'} {formatMoney(total, currency).replace('−', '')}
      </span>
    </div>
  )
}

function CategoryRow({ cat, budget }: { cat: CategoryAggregate; budget?: BudgetStatus }) {
  const [open, setOpen] = useState(false)
  const transactions = useStore((s) => selectTransactionsByCategory(s, cat.categoryId))
  const removeTransaction = useStore((s) => s.removeTransaction)
  const currency = useStore((s) => s.currency)

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
            <span className="font-semibold text-ink">{cat.name}</span>
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
              <span>из лимита</span>
              <span className="tabular">{formatMoney(budget.limit, currency)}</span>
            </div>
          )}
        </div>

        <div className="text-right">
          <div className={`tabular font-bold ${cat.kind === 'income' ? 'text-income-deep' : 'text-expense-deep'}`}>
            {cat.kind === 'income' ? '+' : '−'} {formatMoney(cat.amount, currency).replace('−', '')}
          </div>
          <div className="text-xs text-ink-subtle">{cat.pct.toFixed(0)}%</div>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-surface-sunken bg-surface-sunken/30 px-4 py-2">
              {transactions.map((t) => (
                <div key={t.id} className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-3">
                    <span className="h-2 w-2 rounded-full" style={{ background: cat.color }} />
                    <div>
                      {t.note && <div className="text-sm text-ink">{t.note}</div>}
                      <div className="text-xs text-ink-subtle">{formatShortDate(t.date)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`tabular text-sm font-semibold ${cat.kind === 'income' ? 'text-income-deep' : 'text-expense-deep'}`}>
                      {cat.kind === 'income' ? '+' : '−'} {formatMoney(t.amount, currency).replace('−', '')}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        hapticTap('medium')
                        removeTransaction(t.id)
                      }}
                      className="text-ink-subtle/60 text-lg active:text-expense"
                      aria-label="Удалить"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function EmptyState() {
  const seedDemo = useStore((s) => s.seedDemo)

  return (
    <div className="mt-6 flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-brand-100 text-brand-500">
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3v9l6 4" />
        </svg>
      </div>
      <h3 className="text-xl font-bold text-ink">Пусто, но это поправимо</h3>
      <p className="mt-2 max-w-xs text-sm text-ink-muted">
        Нажмите «+» или «−» внизу, чтобы добавить первую запись. Или загрузите демо-данные.
      </p>
      <button
        onClick={() => { hapticTap(); seedDemo() }}
        className="mt-6 rounded-full bg-brand-500 px-6 py-3 text-sm font-semibold text-white active:scale-95 transition-transform"
      >
        Загрузить демо
      </button>
    </div>
  )
}
