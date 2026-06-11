import { m } from 'framer-motion'
import { Minus, Plus } from 'lucide-react'
import { hapticTap } from '../lib/telegram'
import { useT } from '../lib/i18n'

interface Props {
  onAddExpense: () => void
  onAddIncome: () => void
}

export function FabButtons({ onAddExpense, onAddIncome }: Props) {
  const t = useT()
  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-30 flex justify-center"
      style={{ bottom: 'calc(var(--safe-bottom, 0px) + 84px)' }}
    >
      <m.div
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-surface-raised/95 p-1.5 shadow-fab backdrop-blur"
      >
        <button
          onClick={() => { hapticTap('medium'); onAddExpense() }}
          className="flex h-12 items-center gap-1.5 rounded-full bg-expense-soft px-4 text-expense-deep transition-transform active:scale-95 dark:bg-expense/15"
          aria-label={t('fab.add_expense')}
        >
          <Minus size={20} strokeWidth={3} />
          <span className="text-sm font-bold">{t('common.expense_one')}</span>
        </button>

        <button
          onClick={() => { hapticTap('medium'); onAddIncome() }}
          className="flex h-12 items-center gap-1.5 rounded-full bg-brand-500 px-4 text-white transition-transform active:scale-95"
          aria-label={t('fab.add_income')}
        >
          <Plus size={20} strokeWidth={3} />
          <span className="text-sm font-bold">{t('common.income_one')}</span>
        </button>
      </m.div>
    </div>
  )
}
