import { useState } from 'react'
import { X, TrendingDown, TrendingUp } from 'lucide-react'
import { useStore, selectMonthlySummary } from '../store/transactions'
import { daysIntoMonth, monthKey } from '../lib/monthly'
import { dayjs, formatMoney } from '../lib/format'
import { useCatName, useT } from '../lib/i18n'
import { hapticTap } from '../lib/telegram'
import { CategoryIcon } from './icons/CategoryIcon'

/** Ключ последнего месяца, за который итоги уже посмотрели. */
const SEEN_KEY = 'koshel:recap'
/** Сколько дней нового месяца итоги ещё уместны. Позже это уже не новость. */
const SHOW_DAYS = 10

/**
 * Итоги прошедшего месяца — карточка на Главной в первые дни нового месяца.
 *
 * Не модальное окно: раз в месяц перегораживать вход в приложение неуважительно,
 * а карточку человек видит сам и закрывает, когда прочитал. Закрытая не
 * возвращается — отметка о просмотре лежит рядом с флагом онбординга.
 */
export function MonthlyRecap() {
  const summary = useStore(selectMonthlySummary)
  const currency = useStore((s) => s.currency)
  const t = useT()
  const catName = useCatName()

  const key = summary ? monthKey(summary.monthStart) : ''
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(SEEN_KEY) === key
    } catch {
      return false
    }
  })

  if (!summary || hidden) return null
  // Итоги живут только в начале месяца: в двадцатых числах это уже история.
  if (daysIntoMonth(Date.now()) > SHOW_DAYS) return null

  const close = () => {
    hapticTap()
    try {
      localStorage.setItem(SEEN_KEY, key)
    } catch {
      /* приватный режим — просто закроем до перезагрузки */
    }
    setHidden(true)
  }

  const delta = summary.deltaPct === null ? null : Math.round(summary.deltaPct)
  const down = (delta ?? 0) < 0

  return (
    <div className="mx-4 mt-3 overflow-hidden rounded-3xl bg-surface-raised shadow-soft dark:shadow-soft-dark">
      <div className="flex items-start justify-between gap-2 px-4 pt-3.5">
        <div>
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-ink-subtle">
            {t('recap.title', { month: dayjs(summary.monthStart).format('MMMM') })}
          </div>
          <div className="tabular mt-1 text-[26px] font-extrabold leading-none tracking-tight text-ink">
            {formatMoney(summary.spent, currency)}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {delta !== null && delta !== 0 && (
            <span
              className={`flex items-center gap-1 rounded-full px-2 py-1 text-[12px] font-extrabold ${
                down
                  ? 'bg-income-soft text-income-deep dark:bg-brand-500/16 dark:text-brand-300'
                  : 'bg-expense-soft text-expense-deep dark:bg-expense/16 dark:text-expense'
              }`}
            >
              {down ? <TrendingDown size={13} strokeWidth={2.6} /> : <TrendingUp size={13} strokeWidth={2.6} />}
              {Math.abs(delta)}%
            </span>
          )}
          <button
            onClick={close}
            aria-label={t('common.close')}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-sunken text-ink-subtle active:scale-95"
          >
            <X size={15} strokeWidth={2.4} />
          </button>
        </div>
      </div>

      <div className="mt-3 divide-y divide-ink/[.06] border-t border-ink/[.06] dark:divide-ink/[.09] dark:border-ink/[.09]">
        {summary.topCategory && (
          <Row
            label={t('recap.top')}
            icon={<CategoryIcon id={summary.topCategory.icon} size={16} />}
            color={summary.topCategory.color}
            name={catName(summary.topCategory.id, summary.topCategory.name)}
            value={formatMoney(summary.topCategory.amount, currency)}
          />
        )}
        {summary.biggest && (
          <Row
            label={t('recap.biggest')}
            name={summary.biggest.note?.trim() || dayjs(summary.biggest.date).format('D MMMM')}
            value={formatMoney(summary.biggest.amount, summary.biggest.currency ?? currency)}
          />
        )}
        <Row label={t('recap.free_days')} value={String(summary.freeDays)} />
        <Row label={t('recap.count')} value={String(summary.count)} />
      </div>
    </div>
  )
}

function Row({
  label,
  icon,
  color,
  name,
  value,
}: {
  label: string
  icon?: React.ReactNode
  color?: string
  name?: string
  value: string
}) {
  return (
    <div className="flex items-center gap-2 px-4 py-2.5">
      <span className="shrink-0 text-[12px] text-ink-subtle">{label}</span>
      <span className="min-w-0 flex flex-1 items-center justify-end gap-1.5">
        {icon && (
          <span
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md"
            style={{ background: (color ?? '#8A968F') + '28', color: color ?? '#8A968F' }}
          >
            {icon}
          </span>
        )}
        {name && <span className="truncate text-[13px] font-semibold text-ink">{name}</span>}
        <span className="tabular shrink-0 text-[13px] font-extrabold text-ink">{value}</span>
      </span>
    </div>
  )
}
