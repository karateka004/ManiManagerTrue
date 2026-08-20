import { Repeat } from 'lucide-react'
import { useStore, selectRecurring } from '../store/transactions'
import { localDayKey, daysBetween } from '../lib/day'
import { formatMoney, dayjs } from '../lib/format'
import { useCatName, useT } from '../lib/i18n'
import { hapticNotify, hapticTap } from '../lib/telegram'
import { CategoryIcon } from './icons/CategoryIcon'

/** Сколько дней после ожидаемой даты подсказка ещё уместна. */
const FRESH_DAYS = 7
/** Больше двух строк на Главной — это уже не подсказка, а список дел. */
const MAX_ROWS = 2

/**
 * «Пора записать» — постоянные траты, срок которых подошёл, а записи нет.
 *
 * Замыкает цикл, ради которого искались регулярные платежи: приложение само
 * заметило повтор, само поняло, что очередной платёж не записан, и предлагает
 * внести его одним касанием. Для приложения с ручным вводом трение записи —
 * главная причина, по которой его забрасывают.
 *
 * Показываем только свежие: если срок прошёл больше недели назад, платёж,
 * скорее всего, просто закончился, и напоминать о нём месяцами незачем.
 * В Аналитике такие строки всё равно видны — там панель, а не подсказка.
 */
export function DueRecurring() {
  const all = useStore(selectRecurring)
  const commitTransaction = useStore((s) => s.commitTransaction)
  const t = useT()
  const catName = useCatName()

  const today = localDayKey(Date.now())
  const rows = all.filter((r) => r.due && daysBetween(r.nextDay, today) <= FRESH_DAYS).slice(0, MAX_ROWS)
  if (rows.length === 0) return null

  const record = (r: (typeof rows)[number]) => {
    hapticNotify('success')
    commitTransaction(
      {
        type: 'expense',
        amount: r.amount,
        categoryId: r.categoryId,
        currency: r.currency,
        note: r.title || undefined,
        date: dayjs().format('YYYY-MM-DD'),
      },
      null,
    )
  }

  return (
    <div className="mx-4 mt-3 rounded-3xl bg-surface-raised px-4 py-3 shadow-soft dark:shadow-soft-dark">
      <div className="mb-1 flex items-center gap-2">
        <Repeat size={14} strokeWidth={2.4} className="text-ink-subtle" />
        <span className="text-[11px] font-extrabold uppercase tracking-wider text-ink-subtle">{t('due.title')}</span>
      </div>
      {rows.map((r) => (
        <div key={r.id} className="flex items-center gap-3 py-2">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
            style={{ background: r.color + '28', color: r.color }}
          >
            <CategoryIcon id={r.icon} size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-semibold text-ink">
              {r.title || catName(r.categoryId, r.name)}
            </div>
            <div className="tabular text-[12px] text-ink-subtle">{formatMoney(r.amount, r.currency)}</div>
          </div>
          <button
            onClick={() => {
              hapticTap()
              record(r)
            }}
            className="shrink-0 rounded-full bg-brand-500 px-3.5 py-1.5 text-[12px] font-bold text-white active:scale-95"
          >
            {t('due.record')}
          </button>
        </div>
      ))}
    </div>
  )
}
