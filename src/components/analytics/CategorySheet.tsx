import { useMemo } from 'react'
import { TrendingDown, TrendingUp } from 'lucide-react'
import { BottomSheet } from '../ui/BottomSheet'
import { CategoryIcon } from '../icons/CategoryIcon'
import {
  useStore,
  selectAllCategories,
  selectCategoryMonths,
  selectOverview,
  selectTransactionsByCategory,
  type Transaction,
} from '../../store/transactions'
import { formatMoney, dayjs } from '../../lib/format'
import { useCatName, useT } from '../../lib/i18n'
import { hapticTap } from '../../lib/telegram'

interface Props {
  /** Открытая категория; null — шторка закрыта. */
  categoryId: string | null
  onClose: () => void
  onEditTx: (t: Transaction) => void
}

/** Сколько операций показываем: длиннее список в шторке не просматривают. */
const MAX_ROWS = 40

/**
 * Карточка одной категории: помесячный след за полгода и операции периода.
 *
 * Открывается из «Потока денег». До неё разбивка по категориям была тупиком:
 * видно, что «Машина — 455 €», но не видно, много это для неё или нет и из
 * чего сумма сложилась. Полгода столбиков отвечают на первый вопрос, список
 * операций — на второй.
 */
export function CategorySheet({ categoryId, onClose, onEditTx }: Props) {
  // Без min-h: при паре операций лист не должен занимать три четверти экрана
  return (
    <BottomSheet open={categoryId !== null} onClose={onClose}>
      {categoryId !== null && <Body categoryId={categoryId} onClose={onClose} onEditTx={onEditTx} />}
    </BottomSheet>
  )
}

function Body({ categoryId, onClose, onEditTx }: { categoryId: string; onClose: () => void; onEditTx: (t: Transaction) => void }) {
  const months = useStore((s) => selectCategoryMonths(s, categoryId))
  const rows = useStore((s) => selectTransactionsByCategory(s, categoryId))
  const categories = useStore(selectAllCategories)
  const o = useStore(selectOverview)
  const t = useT()
  const catName = useCatName()

  const cat = useMemo(() => categories.find((c) => c.id === categoryId), [categories, categoryId])
  const color = cat?.color ?? '#8A968F'
  const inPeriod = o.categories.find((c) => c.categoryId === categoryId)
  const amount = inPeriod?.amount ?? rows.reduce((a, x) => a + (x.type === 'expense' ? x.amount : 0), 0)
  const delta = inPeriod?.deltaPct === null || inPeriod === undefined ? null : Math.round(inPeriod.deltaPct)
  const down = (delta ?? 0) < 0
  const max = Math.max(...months.map((m) => m.amount), 1)

  const open = (tx: Transaction) => {
    hapticTap()
    onClose()
    onEditTx(tx)
  }

  return (
    <div className="px-5 pb-2">
      <div className="flex items-center gap-3">
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
          style={{ background: color + '28', color }}
        >
          <CategoryIcon id={cat?.icon ?? 'other'} size={24} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[17px] font-bold text-ink">{catName(categoryId, cat?.name ?? categoryId)}</div>
          <div className="tabular text-[13px] text-ink-subtle">{formatMoney(amount, o.currency)}</div>
        </div>
        {delta !== null && delta !== 0 && (
          <span
            className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-extrabold ${
              down
                ? 'bg-income-soft text-income-deep dark:bg-brand-500/16 dark:text-brand-300'
                : 'bg-expense-soft text-expense-deep dark:bg-expense/16 dark:text-expense'
            }`}
          >
            {down ? <TrendingDown size={13} strokeWidth={2.6} /> : <TrendingUp size={13} strokeWidth={2.6} />}
            {Math.abs(delta)}%
          </span>
        )}
      </div>

      {/* Полгода столбиков: столбик обязан считаться от родителя с высотой */}
      <div className="mt-5 text-[11px] font-extrabold uppercase tracking-wider text-ink-subtle">
        {t('cat.half_year')}
      </div>
      <div className="mt-2 flex h-24 items-stretch gap-2">
        {months.map((m, i) => {
          const last = i === months.length - 1
          return (
            <div key={m.start} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
              <div className="flex w-full flex-1 items-end">
                <span
                  aria-hidden
                  className="block w-full rounded-t-lg rounded-b"
                  style={{
                    height: `${Math.max(3, (m.amount / max) * 100)}%`,
                    background: color,
                    opacity: last ? 1 : 0.4,
                  }}
                />
              </div>
              <span className={`truncate text-[10px] font-bold ${last ? 'text-ink' : 'text-ink-subtle'}`}>
                {m.label}
              </span>
            </div>
          )
        })}
      </div>

      <div className="mt-5 text-[11px] font-extrabold uppercase tracking-wider text-ink-subtle">
        {t('cat.in_period')}
      </div>
      {rows.length === 0 ? (
        <div className="py-6 text-center text-[13px] text-ink-subtle">{t('cat.empty')}</div>
      ) : (
        <div className="mt-1 divide-y divide-ink/[.06] dark:divide-ink/[.09]">
          {rows.slice(0, MAX_ROWS).map((tx) => (
            <button
              key={tx.id}
              onClick={() => open(tx)}
              className="flex w-full items-center gap-3 py-2.5 text-left active:opacity-70"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold text-ink">
                  {tx.note?.trim() || dayjs(tx.date).format('D MMMM')}
                </div>
                {tx.note?.trim() && (
                  <div className="text-[12px] text-ink-subtle">{dayjs(tx.date).format('D MMMM')}</div>
                )}
              </div>
              <span className="tabular shrink-0 text-[14px] font-extrabold text-ink">
                {formatMoney(tx.amount, tx.currency ?? o.currency)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
