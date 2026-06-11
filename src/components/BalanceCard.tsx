import { m } from 'framer-motion'
import { useStore, selectTotalsByCurrency, type PeriodMode } from '../store/transactions'
import { formatMoney } from '../lib/format'
import { useT } from '../lib/i18n'
import type { Currency } from '../lib/currencies'

/** Подпись баланса под выбранный период (значение и так считается по периоду). */
const BALANCE_LABEL: Record<PeriodMode, string> = {
  day: 'balance.day',
  week: 'balance.week',
  month: 'balance.month',
  year: 'balance.year',
  all: 'balance.all',
  range: 'balance.custom',
}

export function BalanceCard() {
  const byCurrency = useStore(selectTotalsByCurrency)
  const periodMode = useStore((s) => s.period.mode)
  const account = useStore((s) => s.account)
  const t = useT()

  const allEntries = Object.entries(byCurrency) as [Currency, { income: number; expense: number; balance: number }][]
  // Выбран счёт (валюта) — показываем только его (одновалютный вид). Если по этой
  // валюте нет операций за период — пустые нули в той же валюте.
  const entries: [Currency, { income: number; expense: number; balance: number }][] = account
    ? [[account, byCurrency[account] ?? { income: 0, expense: 0, balance: 0 }]]
    : allEntries

  return (
    <div className="px-6 pb-2">
      <m.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="relative overflow-hidden rounded-4xl bg-gradient-to-br from-brand-400 via-brand-500 to-brand-600 px-6 py-5 shadow-raised"
      >
        {/* Декоративные блобы */}
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-12 -left-6 h-32 w-32 rounded-full bg-brand-300/30 blur-2xl" />

        <div className="relative">
          <div className="text-xs font-semibold uppercase tracking-widest text-white/70">{t(BALANCE_LABEL[periodMode])}</div>

          {entries.length === 0 ? (
            /* Нет транзакций — пустое состояние */
            <div className="mt-1 text-display-lg tabular text-white">0</div>
          ) : entries.length === 1 ? (
            /* Одна валюта — классический вид */
            <>
              <div className="mt-1 text-display-lg tabular text-white">
                {formatMoney(entries[0][1].balance, entries[0][0])}
              </div>
              <div className="mt-4 flex items-center gap-4">
                <Stat label={t('common.income')} value={formatMoney(entries[0][1].income, entries[0][0])} positive />
                <div className="h-8 w-px bg-white/20" />
                <Stat label={t('common.expense')} value={formatMoney(entries[0][1].expense, entries[0][0])} />
              </div>
            </>
          ) : (
            /* Несколько валют — стопка строк */
            <div className="mt-2 space-y-3">
              {entries.map(([cur, totals], i) => (
                <div key={cur}>
                  {i > 0 && <div className="mb-3 border-t border-white/10" />}
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs font-bold uppercase tracking-widest text-white/60">{cur}</span>
                    <span className="tabular text-lg font-bold text-white">
                      {formatMoney(totals.balance, cur)}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-3">
                    <Stat label={t('common.income')} value={formatMoney(totals.income, cur)} positive compact />
                    <div className="h-6 w-px bg-white/20" />
                    <Stat label={t('common.expense')} value={formatMoney(totals.expense, cur)} compact />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </m.div>
    </div>
  )
}

function Stat({
  label,
  value,
  positive,
  compact,
}: {
  label: string
  value: string
  positive?: boolean
  compact?: boolean
}) {
  return (
    <div>
      <div className={`font-semibold uppercase tracking-widest text-white/60 ${compact ? 'text-[9px]' : 'text-[10px]'}`}>{label}</div>
      <div className={`tabular font-bold ${compact ? 'text-xs' : 'text-sm'} ${positive ? 'text-white' : 'text-white/95'}`}>
        {positive ? '+ ' : '− '}
        {value.replace('−', '')}
      </div>
    </div>
  )
}
