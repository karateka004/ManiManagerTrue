import { memo, useDeferredValue, useState, type ComponentType } from 'react'
import {
  AlertTriangle,
  CalendarDays,
  ChevronDown,
  Coffee,
  Flame,
  Gauge,
  LineChart,
  PiggyBank,
  Receipt,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wallet,
  type LucideProps,
} from 'lucide-react'
import { useStore, type PeriodMode } from '../../store/transactions'
import { selectOverview } from '../../store/analytics'
import type { Insight, Overview } from '../../lib/overview'
import { dayjs, formatMoney } from '../../lib/format'
import { daysWord, useCatName, weekdaysAccusative, weekdaysFull } from '../../lib/i18n'
import { hapticSelect } from '../../lib/telegram'
import { MASK } from '../../lib/clarity'
import type { PlanTab } from '../home/BudgetBlock'
import { ActionChip, Widget } from './Glass'
import { monthIn, monthShort, useAnT } from './text'

/** Сколько подсказок видно сразу; остальные — под «Ещё». */
const SHOWN = 3

const ICON: Record<Insight['kind'], ComponentType<LucideProps>> = {
  budget: Gauge,
  overspend: AlertTriangle,
  pace: TrendingUp,
  spike: TrendingUp,
  drop: TrendingDown,
  trend: LineChart,
  one_off: Receipt,
  new_cat: Sparkles,
  weekend: CalendarDays,
  weekday: CalendarDays,
  small: Coffee,
  savings: PiggyBank,
  no_income: Wallet,
  no_spend: PiggyBank,
  peak_day: Flame,
}

const GOOD = '#3CA37B'
const BAD = '#E97373'

export interface InsightActions {
  onCategory: (categoryId: string) => void
  onPlan: (tab: PlanTab) => void
  onAddIncome: () => void
}

/**
 * Подсказки: сверху то, что требует действия (лимит, перерасход), ниже —
 * наблюдения и поводы похвалить. У подсказки про категорию — переход к ней и
 * лимит, у бюджетных — к плану. Считает их lib/overview (веса и правила).
 */
export const InsightsWidget = memo(function InsightsWidget(props: InsightActions) {
  // У нижнего края первого экрана: при смене периода обновляется следующей
  // задачей, после героя и показателей.
  const o = useDeferredValue(useStore(selectOverview))
  const mode = useDeferredValue(useStore((s) => s.period.mode))
  const t = useAnT()
  const [all, setAll] = useState(false)
  if (o.insights.length === 0) return null
  const list = all ? o.insights : o.insights.slice(0, SHOWN)
  const rest = o.insights.length - SHOWN

  return (
    <Widget title={t('w.insights')} bodyClass="px-4 py-1" delay={90}>
      {list.map((i, n) => (
        <Row key={i.id} insight={i} first={n === 0} o={o} mode={mode} {...props} />
      ))}
      {rest > 0 && (
        <button
          type="button"
          onClick={() => {
            hapticSelect()
            setAll((v) => !v)
          }}
          className="press-soft flex w-full items-center justify-center gap-1 border-t border-hairline py-3 text-[13px] font-bold text-ink-muted"
        >
          {all ? t('w.less') : t('w.more', { n: rest })}
          <ChevronDown size={15} strokeWidth={2.6} className={`transition-transform duration-300 ${all ? 'rotate-180' : ''}`} />
        </button>
      )}
    </Widget>
  )
})

function Row({
  insight: i,
  first,
  o,
  mode,
  onCategory,
  onPlan,
  onAddIncome,
}: { insight: Insight; first: boolean; o: Overview; mode: PeriodMode } & InsightActions) {
  const lang = useStore((s) => s.lang)
  const t = useAnT()
  const catName = useCatName()
  const money = (v: number) => formatMoney(Math.round(v), o.currency)
  // С чем сравниваем: «в октябре», «на прошлой неделе», «в 2025 году».
  const start = new Date(o.startKey)
  const back = (k: number) => new Date(start.getFullYear(), start.getMonth() - k, 1)
  const when = () =>
    mode === 'month'
      ? t('i.when.month', { month: monthIn(lang, back(1).getMonth()) })
      : mode === 'week'
        ? t('i.when.week')
        : mode === 'year'
          ? t('i.when.year', { year: start.getFullYear() - 1 })
          : mode === 'day'
            ? t('i.when.day')
            : t('i.when.range')
  const pct = (v: number) => Math.round(v)
  const times = (v: number) => (v >= 10 ? Math.round(v) : Math.round(v * 10) / 10).toLocaleString(lang === 'en' ? 'en' : 'ru')
  // «в 3 раза», «в 12 раз», «в 2,5 раза»: дробное — всегда «раза».
  const timesWord = (v: number) => {
    const n = v >= 10 ? Math.round(v) : Math.round(v * 10) / 10
    if (!Number.isInteger(n)) return t('i.times_few')
    const d = n % 10
    const dd = n % 100
    return d >= 2 && d <= 4 && (dd < 12 || dd > 14) ? t('i.times_few') : t('i.times_many')
  }

  let color = ''
  let title = ''
  let text = ''
  const actions: { label: string; run: () => void; strong?: boolean }[] = []
  const toCategory = (id: string) => actions.push({ label: t('a.more'), run: () => onCategory(id) })
  const toLimit = () => actions.push({ label: t('a.limit'), run: () => onPlan('limits') })

  switch (i.kind) {
    case 'budget':
      color = i.over ? BAD : GOOD
      title = t(i.over ? 'i.budget_over.t' : 'i.budget_ok.t')
      text = t(i.over ? 'i.budget_over.x' : 'i.budget_ok.x', { projected: money(i.projected), rest: money(i.rest), perDay: money(i.perDayLeft) })
      if (i.over) actions.push({ label: t('a.plan'), run: () => onPlan('budget'), strong: true })
      break
    case 'overspend':
      color = BAD
      title = t('i.overspend.t')
      text = t('i.overspend.x', { diff: money(i.diff) })
      actions.push({ label: t('a.plan'), run: () => onPlan('budget') })
      break
    case 'pace':
      color = i.over ? BAD : GOOD
      title = t(i.over ? 'i.pace_up.t' : 'i.pace_down.t')
      text = t(i.over ? 'i.pace_up.x' : 'i.pace_down.x', { diff: money(i.diff), prev: money(i.prev), when: when() })
      break
    case 'spike':
      color = i.color
      title = t('i.spike.t', { name: catName(i.categoryId, i.name), amount: money(i.amount) })
      // Без процента: у строки категории свой — к прошлому периоду, а здесь
      // норма за три периода. Два разных процента у одной категории путают.
      text = t(o.complete ? 'i.spike.x_full' : 'i.spike.x', { usual: money(i.usual) })
      toCategory(i.categoryId)
      toLimit()
      break
    case 'drop':
      color = i.color
      title = t('i.drop.t', { name: catName(i.categoryId, i.name) })
      text = t('i.drop.x', { amount: money(i.amount), usual: money(i.usual) })
      toCategory(i.categoryId)
      break
    case 'trend':
      color = i.color
      title = t(mode === 'month' ? 'i.trend.t.month' : mode === 'week' ? 'i.trend.t.week' : mode === 'year' ? 'i.trend.t.year' : 'i.trend.t', {
        name: catName(i.categoryId, i.name),
      })
      {
        // Три ЗАВЕРШЁННЫХ периода до текущего — подписываем, какие именно:
        // иначе «9 780» читалось как этот месяц, где у категории «как обычно».
        const label = (k: number) =>
          mode === 'month' ? monthShort(lang, back(k).getMonth()) + ' ' : mode === 'year' ? `${start.getFullYear() - k} ` : ''
        text = t('i.trend.x', { a: label(3) + money(i.values[0]), b: label(2) + money(i.values[1]), c: label(1) + money(i.values[2]) })
      }
      toCategory(i.categoryId)
      toLimit()
      break
    case 'one_off':
      color = i.color
      title = t('i.one_off.t', { name: i.note || catName(i.categoryId, i.name), amount: money(i.amount) })
      text = t('i.one_off.x', { share: pct(i.share) })
      toCategory(i.categoryId)
      break
    case 'new_cat':
      color = i.color
      title = t('i.new_cat.t', { name: catName(i.categoryId, i.name) })
      text = t('i.new_cat.x', { amount: money(i.amount) })
      toCategory(i.categoryId)
      break
    case 'weekend':
      title = t('i.weekend.t')
      text = t('i.weekend.x', { weekend: money(i.weekend), weekday: money(i.weekday), ratio: times(i.ratio), word: timesWord(i.ratio) })
      break
    case 'weekday':
      title = t('i.weekday.t', { day: weekdaysFull(lang)[i.day] })
      text = t('i.weekday.x', { avg: money(i.avg), minAvg: money(i.minAvg), minDay: weekdaysAccusative(lang)[i.minDay] })
      break
    case 'small':
      title = t('i.small.t')
      text = t('i.small.x', { count: i.count, limit: money(i.limit), total: money(i.total), share: pct(i.share) })
      break
    case 'savings':
      color = GOOD
      title = t('i.savings.t', { rate: pct(i.rate) })
      text = i.prevRate !== null ? t('i.savings.x_prev', { saved: money(i.saved), prev: pct(i.prevRate) }) : t('i.savings.x', { saved: money(i.saved) })
      break
    case 'no_income':
      title = t('i.no_income.t')
      text = t('i.no_income.x')
      actions.push({ label: t('a.income'), run: onAddIncome, strong: true })
      break
    case 'no_spend':
      color = GOOD
      title = t('i.no_spend.t', { days: i.days, word: daysWord(lang, i.days) })
      text = t('i.no_spend.x')
      break
    case 'peak_day':
      color = BAD
      title = t('i.peak.t', { date: dayjs(i.key).format(lang === 'en' ? 'MMMM D' : 'D MMMM') })
      text = t('i.peak.x', { amount: money(i.amount), times: times(i.times), word: timesWord(i.times) })
      break
  }

  const Icon = ICON[i.kind]
  return (
    <div className={`flex gap-3 py-3.5 ${first ? '' : 'border-t border-hairline'}`}>
      {/* Цвет — только там, где он что-то значит: категория, «хорошо», «плохо». */}
      <span
        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${color ? '' : 'bg-surface-sunken/70'}`}
        style={color ? { background: color + '24', color } : undefined}
      >
        <Icon size={16} strokeWidth={2.4} className={color ? '' : 'text-ink-subtle'} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[14.5px] font-bold leading-snug text-ink" {...MASK}>
          {title}
        </div>
        <div className="mt-0.5 text-[13px] leading-snug text-ink-subtle" {...MASK}>
          {text}
        </div>
        {actions.length > 0 && (
          // На узком экране кнопки встают под значок: иначе «Подробнее» и
          // «Поставить лимит» не помещались в строку и вставали столбиком.
          <div className="mt-2.5 flex flex-wrap gap-2 max-[359px]:-ml-11">
            {actions.map((a) => (
              <ActionChip
                key={a.label}
                strong={a.strong}
                onClick={() => {
                  hapticSelect()
                  a.run()
                }}
              >
                {a.label}
              </ActionChip>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
