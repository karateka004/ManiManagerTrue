import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore, selectExceededBudgets } from '../store/transactions'
import { formatMoney } from '../lib/format'
import { hapticNotify } from '../lib/telegram'

/**
 * Тревожная плашка над списком категорий, если хотя бы по одной категории
 * расход за выбранный месяц вышел за 80% бюджета. При первом появлении
 * в сессии — лёгкий haptic warning.
 */
export function BudgetAlert() {
  const exceeded = useStore(selectExceededBudgets)
  const periodKey = useStore((s) => `${s.period.mode}:${s.period.anchor}`)
  const currency = useStore((s) => s.currency)
  const warned = useRef<string | null>(null)

  useEffect(() => {
    if (exceeded.length === 0) return
    // Один раз на (период + кол-во превышений), чтобы не дёргать на каждый рендер.
    const key = `${periodKey}:${exceeded.length}`
    if (warned.current === key) return
    warned.current = key
    hapticNotify('warning')
  }, [periodKey, exceeded.length])

  const over = exceeded.filter((b) => b.level === 'over')
  const warn = exceeded.filter((b) => b.level === 'warn')

  return (
    <AnimatePresence>
      {exceeded.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="mx-4 mt-2"
        >
          <div
            className={`card flex items-start gap-3 p-3 ${
              over.length > 0
                ? 'bg-expense-soft/60 dark:bg-expense-soft/10'
                : 'bg-yellow-50/80 dark:bg-yellow-500/10'
            }`}
          >
            <div
              className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                over.length > 0
                  ? 'bg-expense text-white'
                  : 'bg-yellow-400 text-yellow-900'
              }`}
              aria-hidden
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 9v4" />
                <path d="M12 17h.01" />
                <path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0z" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-ink">
                {over.length > 0 ? 'Бюджет превышен' : 'Бюджет на пределе'}
              </div>
              <div className="mt-0.5 text-xs leading-relaxed text-ink-muted">
                {[...over, ...warn].slice(0, 3).map((b, i, arr) => (
                  <span key={b.categoryId}>
                    <span className="font-semibold" style={{ color: b.color }}>{b.name}</span>
                    {' '}
                    <span className="tabular">
                      {formatMoney(b.spent, currency)} / {formatMoney(b.limit, currency)}
                    </span>
                    {i < arr.length - 1 && <span className="text-ink-subtle"> · </span>}
                  </span>
                ))}
                {exceeded.length > 3 && (
                  <span className="text-ink-subtle"> · и ещё {exceeded.length - 3}</span>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
