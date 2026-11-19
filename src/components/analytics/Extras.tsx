import { memo, useDeferredValue, useMemo } from 'react'
import { ArrowUpRight, MessageCircle } from 'lucide-react'
import { useStore, selectAllCategories, selectAnalyticsCurrency, selectRecurring, type Transaction } from '../../store/transactions'
import { selectOverview } from '../../store/analytics'
import { dayjs, formatMoney } from '../../lib/format'
import { useCatName, weekdaysFull, weekdaysShort } from '../../lib/i18n'
import { hapticTap } from '../../lib/telegram'
import { MASK } from '../../lib/clarity'
import { CategoryIcon } from '../icons/CategoryIcon'
import { Widget } from './Glass'
import { useAnT } from './text'

/** Ритм недели: средний расход по дням недели, самый дорогой — ярче. */
export const RhythmWidget = memo(function RhythmWidget() {
  // Ниже первого экрана: при смене периода сначала обновляется видимое
  // (герой, показатели, подсказки), этот виджет — следующей задачей.
  const o = useDeferredValue(useStore(selectOverview))
  const lang = useStore((s) => s.lang)
  const t = useAnT()
  if (o.weekday.length !== 7) return null
  const max = Math.max(...o.weekday, 1)
  const top = o.weekday.indexOf(Math.max(...o.weekday))
  const days = weekdaysShort(lang)

  return (
    <Widget
      title={t('w.rhythm')}
      action={<span className="truncate text-[13px] font-semibold text-ink-subtle">{t('w.rhythm_note')}</span>}
      delay={200}
      bodyClass="px-4 pb-3.5 pt-4"
    >
      <div className="flex h-[96px] items-stretch gap-2">
        {o.weekday.map((v, i) => (
          <div key={i} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
            <div className="flex w-full flex-1 items-end">
              <span
                className={`an-rise block w-full rounded-t-[9px] rounded-b-[4px] ${i === top ? 'bg-expense' : 'bg-expense/30'}`}
                style={{ height: `${Math.max(4, (v / max) * 100)}%`, animationDelay: `${i * 30}ms` }}
              />
            </div>
            <span className={`text-[11px] font-bold ${i === top ? 'text-ink' : 'text-ink-subtle'}`}>{days[i]}</span>
          </div>
        ))}
      </div>
      <div className="mt-2.5 truncate text-center text-[12px] text-ink-subtle" {...MASK}>
        {t('w.rhythm_peak', { day: weekdaysFull(lang)[top].toLowerCase(), avg: formatMoney(Math.round(o.weekday[top]), o.currency) })}
      </div>
    </Widget>
  )
})

/**
 * Постоянные траты: что списывается каждый месяц, когда следующий раз — и во
 * что это обходится за год. Последняя строка и есть смысл блока: годовую сумму
 * подписок и аренды люди почти никогда не держат в голове.
 */
export const RecurringWidget = memo(function RecurringWidget() {
  const rows = useStore(selectRecurring)
  const currency = useStore(selectAnalyticsCurrency)
  const lang = useStore((s) => s.lang)
  const t = useAnT()
  const catName = useCatName()
  if (rows.length === 0) return null
  const monthly = rows.reduce((a, r) => a + r.amount, 0)

  return (
    <Widget title={t('w.recurring')} delay={220} bodyClass="px-4 py-1">
      {rows.map((r, i) => (
        <div key={r.id} className={`flex items-center gap-3 py-3 ${i ? 'border-t border-hairline' : ''}`}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: r.color + '26', color: r.color }}>
            <CategoryIcon id={r.icon} size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-bold text-ink" {...MASK}>
              {r.title || catName(r.categoryId, r.name)}
            </div>
            <div className={`text-[12px] ${r.due ? 'font-semibold text-expense-deep dark:text-expense' : 'text-ink-subtle'}`}>
              {r.due ? t('w.rec_due') : t('w.rec_next', { date: dayjs(r.nextDay).format(lang === 'en' ? 'MMMM D' : 'D MMMM') })}
            </div>
          </div>
          <span className="shrink-0 text-[14px] font-extrabold tabular text-ink" {...MASK}>
            {formatMoney(r.amount, r.currency)}
          </span>
        </div>
      ))}
      <div className="grid grid-cols-2 border-t border-hairline py-3">
        <div>
          <div className="caption-sm text-ink-subtle">{t('w.rec_month')}</div>
          <div className="text-[15px] font-extrabold tabular text-ink" {...MASK}>
            {formatMoney(Math.round(monthly), currency)}
          </div>
        </div>
        <div className="text-right">
          <div className="caption-sm text-ink-subtle">{t('w.rec_year')}</div>
          <div className="text-[15px] font-extrabold tabular text-ink" {...MASK}>
            {formatMoney(Math.round(monthly * 12), currency)}
          </div>
        </div>
      </div>
    </Widget>
  )
})

/** Крупные покупки периода — без аренды и подписок; запись открывается на правку. */
export const BiggestWidget = memo(function BiggestWidget({ onEditTx }: { onEditTx: (t: Transaction) => void }) {
  // Ниже первого экрана: при смене периода сначала обновляется видимое
  // (герой, показатели, подсказки), этот виджет — следующей задачей.
  const o = useDeferredValue(useStore(selectOverview))
  const all = useStore(selectAllCategories)
  const lang = useStore((s) => s.lang)
  const t = useAnT()
  const catName = useCatName()
  const byId = useMemo(() => new Map(all.map((c) => [c.id, c])), [all])
  if (o.biggest.length === 0) return null

  return (
    <Widget title={t('w.biggest')} delay={240} bodyClass="px-4 py-1">
      {o.biggest.map((x, i) => {
        const c = byId.get(x.categoryId)
        const color = c?.color ?? '#8A968F'
        return (
          <button
            key={x.id}
            type="button"
            onClick={() => {
              hapticTap()
              onEditTx(x)
            }}
            className={`flex w-full items-center gap-3 py-3 text-left active:opacity-70 ${i ? 'border-t border-hairline' : ''}`}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: color + '26', color }}>
              <CategoryIcon id={c?.icon ?? 'other'} size={18} />
            </span>
            <span className="min-w-0 flex-1" {...MASK}>
              <span className="block truncate text-[14px] font-bold text-ink">{x.note?.trim() || catName(x.categoryId, c?.name ?? x.categoryId)}</span>
              <span className="block text-[12px] text-ink-subtle">{dayjs(x.date).format(lang === 'en' ? 'MMMM D' : 'D MMMM')}</span>
            </span>
            <span className="shrink-0 text-[14px] font-extrabold tabular text-ink" {...MASK}>
              {formatMoney(x.amount, x.currency ?? o.currency)}
            </span>
          </button>
        )
      })}
    </Widget>
  )
})

/**
 * «Спроси Кошель» — готовые вопросы по своим цифрам: про то, что выбилось
 * (подсказки), и про бюджет. Нажатие открывает ассистента и сразу спрашивает.
 */
export const AskWidget = memo(function AskWidget({ onAsk }: { onAsk: (q: string) => void }) {
  // Ниже первого экрана: при смене периода сначала обновляется видимое
  // (герой, показатели, подсказки), этот виджет — следующей задачей.
  const o = useDeferredValue(useStore(selectOverview))
  const mode = useDeferredValue(useStore((s) => s.period.mode))
  const t = useAnT()
  const catName = useCatName()

  const questions = useMemo(() => {
    const out: string[] = []
    const spike = o.insights.find((i) => i.kind === 'spike' || i.kind === 'trend')
    if (spike && 'categoryId' in spike) out.push(t('q.why', { name: catName(spike.categoryId, spike.name) }))
    if (o.insights.some((i) => i.kind === 'weekend')) out.push(t('q.weekend'))
    out.push(t('q.save'))
    out.push(mode === 'month' && !o.complete ? t('q.per_day') : t('q.compare'))
    return out.slice(0, 3)
  }, [o.insights, o.complete, mode]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Widget title={t('w.ask')} delay={260} bodyClass="p-2">
      <div className="flex items-center gap-2 px-2.5 pb-1.5 pt-1.5 text-[12.5px] text-ink-subtle">
        <MessageCircle size={14} strokeWidth={2.4} />
        {t('w.ask_hint')}
      </div>
      {questions.map((q) => (
        <button
          key={q}
          type="button"
          onClick={() => {
            hapticTap()
            onAsk(q)
          }}
          className="press-soft flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left active:bg-surface-sunken/60"
        >
          <span className="min-w-0 flex-1 text-[14px] font-semibold leading-snug text-ink" {...MASK}>
            {q}
          </span>
          <ArrowUpRight size={16} strokeWidth={2.4} className="shrink-0 text-ink-subtle" />
        </button>
      ))}
    </Widget>
  )
})
