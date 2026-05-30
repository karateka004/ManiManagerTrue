import { motion } from 'framer-motion'
import { useStore, selectBalance, selectTotals } from '../store/transactions'
import { formatMoney } from '../lib/format'

export function BalanceCard() {
  const balance = useStore(selectBalance)
  const totals = useStore(selectTotals)
  const currency = useStore((s) => s.currency)

  return (
    <div className="px-6 pb-2">
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="relative overflow-hidden rounded-4xl bg-gradient-to-br from-brand-400 via-brand-500 to-brand-600 px-6 py-5 shadow-raised"
      >
        {/* Decorative blob */}
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-12 -left-6 h-32 w-32 rounded-full bg-brand-300/30 blur-2xl" />

        <div className="relative">
          <div className="text-xs font-semibold uppercase tracking-widest text-white/70">Баланс месяца</div>
          <div className="mt-1 text-display-lg tabular text-white">
            {formatMoney(balance, currency)}
          </div>

          <div className="mt-4 flex items-center gap-4">
            <Stat label="Доходы" value={formatMoney(totals.income, currency)} positive />
            <div className="h-8 w-px bg-white/20" />
            <Stat label="Расходы" value={formatMoney(totals.expense, currency)} />
          </div>
        </div>
      </motion.div>
    </div>
  )
}

function Stat({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-widest text-white/60">{label}</div>
      <div className={`tabular text-sm font-bold ${positive ? 'text-white' : 'text-white/95'}`}>
        {positive ? '+ ' : '− '}
        {value.replace('−', '')}
      </div>
    </div>
  )
}
