import { useStore, selectTotalsByCurrency, type PeriodMode } from '../store/transactions'
import { AnimatedMoney } from './ui/Odometer'
import { useHeroSkin } from '../lib/useHeroSkin'
import type { PointerEvent as ReactPointerEvent } from 'react'
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
  const skin = useHeroSkin()

  // Голограмма: перелив идёт за пальцем по карте (переменная --holo-x для
  // слоя ::before в styles/skins.css). На остальных обложках — ничего.
  const onHoloMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const k = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
    e.currentTarget.style.setProperty('--holo-x', `${(-18 + k * 32).toFixed(1)}%`)
  }

  const allEntries = Object.entries(byCurrency) as [Currency, { income: number; expense: number; balance: number }][]
  // Выбран счёт (валюта) — показываем только его (одновалютный вид). Если по этой
  // валюте нет операций за период — пустые нули в той же валюте.
  const entries: [Currency, { income: number; expense: number; balance: number }][] = account
    ? [[account, byCurrency[account] ?? { income: 0, expense: 0, balance: 0 }]]
    : allEntries

  return (
    <div className="px-4 pb-3">
      {/* Обычный div, а не m.div с initial: opacity 0. Это главное число в
          приложении, а framer крутит появление через requestAnimationFrame: в
          свёрнутом Telegram он стоит, и карточка оставалась бы невидимой
          (см. «Грабли» в CLAUDE.md). Появление и так даёт .tab-enter вкладки. */}
      <div
        className={`hero-surface relative overflow-hidden rounded-4xl px-6 py-5 ${skin}`}
        onPointerMove={skin === 'skin-holo' ? onHoloMove : undefined}
      >

        <div className="relative">
          <div className="caption text-white/70">{t(BALANCE_LABEL[periodMode])}</div>

          {entries.length === 0 ? (
            /* Нет транзакций — пустое состояние */
            <div className="mt-1 text-display-lg tabular text-white">0</div>
          ) : entries.length === 1 ? (
            /* Одна валюта — классический вид */
            <>
              {/* Цифры-барабаны: добавил операцию или пролистал месяц — сумма
                  прокручивается к новой. */}
              <div className="mt-1 text-display-lg text-white">
                <AnimatedMoney value={entries[0][1].balance} currency={entries[0][0]} />
              </div>
              <div className="mt-4 flex items-center gap-4">
                <Stat label={t('common.income')} amount={entries[0][1].income} currency={entries[0][0]} positive />
                <div className="h-8 w-px bg-white/20" />
                <Stat label={t('common.expense')} amount={entries[0][1].expense} currency={entries[0][0]} />
              </div>
            </>
          ) : (
            /* Несколько валют — стопка строк */
            <div className="mt-2 space-y-3">
              {entries.map(([cur, totals], i) => (
                <div key={cur}>
                  {i > 0 && <div className="mb-3 border-t border-white/10" />}
                  <div className="flex items-baseline justify-between">
                    <span className="caption-sm text-white/60">{cur}</span>
                    <span className="tabular text-lg font-bold text-white">
                      <AnimatedMoney value={totals.balance} currency={cur} />
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-3">
                    <Stat label={t('common.income')} amount={totals.income} currency={cur} positive compact />
                    <div className="h-6 w-px bg-white/20" />
                    <Stat label={t('common.expense')} amount={totals.expense} currency={cur} compact />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({
  label,
  amount,
  currency,
  positive,
  compact,
}: {
  label: string
  amount: number
  currency: Currency
  positive?: boolean
  compact?: boolean
}) {
  return (
    <div>
      <div className={`text-white/65 ${compact ? 'caption-sm' : 'caption'}`}>{label}</div>
      <div className={`tabular font-bold ${compact ? 'text-xs' : 'text-sm'} ${positive ? 'text-white' : 'text-white/95'}`}>
        {positive ? '+ ' : '− '}
        <AnimatedMoney value={Math.abs(amount)} currency={currency} />
      </div>
    </div>
  )
}
