import { motion } from 'framer-motion'
import { hapticTap } from '../lib/telegram'

interface Props {
  onAddExpense: () => void
  onAddIncome: () => void
}

export function FabButtons({ onAddExpense, onAddIncome }: Props) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-30 flex justify-center gap-6 px-6"
      style={{ bottom: 'calc(var(--safe-bottom, 0px) + 80px)' }}
    >
      <motion.button
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        onClick={() => {
          hapticTap('medium')
          onAddExpense()
        }}
        className="fab pointer-events-auto bg-white ring-4 ring-expense/15"
        aria-label="Добавить расход"
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
          <path d="M5 12h14" stroke="#E97373" strokeWidth="3.5" strokeLinecap="round" />
        </svg>
      </motion.button>

      <motion.button
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.15, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        onClick={() => {
          hapticTap('medium')
          onAddIncome()
        }}
        className="fab pointer-events-auto bg-white ring-4 ring-brand-400/20"
        aria-label="Добавить доход"
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
          <path d="M12 5v14M5 12h14" stroke="#3CA37B" strokeWidth="3.5" strokeLinecap="round" />
        </svg>
      </motion.button>
    </div>
  )
}
