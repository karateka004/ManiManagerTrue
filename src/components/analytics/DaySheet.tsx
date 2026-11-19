import { useMemo, useRef } from 'react'
import { BottomSheet } from '../ui/BottomSheet'
import { CategoryIcon } from '../icons/CategoryIcon'
import { useStore, selectAllCategories, selectAnalyticsCurrency, type Transaction } from '../../store/transactions'
import { selectDayTransactions } from '../../store/analytics'
import { dayjs, formatMoney } from '../../lib/format'
import { useCatName } from '../../lib/i18n'
import { hapticTap } from '../../lib/telegram'
import { MASK } from '../../lib/clarity'
import { useAnT } from './text'

/**
 * Шторка дня из календаря: сколько ушло и пришло, и все записи дня. Запись
 * открывается на правку — календарь из картинки становится инструментом.
 */
export function DaySheet({ dayKey, onClose, onEditTx }: { dayKey: number | null; onClose: () => void; onEditTx: (t: Transaction) => void }) {
  // Пока шторка уезжает, день уже сброшен — держим последний, чтобы заголовок не пропал.
  const shown = useRef<number | null>(null)
  if (dayKey !== null) shown.current = dayKey
  const key = shown.current
  const lang = useStore((s) => s.lang)
  const raw = key === null ? '' : dayjs(key).format(lang === 'en' ? 'dddd, MMMM D' : 'dddd, D MMMM')
  const title = raw.charAt(0).toUpperCase() + raw.slice(1)
  return (
    <BottomSheet open={dayKey !== null} onClose={onClose} title={title} maxHeight="80vh">
      {key !== null && <Body dayKey={key} onClose={onClose} onEditTx={onEditTx} />}
    </BottomSheet>
  )
}

function Body({ dayKey, onClose, onEditTx }: { dayKey: number; onClose: () => void; onEditTx: (t: Transaction) => void }) {
  const rows = useStore((s) => selectDayTransactions(s, dayKey))
  const categories = useStore(selectAllCategories)
  const currency = useStore(selectAnalyticsCurrency)
  const catName = useCatName()
  const t = useAnT()
  const byId = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
  const spent = rows.reduce((a, x) => (x.type === 'expense' ? a + x.amount : a), 0)
  const income = rows.reduce((a, x) => (x.type === 'income' ? a + x.amount : a), 0)

  if (rows.length === 0) return <div className="px-5 py-10 text-center text-[14px] text-ink-subtle">{t('day.empty')}</div>

  return (
    <div className="px-5 pb-2">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-surface-sunken/70 px-4 py-3">
          <div className="caption-sm text-ink-subtle">{t('day.spent')}</div>
          <div className="mt-0.5 text-[17px] font-extrabold tabular text-expense-deep dark:text-expense-soft" {...MASK}>
            {spent > 0 ? '−' + formatMoney(spent, currency) : '—'}
          </div>
        </div>
        <div className="rounded-2xl bg-surface-sunken/70 px-4 py-3">
          <div className="caption-sm text-ink-subtle">{t('day.income')}</div>
          <div className="mt-0.5 text-[17px] font-extrabold tabular text-income-deep dark:text-income-light" {...MASK}>
            {income > 0 ? '+' + formatMoney(income, currency) : '—'}
          </div>
        </div>
      </div>
      <div className="mt-2 divide-y divide-hairline">
        {rows.map((x) => {
          const c = byId.get(x.categoryId)
          const color = c?.color ?? '#8A968F'
          const name = catName(x.categoryId, c?.name ?? x.categoryId)
          const note = x.note?.trim()
          return (
            <button
              key={x.id}
              type="button"
              onClick={() => {
                hapticTap()
                onClose()
                onEditTx(x)
              }}
              className="flex w-full items-center gap-3 py-3 text-left active:opacity-70"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: color + '26', color }}>
                <CategoryIcon id={c?.icon ?? 'other'} size={19} />
              </span>
              <span className="min-w-0 flex-1" {...MASK}>
                <span className="block truncate text-[14.5px] font-bold text-ink">{note || name}</span>
                <span className="block truncate text-[12px] text-ink-subtle">{note ? name : dayjs(x.date).format('HH:mm')}</span>
              </span>
              <span
                className={`shrink-0 text-[15px] font-extrabold tabular ${x.type === 'income' ? 'text-income-deep dark:text-income-light' : 'text-ink'}`}
                {...MASK}
              >
                {(x.type === 'income' ? '+' : '−') + formatMoney(x.amount, x.currency ?? currency)}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
