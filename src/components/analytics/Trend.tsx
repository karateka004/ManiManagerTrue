import { memo, useMemo, useState } from 'react'
import { useStore, selectAnalyticsCurrency } from '../../store/transactions'
import { selectTrend, type TrendBucket, type TrendGranularity } from '../../store/analytics'
import { dayjs, formatMoney } from '../../lib/format'
import { MASK } from '../../lib/clarity'
import { GlassSeg, ScrubLayer, Widget } from './Glass'
import { useScrub } from './useScrub'
import { useAnT } from './text'

type Gran = Exclude<TrendGranularity, 'day'>
const W = 340
const H = 132

/**
 * Динамика: расходы столбиками, доходы линией, пунктир — средний расход по
 * завершённым периодам (неполный текущий его не занижает). Палец по графику
 * показывает месяц (неделю, год) целиком: потрачено, пришло, разница.
 */
export const TrendWidget = memo(function TrendWidget() {
  const [gran, setGran] = useState<Gran>('month')
  const buckets = useStore((s) => selectTrend(s, gran))
  const currency = useStore(selectAnalyticsCurrency)
  const lang = useStore((s) => s.lang)
  const t = useAnT()

  const now = Date.now()
  const stats = useMemo(() => {
    const done = buckets.filter((b) => b.end <= now && (b.expense > 0 || b.income > 0))
    const avg = done.length ? done.reduce((a, b) => a + b.expense, 0) / done.length : 0
    const max = Math.max(1, ...buckets.map((b) => Math.max(b.expense, b.income)), avg)
    return { avg, max, empty: buckets.every((b) => b.expense === 0 && b.income === 0) }
  }, [buckets, now])

  const n = buckets.length
  const y = (v: number) => H - (v / stats.max) * (H - 10)
  const cx = (i: number) => ((i + 0.5) / n) * W
  const incomeLine = useMemo(() => {
    if (!buckets.some((b) => b.income > 0) || n < 2) return ''
    const pts = buckets.map((b, i) => [cx(i), y(b.income)] as [number, number])
    return pts
      .map((p, i) => {
        if (!i) return `M${p[0].toFixed(1)} ${p[1].toFixed(1)}`
        const q = pts[i - 1]
        const mx = ((q[0] + p[0]) / 2).toFixed(1)
        return `C${mx} ${q[1].toFixed(1)} ${mx} ${p[1].toFixed(1)} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`
      })
      .join('')
  }, [buckets, stats.max, n]) // eslint-disable-line react-hooks/exhaustive-deps

  const title = (b: TrendBucket) =>
    gran === 'month'
      ? dayjs(b.start).format('MMMM YYYY')
      : gran === 'year'
        ? dayjs(b.start).format('YYYY')
        : `${dayjs(b.start).format('D MMM')} – ${dayjs(b.end - 43_200_000).format('D MMM')}`

  const scrub = useScrub(
    n,
    (i) => {
      const b = buckets[i]
      if (!b) return null
      const lines: { text: string; tone?: 'good' | 'bad' | 'muted' }[] = [{ text: '−' + formatMoney(Math.round(b.expense), currency), tone: 'bad' }]
      if (b.income > 0) lines.push({ text: '+' + formatMoney(Math.round(b.income), currency), tone: 'good' })
      return { x: (i + 0.5) / n, y: y(b.expense) / H, title: title(b).replace(/^./, (c) => c.toUpperCase()), lines, color: '#E97373' }
    },
    true,
  )

  const per = gran === 'month' ? t('w.trend_avg_month') : gran === 'week' ? t('w.trend_avg_week') : t('w.trend_avg_year')
  const every = n > 8 ? 2 : 1

  return (
    <Widget
      title={t('w.trend')}
      delay={180}
      action={
        <GlassSeg
          value={gran}
          onChange={setGran}
          options={[
            { id: 'week', label: t('w.gran_week') },
            { id: 'month', label: t('w.gran_month') },
            { id: 'year', label: t('w.gran_year') },
          ]}
        />
      }
      bodyClass="px-4 pb-3 pt-4"
    >
      {stats.empty ? (
        <div className="py-10 text-center text-[13px] text-ink-subtle">{t('w.trend_empty')}</div>
      ) : (
        <>
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-[17px] font-extrabold tabular text-ink" {...MASK}>
                {stats.avg > 0 ? t('w.trend_avg', { amount: formatMoney(Math.round(stats.avg), currency) }) : '—'}
              </div>
              <div className="caption-sm text-ink-subtle">{per}</div>
            </div>
            <div className="flex shrink-0 items-center gap-3 text-[11.5px] font-semibold text-ink-subtle">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-[3px] bg-expense" />
                {t('w.expense')}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-3 rounded-full bg-income" />
                {t('w.income')}
              </span>
            </div>
          </div>

          <div key={gran} className="relative mt-4" style={{ height: H, touchAction: 'pan-y' }} data-swipe-ignore {...scrub.handlers}>
            {/* Столбики — HTML (ровные скругления при любой ширине), линии — SVG. */}
            <div className="absolute inset-0 flex items-end">
              {buckets.map((b, i) => {
                const current = b.end > now
                return (
                  <div key={b.start} className="flex h-full flex-1 items-end justify-center">
                    <span
                      className={`an-rise block w-[56%] max-w-[26px] rounded-t-[7px] rounded-b-[3px] ${current ? 'bg-expense/45' : 'bg-expense'}`}
                      style={{ height: `${Math.max(1.5, (b.expense / stats.max) * ((H - 10) / H) * 100)}%`, animationDelay: `${Math.min(i, 12) * 28}ms` }}
                    />
                  </div>
                )
              })}
            </div>
            <svg aria-hidden viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" fill="none" className="absolute inset-0 h-full w-full">
              {stats.avg > 0 && (
                <line x1="0" x2={W} y1={y(stats.avg)} y2={y(stats.avg)} stroke="currentColor" strokeOpacity=".35" strokeDasharray="4 5" vectorEffect="non-scaling-stroke" className="text-ink" />
              )}
              {incomeLine && <path d={incomeLine} stroke="#3CA37B" strokeWidth="2.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
            </svg>
            <ScrubLayer s={scrub} />
          </div>
          <div className="mt-1.5 flex">
            {buckets.map((b, i) => (
              <span
                key={b.start}
                className={`flex-1 truncate text-center text-[10px] font-semibold ${b.end > now ? 'text-ink' : 'text-ink-subtle'}`}
              >
                {i % every === (n - 1) % every ? (lang === 'en' ? b.label : b.label.replace('.', '')) : ''}
              </span>
            ))}
          </div>
        </>
      )}
    </Widget>
  )
})
