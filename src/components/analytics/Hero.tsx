import { memo, useMemo, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useStore } from '../../store/transactions'
import { selectOverview } from '../../store/analytics'
import { dayjs, formatMoney } from '../../lib/format'
import { daysWord } from '../../lib/i18n'
import { AnimatedMoney } from '../ui/Odometer'
import { DeltaChip } from '../ui/DeltaChip'
import { MASK } from '../../lib/clarity'
import { Widget, ScrubLayer } from './Glass'
import { useScrub } from './useScrub'
import { monthIn, useAnT } from './text'

const DAY = 86_400_000

/** День периода по номеру — через Date: в сутки перевода часов не 24 часа. */
function dayAt(startKey: number, i: number): number {
  const d = new Date(startKey)
  d.setDate(d.getDate() + i)
  return +d
}

/**
 * Главный виджет: сколько потрачено, с чем сравнить, как шли дни и куда
 * придём. Сравнение — честное: неполный период — с прошлым к тому же дню.
 */
export const HeroWidget = memo(function HeroWidget() {
  const o = useStore(selectOverview)
  const mode = useStore((s) => s.period.mode)
  const lang = useStore((s) => s.lang)
  const t = useAnT()
  const money = (v: number) => formatMoney(Math.round(v), o.currency)

  const delta = o.deltaPct === null ? null : Math.round(o.deltaPct)
  const prevStart = new Date(o.startKey)
  // Подпись сравнения — по виду периода; у «за всё время» сравнивать не с чем.
  let cmp = ''
  if (o.prevSpentFull !== null && o.prevSpentFull > 0 && mode !== 'all') {
    const full = o.complete
    if (mode === 'month') {
      const m = new Date(prevStart.getFullYear(), prevStart.getMonth() - 1, 1).getMonth()
      cmp = t(full ? 'hero.cmp.month' : 'hero.cmp.month_to', { month: monthIn(lang, m), amount: money(full ? o.prevSpentFull : o.prevSpent ?? 0) })
    } else if (mode === 'week') cmp = t(full ? 'hero.cmp.week' : 'hero.cmp.week_to', { amount: money(full ? o.prevSpentFull : o.prevSpent ?? 0) })
    else if (mode === 'day') cmp = t('hero.cmp.day', { amount: money(o.prevSpentFull) })
    else if (mode === 'year') cmp = t(full ? 'hero.cmp.year' : 'hero.cmp.year_to', { year: prevStart.getFullYear() - 1, amount: money(full ? o.prevSpentFull : o.prevSpent ?? 0) })
    else cmp = t(full ? 'hero.cmp.range' : 'hero.cmp.range_to', { amount: money(full ? o.prevSpentFull : o.prevSpent ?? 0) })
  }
  // Записанное будущим числом (аренда 25-го — сегодня): крупная сумма его
  // включает, а сравнение «к этому дню» — нет. Без этой строки 49 000 рядом с
  // «≈» к 19 000 прошлого месяца выглядело ошибкой.
  const ahead = o.complete ? 0 : o.spent - o.spentToDate

  const left = o.income - o.spent
  const lastDay = dayjs(o.endKey - DAY / 2).format(lang === 'en' ? 'MMMM D' : 'D MMMM')

  return (
    <Widget hero bodyClass="overflow-hidden" data-tour="spent">
      <div className="px-5 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="caption text-ink-subtle">{t('hero.spent')}</div>
            <div className="mt-1.5 text-[38px] font-extrabold leading-none tracking-tight text-ink max-[359px]:text-[32px]">
              <AnimatedMoney value={o.spent} currency={o.currency} />
            </div>
          </div>
          {delta !== null &&
            (Math.abs(delta) < 1 ? (
              <span className="shrink-0 rounded-full bg-surface-sunken/70 px-2.5 py-1 text-[12px] font-extrabold text-ink-subtle">≈</span>
            ) : (
              <DeltaChip delta={delta} />
            ))}
        </div>
        {o.mixedCurrency ? (
          <div className="mt-2 flex items-center gap-1.5 text-[12.5px] font-semibold text-expense-deep dark:text-expense">
            <AlertTriangle size={13} strokeWidth={2.4} />
            {t('hero.mixed')}
          </div>
        ) : (
          cmp && (
            <div className="mt-2 truncate text-[12.5px] text-ink-subtle" {...MASK}>
              {cmp}
            </div>
          )
        )}
        {ahead > 0.5 && (
          <div className={`${cmp || o.mixedCurrency ? 'mt-0.5' : 'mt-2'} truncate text-[12.5px] text-ink-subtle`} {...MASK}>
            {t('hero.ahead', { amount: money(ahead) })}
          </div>
        )}
      </div>

      <DayChart />

      {/* Доходы и остаток — то же, что на Главной, но за выбранный период. */}
      <div className="grid grid-cols-2 border-t border-hairline">
        <Stat label={t('hero.income')} tone={o.income > 0 ? 'good' : 'muted'}>
          {o.income > 0 ? '+' + money(o.income) : t('hero.no_income')}
        </Stat>
        <Stat label={t('hero.left')} tone={o.income === 0 ? undefined : left >= 0 ? 'good' : 'bad'} divider>
          {o.income > 0 ? formatMoney(Math.round(left), o.currency, { sign: true }) : '—'}
        </Stat>
      </div>

      {o.forecast.length > 0 && (
        <div className="border-t border-hairline px-5 pb-4 pt-3.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-[13px] font-semibold text-ink-muted" {...MASK}>
              {t('hero.forecast', { date: lastDay, amount: money(o.projected) })}
            </span>
            <span className="shrink-0 text-[12px] text-ink-subtle">
              {t('hero.days_left', { n: o.daysTotal - o.daysPassed, days: daysWord(lang, o.daysTotal - o.daysPassed) })}
            </span>
          </div>
          <ForecastBar />
          {o.budget > 0 && (
            <div className="mt-1.5 text-right text-[12px] text-ink-subtle" {...MASK}>
              {t('hero.limit', { amount: money(o.budget) })}
            </div>
          )}
        </div>
      )}
    </Widget>
  )
})

function Stat({ label, children, tone, divider }: { label: string; children: ReactNode; tone?: 'good' | 'bad' | 'muted'; divider?: boolean }) {
  return (
    <div className={`min-w-0 px-5 py-3 ${divider ? 'border-l border-hairline' : ''}`}>
      <div className="caption-sm text-ink-subtle">{label}</div>
      <div
        className={`mt-0.5 truncate text-[15px] font-extrabold tabular ${
          tone === 'good'
            ? 'text-income-deep dark:text-income-light'
            : tone === 'bad'
              ? 'text-expense-deep dark:text-expense-soft'
              : tone === 'muted'
                ? 'text-ink-subtle'
                : 'text-ink'
        }`}
        {...MASK}
      >
        {children}
      </div>
    </div>
  )
}

/**
 * Полоса «потрачено / доедет по прогнозу». Знаменатель — лимит, если он задан
 * и прогноз в него влезает, иначе сам прогноз.
 */
function ForecastBar() {
  const o = useStore(selectOverview)
  const total = o.budget > 0 ? Math.max(o.budget, o.projected) : o.projected || 1
  const spentPct = Math.min(100, (o.spentToDate / total) * 100)
  const projPct = Math.min(100, (o.projected / total) * 100)
  const limitPct = o.budget > 0 ? Math.min(100, (o.budget / total) * 100) : null
  const over = o.budget > 0 && o.projected > o.budget
  return (
    <div className="relative mt-2.5 h-2.5 rounded-full bg-surface-sunken/80">
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 rounded-full"
        style={{
          width: `${projPct}%`,
          background: over
            ? 'repeating-linear-gradient(115deg, rgb(233 115 115 / .55) 0 5px, rgb(233 115 115 / .18) 5px 10px)'
            : 'repeating-linear-gradient(115deg, rgb(var(--brand-400) / .5) 0 5px, rgb(var(--brand-400) / .16) 5px 10px)',
        }}
      />
      <span
        aria-hidden
        className={`absolute inset-y-0 left-0 rounded-full ${over ? 'bg-expense' : 'bg-brand-500'}`}
        style={{ width: `${spentPct}%` }}
      />
      {limitPct !== null && limitPct < 100 && (
        <span aria-hidden className="absolute -top-1 bottom-[-4px] w-0.5 rounded-full bg-ink/60" style={{ left: `calc(${limitPct}% - 1px)` }} />
      )}
    </div>
  )
}

const W = 340
const H = 84

/**
 * Траты по дням периода: сплошная — прожитое, пунктир — прогноз. Палец по
 * графику показывает день и сумму (useScrub).
 */
function DayChart() {
  const o = useStore(selectOverview)
  const lang = useStore((s) => s.lang)
  const t = useAnT()

  const series = useMemo(() => [...o.daily.slice(0, o.daysPassed), ...o.forecast], [o.daily, o.daysPassed, o.forecast])
  const n = series.length
  const max = Math.max(...series, 1)

  const paths = useMemo(() => {
    if (n < 2) return null
    const x = (i: number) => (i / (n - 1)) * W
    const y = (v: number) => H - 6 - (v / max) * (H - 18)
    // Сглаживание по средней точке: кубика на каждый сегмент.
    const curve = (pts: [number, number][]) =>
      pts
        .map((p, i) => {
          if (!i) return `M${p[0].toFixed(1)} ${p[1].toFixed(1)}`
          const q = pts[i - 1]
          const mx = ((q[0] + p[0]) / 2).toFixed(1)
          return `C${mx} ${q[1].toFixed(1)} ${mx} ${p[1].toFixed(1)} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`
        })
        .join('')
    const pts = series.map((v, i) => [x(i), y(v)] as [number, number])
    const solidCount = Math.max(2, Math.min(n, o.daysPassed))
    const solid = curve(pts.slice(0, solidCount))
    const dashed = solidCount < n ? curve(pts.slice(solidCount - 1)) : ''
    return { solid, dashed, area: `${solid} L${x(solidCount - 1).toFixed(1)} ${H} L0 ${H} Z` }
  }, [series, n, max, o.daysPassed])

  const scrub = useScrub(n, (i) => {
    const v = series[i]
    if (v === undefined) return null
    const key = dayAt(o.startKey, i)
    const future = i >= o.daysPassed
    return {
      x: n > 1 ? i / (n - 1) : 0.5,
      y: (H - 6 - (v / max) * (H - 18)) / H,
      title: dayjs(key).format(lang === 'en' ? 'ddd, MMM D' : 'dd, D MMMM'),
      lines: [{ text: (future ? t('hero.forecast_tip') + ' ≈ ' : '') + formatMoney(Math.round(v), o.currency), tone: future ? 'muted' : 'bad' }],
      color: '#E97373',
    }
  })

  if (!paths) return <div className="h-3" />

  return (
    <div className="relative mt-3 h-[84px]" style={{ touchAction: 'pan-y' }} data-swipe-ignore {...scrub.handlers}>
      <svg aria-hidden viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" fill="none" className="absolute inset-0 h-full w-full">
        <defs>
          <linearGradient id="an-hero-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#E97373" stopOpacity=".32" />
            <stop offset="1" stopColor="#E97373" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={paths.area} fill="url(#an-hero-area)" />
        <path d={paths.solid} stroke="#E97373" strokeWidth="2.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {paths.dashed && (
          <path d={paths.dashed} stroke="#E97373" strokeWidth="2" strokeDasharray="3 5" strokeOpacity=".55" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      <ScrubLayer s={scrub} />
    </div>
  )
}
