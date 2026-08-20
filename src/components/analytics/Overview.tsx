import { memo, useMemo } from 'react'
import { AlertTriangle, CalendarDays, Lightbulb, TrendingDown, TrendingUp } from 'lucide-react'
import {
  useStore,
  selectOverview,
  selectAllCategories,
  selectRecurring,
  selectAnalyticsCurrency,
} from '../../store/transactions'
import type { Insight } from '../../lib/overview'
import { dayjs, formatMoney } from '../../lib/format'
import { useCatName, useT, weekdaysAccusative, weekdaysFull, weekdaysShort } from '../../lib/i18n'
import { CategoryIcon } from '../icons/CategoryIcon'
import { FlowChart } from './FlowChart'

/**
 * «Обзор» — первый сегмент Аналитики: не ещё один график, а ответ на вопрос
 * «это много или мало?». Всё считает один селектор (см. selectOverview), здесь
 * только отрисовка — иначе каждая подписка добавляла бы шанс разбудить дерево.
 */
export const Overview = memo(function Overview() {
  const o = useStore(selectOverview)
  const t = useT()

  if (o.spent === 0 && o.income === 0) {
    return (
      <div className="mx-4 mt-4 rounded-3xl bg-surface-raised px-6 py-10 text-center shadow-soft dark:shadow-soft-dark">
        <div className="text-[15px] font-bold text-ink">{t('ov.empty')}</div>
        <div className="mt-1.5 text-[13px] leading-snug text-ink-subtle">{t('ov.empty_hint')}</div>
      </div>
    )
  }

  return (
    <div>
      <Hero />
      {o.insights.length > 0 && (
        <>
          <SectionTitle>{t('ov.insights')}</SectionTitle>
          <div className="mx-4 rounded-3xl bg-surface-raised shadow-soft dark:shadow-soft-dark">
            {o.insights.map((i, n) => (
              <InsightRow key={i.id} insight={i} first={n === 0} />
            ))}
          </div>
        </>
      )}

      {o.categories.length > 0 && (
        <>
          <SectionTitle>{t('ov.where')}</SectionTitle>
          <FlowChart />
        </>
      )}

      {o.weekday.length === 7 && (
        <>
          <SectionTitle>{t('ov.rhythm')}</SectionTitle>
          <WeekRhythm />
        </>
      )}

      <RecurringBlock />

      {o.biggest.length > 0 && (
        <>
          <SectionTitle>{t('ov.biggest')}</SectionTitle>
          <Biggest />
        </>
      )}
    </div>
  )
})

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-6 mb-2 mt-6 text-[11px] font-extrabold uppercase tracking-wider text-ink-subtle">{children}</div>
  )
}

/* ---------- Герой: сумма, изменение, кривая по дням, прогноз ---------- */

function Hero() {
  const o = useStore(selectOverview)
  const t = useT()

  // Округляем ДО выбора стрелки: «0 %» со стрелкой вверх выглядит ошибкой
  const delta = o.deltaPct === null ? null : Math.round(o.deltaPct)
  const down = (delta ?? 0) < 0
  // Подпись прогноза — последний день периода, а не его граница (граница = полночь следующего)
  const lastDay = dayjs(o.endKey).subtract(1, 'day').format('D MMMM')

  return (
    <div className="mx-4 mt-3 overflow-hidden rounded-3xl bg-surface-raised shadow-soft dark:shadow-soft-dark">
      <div className="px-5 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-ink-subtle">{t('ov.spent')}</div>
            <div className="tabular mt-1 text-[32px] font-extrabold leading-none tracking-tight text-ink">
              {formatMoney(o.spent, o.currency)}
            </div>
          </div>
          {delta !== null &&
            (delta === 0 ? (
              <span className="shrink-0 rounded-full bg-surface-sunken px-2.5 py-1 text-[12px] font-extrabold text-ink-subtle">
                {t('ov.as_usual')}
              </span>
            ) : (
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
            ))}
        </div>
        {o.mixedCurrency ? (
          <div className="mt-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-expense-deep dark:text-expense">
            <AlertTriangle size={13} strokeWidth={2.4} />
            {t('ov.mixed')}
          </div>
        ) : (
          o.prevSpent !== null &&
          o.prevSpent > 0 && (
            <div className="mt-1.5 text-[12px] text-ink-subtle">
              {t('ov.prev_was', { amount: formatMoney(o.prevSpent, o.currency) })}
            </div>
          )
        )}
      </div>

      {o.daily.length > 0 && <Sparkline />}

      {o.forecast.length > 0 && (
        <div className="border-t border-ink/[.07] px-5 py-4 dark:border-ink/10">
          <div className="flex items-baseline justify-between gap-3">
            {/* Подпись ужимается, число — никогда: на девятизначной сумме оно
                переносилось на вторую строку и карточка выглядела сломанной */}
            <span className="min-w-0 truncate text-[13px] font-semibold text-ink-muted">
              {t('ov.forecast_to', { date: lastDay })}
            </span>
            <span className="tabular shrink-0 whitespace-nowrap text-[17px] font-extrabold text-ink">
              ≈ {formatMoney(Math.round(o.projected), o.currency)}
            </span>
          </div>
          <ForecastBar />
          <div className="mt-2 flex justify-between text-[12px] text-ink-subtle">
            <span className="min-w-0 truncate">
              {o.budget > 0
                ? t('ov.limit', { amount: formatMoney(o.budget, o.currency) })
                : t('ov.per_day', { amount: formatMoney(Math.round(o.perDay), o.currency) })}
            </span>
            <span className="shrink-0">{t('ov.days_left', { n: o.daysTotal - o.daysPassed })}</span>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Полоса «потрачено / доедет по прогнозу». Знаменатель — лимит, если он задан,
 * иначе сам прогноз: без лимита полоса показывает, какую часть месяца вы уже
 * прожили деньгами.
 */
function ForecastBar() {
  const o = useStore(selectOverview)
  const total = o.budget > 0 ? Math.max(o.budget, o.projected) : o.projected || 1
  const spentPct = Math.min(100, (o.spentToDate / total) * 100)
  const projPct = Math.min(100, (o.projected / total) * 100)

  return (
    <div className="relative mt-2.5 h-2 overflow-hidden rounded-full bg-surface-sunken">
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 rounded-full"
        style={{
          width: `${projPct}%`,
          background:
            'repeating-linear-gradient(115deg, rgb(233 115 115 / .40) 0 5px, rgb(233 115 115 / .12) 5px 10px)',
        }}
      />
      <span aria-hidden className="absolute inset-y-0 left-0 rounded-full bg-expense" style={{ width: `${spentPct}%` }} />
    </div>
  )
}

/** Кривая расходов по дням: сплошная — прожитое, пунктир — прогноз. */
function Sparkline() {
  const o = useStore(selectOverview)

  const paths = useMemo(() => {
    const W = 320
    const H = 64
    const all = [...o.daily.slice(0, o.daysPassed), ...o.forecast]
    if (all.length < 2) return null
    const max = Math.max(...all, 1)
    const x = (i: number) => (i / (all.length - 1)) * W
    const y = (v: number) => H - 5 - (v / max) * (H - 12)

    // Сглаживание по средней точке: кубика на каждый сегмент, без внешних библиотек.
    const curve = (pts: [number, number][]) =>
      pts
        .map((p, i) => {
          if (!i) return `M${p[0].toFixed(1)} ${p[1].toFixed(1)}`
          const q = pts[i - 1]
          const mx = ((q[0] + p[0]) / 2).toFixed(1)
          return `C${mx} ${q[1].toFixed(1)} ${mx} ${p[1].toFixed(1)} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`
        })
        .join('')

    const pts = all.map((v, i) => [x(i), y(v)] as [number, number])
    const solidCount = Math.max(2, o.daysPassed)
    const solid = pts.slice(0, solidCount)
    const dashed = o.forecast.length ? pts.slice(solidCount - 1) : []
    const solidPath = curve(solid)

    return {
      W,
      H,
      area: `${solidPath} L${x(solidCount - 1).toFixed(1)} ${H} L0 ${H} Z`,
      solid: solidPath,
      dashed: dashed.length > 1 ? curve(dashed) : '',
    }
  }, [o.daily, o.forecast, o.daysPassed])

  if (!paths) return null

  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${paths.W} ${paths.H}`}
      preserveAspectRatio="none"
      fill="none"
      className="mt-3 block h-16 w-full"
    >
      <defs>
        <linearGradient id="ov-spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#E97373" stopOpacity=".34" />
          <stop offset="1" stopColor="#E97373" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={paths.area} fill="url(#ov-spark)" />
      <path d={paths.solid} stroke="#E97373" strokeWidth="2.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      {paths.dashed && (
        <path
          d={paths.dashed}
          stroke="#E97373"
          strokeWidth="2"
          strokeDasharray="3 5"
          strokeOpacity=".55"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  )
}

/* ---------- Наблюдения ---------- */

const INSIGHT_ICON = {
  spike: TrendingUp,
  weekday: CalendarDays,
  budget: Lightbulb,
  pace: Lightbulb,
} as const

function InsightRow({ insight, first }: { insight: Insight; first: boolean }) {
  const o = useStore(selectOverview)
  const t = useT()
  const catName = useCatName()
  const lang = useStore((s) => s.lang)
  const money = (v: number) => formatMoney(Math.round(v), o.currency)

  const Icon = INSIGHT_ICON[insight.kind]
  let color = '#3CA37B'
  let title = ''
  let text = ''

  switch (insight.kind) {
    case 'spike':
      color = insight.color
      title = t('ov.i.spike.title', { name: catName(insight.categoryId, insight.name), amount: money(insight.amount) })
      text = t('ov.i.spike.text', { pct: Math.round(insight.pct) })
      break
    case 'weekday':
      color = '#6FA8DC'
      title = t('ov.i.weekday.title', { day: weekdaysFull(lang)[insight.day] })
      text = t('ov.i.weekday.text', {
        avg: money(insight.avg),
        minAvg: money(insight.minAvg),
        minDay: weekdaysAccusative(lang)[insight.minDay],
      })
      break
    case 'budget':
      color = insight.over ? '#E97373' : '#3CA37B'
      title = t(insight.over ? 'ov.i.budget_over.title' : 'ov.i.budget_ok.title')
      text = t(insight.over ? 'ov.i.budget_over.text' : 'ov.i.budget_ok.text', { rest: money(insight.rest) })
      break
    case 'pace':
      color = insight.over ? '#E97373' : '#3CA37B'
      title = t(insight.over ? 'ov.i.pace_up.title' : 'ov.i.pace_down.title')
      text = t(insight.over ? 'ov.i.pace_up.text' : 'ov.i.pace_down.text', { diff: money(insight.diff) })
      break
  }

  return (
    <div className={`flex gap-3 px-4 py-3.5 ${first ? '' : 'border-t border-ink/[.06] dark:border-ink/[.09]'}`}>
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[13px]"
        style={{ background: color + '28', color }}
      >
        <Icon size={19} strokeWidth={2.2} />
      </span>
      <div className="min-w-0">
        <div className="text-[14px] font-bold leading-tight text-ink">{title}</div>
        <div className="mt-0.5 text-[12.5px] leading-snug text-ink-subtle">{text}</div>
      </div>
    </div>
  )
}

/* ---------- Ритм недели ---------- */

function WeekRhythm() {
  const o = useStore(selectOverview)
  const lang = useStore((s) => s.lang)
  const days = weekdaysShort(lang)
  const max = Math.max(...o.weekday, 1)

  return (
    <div className="mx-4 rounded-3xl bg-surface-raised px-4 py-4 shadow-soft dark:shadow-soft-dark">
      {/* Столбик занимает отдельную область с собственной высотой: процент
          обязан считаться от родителя с высотой, иначе график схлопывается */}
      <div className="flex h-[92px] items-stretch gap-2">
        {o.weekday.map((v, i) => {
          const top = v === max
          return (
            <div key={i} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
              <div className="flex w-full flex-1 items-end">
                <span
                  aria-hidden
                  className={`block w-full rounded-t-lg rounded-b ${top ? 'bg-expense' : 'bg-expense/35'}`}
                  style={{ height: `${Math.max(4, (v / max) * 100)}%` }}
                />
              </div>
              <span className={`text-[11px] font-bold ${top ? 'text-ink' : 'text-ink-subtle'}`}>{days[i]}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ---------- Регулярные платежи ---------- */

/**
 * Постоянные траты одним списком с итогом за год.
 *
 * Смысл блока — в последней строке. Люди редко держат в голове, во что
 * обходятся подписки и аренда за двенадцать месяцев, пока не увидят сумму
 * целиком; на этом выросли приложения вроде Rocket Money. Банк нам для этого
 * не нужен: повтор одинаковой суммы в одной категории виден и в ручных записях.
 */
function RecurringBlock() {
  const rows = useStore(selectRecurring)
  const currency = useStore(selectAnalyticsCurrency)
  const t = useT()
  const catName = useCatName()

  if (rows.length === 0) return null
  const monthly = rows.reduce((a, r) => a + r.amount, 0)

  return (
    <>
      <SectionTitle>{t('ov.recurring')}</SectionTitle>
      <div className="mx-4 rounded-3xl bg-surface-raised px-4 shadow-soft dark:shadow-soft-dark">
      {rows.map((r, i) => (
        <div
          key={r.id}
          className={`flex items-center gap-3 py-3 ${i ? 'border-t border-ink/[.06] dark:border-ink/[.09]' : ''}`}
        >
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
            <div className={`text-[12px] ${r.due ? 'font-semibold text-expense-deep dark:text-expense' : 'text-ink-subtle'}`}>
              {r.due ? t('ov.recurring_due') : t('ov.recurring_next', { date: dayjs(r.nextDay).format('D MMMM') })}
            </div>
          </div>
          <span className="tabular shrink-0 text-[14px] font-extrabold text-ink">
            {formatMoney(r.amount, r.currency)}
          </span>
        </div>
      ))}
      <div className="flex items-center justify-between border-t border-ink/[.06] py-3 dark:border-ink/[.09]">
        <span className="text-[13px] font-semibold text-ink-muted">{t('ov.recurring_year')}</span>
        <span className="tabular text-[15px] font-extrabold text-ink">
          {formatMoney(Math.round(monthly * 12), currency)}
        </span>
      </div>
      </div>
    </>
  )
}

/* ---------- Крупнейшие траты ---------- */

function Biggest() {
  const o = useStore(selectOverview)
  const all = useStore(selectAllCategories)
  const catName = useCatName()
  const byId = useMemo(() => new Map(all.map((c) => [c.id, c])), [all])

  return (
    <div className="mx-4 rounded-3xl bg-surface-raised px-4 py-1 shadow-soft dark:shadow-soft-dark">
      {o.biggest.map((tx, i) => {
        const c = byId.get(tx.categoryId)
        const color = c?.color ?? '#8A968F'
        return (
          <div
            key={tx.id}
            className={`flex items-center gap-3 py-3 ${i ? 'border-t border-ink/[.06] dark:border-ink/[.09]' : ''}`}
          >
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
              style={{ background: color + '28', color }}
            >
              <CategoryIcon id={c?.icon ?? 'other'} size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-semibold text-ink">
                {tx.note?.trim() || catName(tx.categoryId, c?.name ?? tx.categoryId)}
              </div>
              <div className="text-[12px] text-ink-subtle">{dayjs(tx.date).format('D MMMM')}</div>
            </div>
            <span className="tabular shrink-0 text-[14px] font-extrabold text-ink">
              {formatMoney(tx.amount, tx.currency ?? o.currency)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
